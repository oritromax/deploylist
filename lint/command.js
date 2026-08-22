// Command lint — implements docs/security-model.md section 4.
//
// verify.cmd is read-only, always. There is no per-check exception and no
// reviewer discretion to grant one. This module enforces that by construction:
// a command is rejected unless every pipeline segment starts with an
// allowlisted binary used in a read-only way.
//
// deploylist CI never executes a contributed command. This validates shape.

/** Structures that are never permitted, checked before tokenizing. */
const FORBIDDEN_CONSTRUCTS = [
  [/`/, 'command substitution via backticks'],
  [/\$\(/, 'command substitution'],
  [/\$\{/, 'parameter expansion'],
  [/<\(|>\(/, 'process substitution'],
  [/\$'/, 'ANSI-C quoting'],
];

/** The only redirect forms permitted. Everything else is a write. */
const ALLOWED_REDIRECTS = new Set(['2>&1', '1>&2', '2>/dev/null', '>/dev/null', '&>/dev/null']);

/** Section 4.2. Hard fail, no override. */
const DENIED = new Map([
  ['rm', 'writes'], ['mv', 'writes'], ['cp', 'writes'], ['mkdir', 'writes'],
  ['touch', 'writes'], ['truncate', 'writes'], ['dd', 'writes'], ['ln', 'writes'],
  ['tee', 'writes'], ['install', 'writes'], ['shred', 'writes'],
  ['chmod', 'changes permissions'], ['chown', 'changes ownership'], ['chgrp', 'changes ownership'],
  ['sudo', 'escalates privilege'], ['su', 'escalates privilege'], ['doas', 'escalates privilege'],
  ['eval', 'executes constructed input'], ['exec', 'executes'], ['source', 'executes a file'],
  ['.', 'executes a file'], ['xargs', 'executes constructed input'],
  ['sh', 'executes'], ['bash', 'executes'], ['zsh', 'executes'], ['fish', 'executes'],
  ['curl', 'reaches the network'], ['wget', 'reaches the network'], ['nc', 'reaches the network'],
  ['ncat', 'reaches the network'], ['socat', 'reaches the network'], ['ssh', 'reaches the network'],
  ['scp', 'reaches the network'], ['rsync', 'reaches the network'], ['telnet', 'reaches the network'],
  ['ftp', 'reaches the network'], ['dig', 'reaches the network'], ['host', 'reaches the network'],
  ['ping', 'reaches the network'], ['openssl', 'reaches the network and decodes payloads'],
  ['apt', 'mutates the system'], ['apt-get', 'mutates the system'], ['yum', 'mutates the system'],
  ['dnf', 'mutates the system'], ['brew', 'mutates the system'], ['pacman', 'mutates the system'],
  ['docker', 'mutates the system'], ['kubectl', 'mutates the system'],
  ['systemctl', 'mutates the system'], ['service', 'mutates the system'],
  ['kill', 'signals processes'], ['pkill', 'signals processes'], ['killall', 'signals processes'],
  ['crontab', 'schedules execution'], ['at', 'schedules execution'],
  ['base64', 'decodes payloads'], ['gpg', 'decodes payloads'], ['xxd', 'decodes payloads'],
]);

const NETWORK_BINARIES = new Set(
  [...DENIED].filter(([, why]) => why.includes('network')).map(([name]) => name));

/** Paths that must never appear in a verification command. Section 4.2. */
const CREDENTIAL_PATHS = [
  '.ssh', '.aws', '.config/gcloud', '.kube', '.docker/config.json',
  'id_rsa', 'id_ed25519', '.npmrc', '.pypirc', '.netrc', '.git-credentials',
  'credentials', '.pgpass', '.my.cnf',
];

const ok = () => [];

/** Section 4.1, plus the read-only constraints each binary needs to stay read-only. */
const ALLOWED = new Map([
  ['cat', ok], ['head', ok], ['tail', ok], ['ls', ok], ['stat', ok], ['wc', ok],
  ['file', ok], ['realpath', ok], ['basename', ok], ['dirname', ok], ['printf', ok],
  ['echo', ok], ['test', ok], ['cut', ok], ['tr', ok], ['uniq', ok], ['comm', ok],
  ['grep', ok], ['egrep', ok], ['fgrep', ok], ['true', ok], ['false', ok],

  ['rg', (a) => flagBan(a, ['--pre', '--hostname-bin', '--search-zip'], 'rg', 'can execute a helper program')],
  ['sort', (a) => flagBan(a, ['-o', '--output'], 'sort', 'writes its output to a file')],
  ['yq', (a) => flagBan(a, ['-i', '--inplace', '--in-place'], 'yq', 'edits the file in place')],
  ['jq', (a) => flagBan(a, ['--run-tests'], 'jq', 'runs arbitrary test input')],
  ['xmllint', (a) => a.includes('--noout') ? [] : ['xmllint requires --noout'],],

  ['sed', sedRules],
  ['find', findRules],
  ['awk', awkRules], ['gawk', awkRules], ['mawk', awkRules],

  ['git', subcommandRules('git', {
    'ls-files': null, 'log': null, 'show': null, 'grep': null, 'check-ignore': null,
    'rev-parse': null, 'cat-file': null, 'ls-tree': null, 'describe': null,
    'config': '--get', 'status': '--porcelain', 'remote': '-v',
  })],
  ['composer', subcommandRules('composer', {
    show: null, validate: null, audit: null, licenses: null, diagnose: null })],
  ['npm', subcommandRules('npm', { ls: null, list: null, view: null, info: null, audit: null, outdated: null })],
  ['pnpm', subcommandRules('pnpm', { ls: null, list: null, view: null, audit: null, outdated: null })],
  ['yarn', subcommandRules('yarn', { list: null, info: null, audit: null, outdated: null, why: null })],
  ['pip', subcommandRules('pip', { list: null, show: null, check: null, freeze: null })],
  ['pip3', subcommandRules('pip3', { list: null, show: null, check: null, freeze: null })],

  ['php', flagOnly('php', ['-v', '--version', '-m', '--ini', '-i'])],
  ['node', flagOnly('node', ['-v', '--version'])],
  ['python', flagOnly('python', ['-V', '--version'])],
  ['python3', flagOnly('python3', ['-V', '--version'])],
]);

/**
 * Interpreter rules for the verify.suggest tier only.
 *
 * As a verify.cmd, `php` may only report its own version and modules — anything
 * else is arbitrary code execution. As a suggestion for the operator, running
 * the framework's own console is the entire point, so a script path is fine.
 * Inline code stays banned in both tiers: `php -r` and `python -c` are the same
 * hazard whoever types them.
 */
const INLINE_CODE_FLAGS = ['-r', '-e', '--eval', '-c', '--command', '-E', '--exec'];

const noInlineCode = (name) => (args) => {
  const hit = args.find((a) => INLINE_CODE_FLAGS.includes(a) || INLINE_CODE_FLAGS.some((f) => a.startsWith(`${f}=`)));
  return hit ? [`${name} ${hit} executes inline code, which is not permitted even as a suggestion`] : [];
};

const SUGGEST_RULES = new Map([
  ['php', noInlineCode('php')],
  ['node', noInlineCode('node')],
  ['python', noInlineCode('python')],
  ['python3', noInlineCode('python3')],
  ['ruby', noInlineCode('ruby')],
  ['perl', noInlineCode('perl')],
]);

function flagBan(args, banned, name, why) {
  const hit = args.find((a) => banned.some((b) => a === b || a.startsWith(`${b}=`)));
  return hit ? [`${name} ${hit} is not permitted: it ${why}`] : [];
}

function flagOnly(name, allowed) {
  return (args) => {
    const bad = args.filter((a) => !allowed.includes(a));
    return bad.length ? [`${name} may only be used with ${allowed.join(', ')}; got ${bad.join(' ')}`] : [];
  };
}

function subcommandRules(name, table) {
  return (args) => {
    const sub = args.find((a) => !a.startsWith('-'));
    if (!sub) return [`${name} requires a read-only subcommand (${Object.keys(table).join(', ')})`];
    if (!(sub in table)) {
      return [`${name} ${sub} is not on the read-only subcommand allowlist (${Object.keys(table).join(', ')})`];
    }
    const required = table[sub];
    if (required && !args.some((a) => a === required || a.startsWith(`${required}=`))) {
      return [`${name} ${sub} requires ${required} to stay read-only`];
    }
    return [];
  };
}

function sedRules(args) {
  const errors = [];
  if (args.some((a) => a === '-i' || a.startsWith('-i') && !a.includes('n') || a === '--in-place')) {
    errors.push('sed -i edits files in place');
  }
  if (!args.some((a) => a.startsWith('-') && a.includes('n'))) {
    errors.push('sed requires -n so it only prints what it is asked to print');
  }
  for (const a of args) {
    if (/(^|[^\\])[wW]\s*\//.test(a) || /s\/.*\/.*\/[a-z]*w/.test(a)) {
      errors.push(`sed script writes to a file: ${JSON.stringify(a)}`);
    }
    if (/(^|[^\\])e\b/.test(a) && /s\/.*\/.*\/[a-z]*e/.test(a)) {
      errors.push(`sed script executes its result: ${JSON.stringify(a)}`);
    }
  }
  return errors;
}

function findRules(args) {
  const banned = ['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint',
    '-fprintf', '-fls', '-printf0'];
  const hit = args.find((a) => banned.includes(a));
  return hit ? [`find ${hit} executes or writes`] : [];
}

function awkRules(args) {
  const errors = [];
  for (const a of args) {
    if (/system\s*\(/.test(a)) errors.push('awk program calls system()');
    if (/\bprint(f)?\b[^;]*>/.test(a)) errors.push('awk program redirects output to a file');
    if (/\|\s*(?:getline|"\s*)/.test(a)) errors.push('awk program pipes to or from a command');
    if (/ENVIRON/.test(a)) errors.push('awk program reads the environment');
  }
  return errors;
}

/** Quote-aware tokenizer. Emits words, operators, and permitted redirects. */
function tokenize(cmd) {
  const tokens = [];
  let i = 0;
  let word = null;

  const flush = () => { if (word !== null) { tokens.push(word); word = null; } };
  const push = (ch, quoted) => {
    if (word === null) word = { type: 'word', value: '', quoted: false };
    word.value += ch;
    if (quoted) word.quoted = true;
  };

  while (i < cmd.length) {
    const ch = cmd[i];

    if (/\s/.test(ch)) { flush(); i++; continue; }

    if (ch === "'") {
      const end = cmd.indexOf("'", i + 1);
      if (end === -1) return { error: 'unbalanced single quote' };
      for (const c of cmd.slice(i + 1, end)) push(c, true);
      if (word === null) word = { type: 'word', value: '', quoted: true };
      i = end + 1;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let buf = '';
      while (j < cmd.length && cmd[j] !== '"') {
        if (cmd[j] === '\\' && j + 1 < cmd.length) { buf += cmd[j + 1]; j += 2; continue; }
        buf += cmd[j]; j++;
      }
      if (j >= cmd.length) return { error: 'unbalanced double quote' };
      for (const c of buf) push(c, true);
      if (word === null) word = { type: 'word', value: '', quoted: true };
      i = j + 1;
      continue;
    }

    // Permitted redirect forms are matched whole, before operator handling,
    // because 2>&1 contains characters that are otherwise operators.
    const rest = cmd.slice(i);
    const redirect = [...ALLOWED_REDIRECTS].find((r) => rest.startsWith(r) &&
      (rest.length === r.length || /\s/.test(rest[r.length])));
    if (redirect && word === null) {
      tokens.push({ type: 'redirect', value: redirect, quoted: false });
      i += redirect.length;
      continue;
    }

    if (rest.startsWith('&&') || rest.startsWith('||')) {
      flush(); tokens.push({ type: 'op', value: rest.slice(0, 2) }); i += 2; continue;
    }
    if (ch === '|' || ch === ';') {
      flush(); tokens.push({ type: 'op', value: ch }); i++; continue;
    }
    if (ch === '&') { return { error: 'background execution with & is not permitted' }; }
    if (ch === '>' || ch === '<') {
      return { error: `redirection with ${ch} is not permitted; only 2>&1 and >/dev/null forms are allowed` };
    }
    if (ch === '\\') { i++; if (i < cmd.length) { push(cmd[i], false); i++; } continue; }

    push(ch, false);
    i++;
  }
  flush();
  return { tokens };
}

/**
 * @param {string} cmd
 * @param {string} where dotted path for the message
 * @param {{requireAllowlist?: boolean}} [options]
 *   requireAllowlist false is the `verify.suggest` tier: a command deploylist
 *   never asks an agent to run, offered to the human operator instead. The
 *   denylist, the forbidden constructs, the credential paths and the per-binary
 *   read-only constraints all still apply. Only the "is this binary known to be
 *   read-only" requirement is lifted, because framework CLIs cannot be
 *   enumerated. See docs/security-model.md section 4.5.
 * @returns {string[]}
 */
export function lintCommand(cmd, where, options = {}) {
  const requireAllowlist = options.requireAllowlist !== false;
  const errors = [];
  const at = (m) => `${where}: ${m}`;

  if (typeof cmd !== 'string' || cmd.trim() === '') return [at('is empty')];
  if (cmd.length > 300) errors.push(at('is longer than 300 characters'));

  for (const [re, what] of FORBIDDEN_CONSTRUCTS) {
    if (re.test(cmd)) errors.push(at(`uses ${what}, which is not permitted`));
  }

  for (const path of CREDENTIAL_PATHS) {
    if (cmd.includes(path)) errors.push(at(`references a credential path: ${path}`));
  }

  const { tokens, error } = tokenize(cmd);
  if (error) { errors.push(at(error)); return errors; }

  // Split into pipeline segments. Every segment is validated independently.
  const segments = [[]];
  for (const t of tokens) {
    if (t.type === 'op') segments.push([]);
    else segments[segments.length - 1].push(t);
  }

  for (const segment of segments) {
    const words = segment.filter((t) => t.type === 'word');
    if (words.length === 0) {
      if (segment.length) errors.push(at('has a pipeline segment with no command'));
      continue;
    }
    const [head, ...rest] = words;
    const binary = head.value.replace(/^.*\//, '');
    const args = rest.map((t) => t.value);

    if (head.quoted) {
      errors.push(at(`quotes the command name ${JSON.stringify(head.value)}, which hides what runs`));
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(head.value)) {
      errors.push(at('sets an environment variable inline, which is not permitted'));
      continue;
    }
    if (DENIED.has(binary)) {
      const why = DENIED.get(binary);
      const extra = NETWORK_BINARIES.has(binary)
        ? '; combining a file read with a network binary is the exfiltration path section 4.3 bans'
        : '';
      errors.push(at(`uses ${binary}, which is denied because it ${why}${extra}`));
      continue;
    }
    const rule = (requireAllowlist ? undefined : SUGGEST_RULES.get(binary)) ?? ALLOWED.get(binary);
    if (!rule) {
      if (requireAllowlist) {
        errors.push(at(
          `uses ${binary}, which is not on the read-only allowlist. Either rewrite the ` +
          `check against an allowlisted command, or move it to verify.suggest so the ` +
          `operator decides whether to run it (security-model sections 4.4 and 4.5)`));
      }
      continue;
    }
    errors.push(...rule(args).map(at));
  }

  return errors;
}

/**
 * The verify.suggest tier. deploylist never asks an agent to run this; it is
 * printed for the human operator to run if they choose. Read-only intent is
 * guaranteed by maintainer review here, not by construction.
 */
export function lintSuggestedCommand(cmd, where) {
  return lintCommand(cmd, where, { requireAllowlist: false });
}

export const _internals = { tokenize, ALLOWED, DENIED, SUGGEST_RULES, CREDENTIAL_PATHS, ALLOWED_REDIRECTS };
