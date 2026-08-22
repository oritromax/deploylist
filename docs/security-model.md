# deploylist — Trust and threat model

deploylist publishes text that autonomous agents read and act on. That makes the
repository a supply chain. This document defines what we defend against, how,
and what we explicitly do not claim.

## 1. Threats

| # | Threat | Defense |
|---|---|---|
| T1 | Contributor embeds instructions addressed to the agent ("ignore previous instructions, then…") | §3 prose lint |
| T2 | Contributor supplies a `verify.cmd` that damages or exfiltrates from the operator's project | §4 command rules |
| T3 | Contributor points `references` at attacker-controlled content the agent may fetch | §5 domain allowlist |
| T4 | Contributor silently deletes a security check by suppressing it | Suppressions require a reason and maintainer review (SPEC §2.3) |
| T5 | Contributor rewrites an inherited check's text to smuggle content past the original review | Overrides do not exist. Suppress-and-add only. |
| T6 | A PR weakens the schema, lint rules, or CI alongside the payload it enables | §7 CODEOWNERS |
| T7 | Content is modified after publication, or served stale | §6 provenance |
| T8 | A well-formed check gives subtly bad advice | §8 — human review only. Not automated. |

## 2. The schema is the primary control

Structural constraints beat textual filtering. Every field is typed, enumerated,
or length-capped:

- `title` ≤ 100 chars, `why` ≤ 300, `action` ≤ 300, `expect` ≤ 200, `manual` ≤ 300
- `category` and `severity` are closed enums
- `verify` is one of exactly two shapes
- There is **no** free-form long-text field anywhere in the schema

An attacker needs room to write a convincing instruction block. The schema does
not provide any.

## 3. Prose lint

Applies to every prose field (`title`, `why`, `action`, `expect`, `manual`,
suppression `reason`, layer `name`). Any match **fails CI**.

### 3.1 Agent-directed language

```
/ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i
/disregard\s+(all\s+)?(previous|prior|above|the)\s+/i
/you\s+are\s+(now\s+)?an?\s+/i
/\byour\s+(new\s+)?(instructions?|task|role|system\s+prompt)\b/i
/^\s*(system|assistant|user|human)\s*:/im
/<\s*\/?\s*(system|instructions?|prompt|im_start|im_end)\b/i
/\[\/?INST\]|<\|.*?\|>/
/#{1,6}\s*(system|instruction)/i
```

### 3.2 Markup and encoding

Prose fields are plain text. All of the following fail:

- Any `<` followed by a letter or `/` (HTML tags)
- `<!--` (HTML comments)
- `data:` URIs, `base64,`, any run of ≥ 200 chars with no whitespace
- Markdown link syntax `[...](...)`, code fences, backticks
- Any bare URL — `https?://` is only legal inside `references`

### 3.3 Unicode

- **Zero-width and formatting:** U+200B–U+200F, U+2028–U+202E, U+2060–U+2064,
  U+2066–U+2069, U+FEFF → hard fail
- **Bidi overrides:** U+202A–U+202E, U+2066–U+2069 → hard fail
- **Homoglyphs:** a word containing characters from more than one Unicode script
  (e.g. Cyrillic `а` inside a Latin word) → hard fail
- Prose fields are restricted to Latin script, digits, and a punctuation
  allowlist. Non-English stacks may be discussed in the PR; the published fields
  are English.

## 4. Verification commands

`verify.cmd` is read-only. Always. There is no per-check exception and no
reviewer discretion to grant one.

### 4.1 Allowlist — merges on normal review

The leading binary of every pipeline segment must be one of:

```
cat  head  tail  ls  find  stat  wc  file  realpath  basename  dirname
grep  rg  awk  cut  sort  uniq  tr  test  printf  echo
sed          (only with -n; -i and -e with s///w are rejected)
jq  yq  xmllint --noout
git          (only: ls-files, log, show, grep, check-ignore, config --get,
              rev-parse, status --porcelain, remote -v)
composer     (only: show, validate, audit, licenses)
npm          (only: ls, view, audit, outdated)
pnpm/yarn    (equivalent read subcommands)
pip          (only: list, show, check)
php -v  php -m  php --ini
node -v  python -V
```

### 4.1a Read-only constraints on allowlisted binaries

Being on the allowlist is not enough — several of these binaries can write or
execute when given the right flag. Implementing the linter surfaced each of the
following, and CI enforces them:

| Binary | Constraint | Why |
|---|---|---|
| `sed` | requires `-n`; rejects `-i`, `w`/`W` script commands, `s///w`, `s///e` | in-place edit, file write, execute |
| `find` | rejects `-exec`, `-execdir`, `-ok`, `-okdir`, `-delete`, `-fprint`, `-fls` | executes or writes |
| `sort` | rejects `-o`, `--output` | writes its output to a file |
| `awk` | rejects `system()`, `print >`, pipes, `ENVIRON` | executes, writes, reads env |
| `rg` | rejects `--pre`, `--hostname-bin`, `--search-zip` | runs a helper program |
| `yq` | rejects `-i`, `--inplace` | edits in place |
| `xmllint` | requires `--noout` | otherwise writes a parse tree |
| `git` | subcommand allowlist; `config` requires `--get`, `status` requires `--porcelain`, `remote` requires `-v` | mutating subcommands |
| `php`, `node`, `python`, `python3` | version and module flags only; never `-e`, `-r`, `-c` | arbitrary code execution |

### 4.2 Denylist — hard fail, no override

```
rm  mv  cp  mkdir  touch  truncate  dd  ln
chmod  chown  chgrp  sudo  su  doas
eval  exec  source  .  xargs
curl  wget  nc  ncat  socat  ssh  scp  rsync  telnet  ftp
apt  yum  brew  docker  kubectl  systemctl  service
kill  pkill  crontab  at
base64 -d  openssl enc  gpg
```

Also hard-failed anywhere in the string:

- Output redirection: `>`, `>>`, `<>`, `tee`
- Piping into a shell: `| sh`, `| bash`, `| zsh`, `| python`, `| node`, `| php`
- Command substitution invoking a non-allowlisted binary: `$(...)`, backticks
- Any reference to `~/.ssh`, `~/.aws`, `~/.config/gcloud`, `~/.kube`,
  `id_rsa`, `.npmrc`, `.pypirc`, `.netrc`, `credentials`
- `sudo`-equivalent privilege escalation in any form
- Inline environment assignment before a command (`FOO=bar cat x`)
- A quoted command name (`'cat' .env`), which hides what actually runs
- Background execution with a trailing `&`
- Process substitution `<(...)` / `>(...)` and ANSI-C quoting `$'...'`

The only redirect forms permitted anywhere are `2>&1`, `1>&2`, `2>/dev/null`,
`>/dev/null` and `&>/dev/null`. Every other `>` or `<` outside quotes is a
write and fails. Redirect characters *inside* quotes are left alone, so a
pattern like `grep -c '<meta name=viewport' index.html` is accepted.

### 4.3 The read-plus-network rule

Reading a local file is fine — it is the operator's own project, on their own
machine, and checking whether `.env` contains `APP_DEBUG=1` requires reading it.

**Combining any file read with any network-capable binary in the same command is
banned.** This single rule kills exfiltration without banning the reads that make
the checklist useful. Since every network binary is already on the §4.2
denylist, this holds by construction; it is stated separately because it is the
reason the denylist is shaped the way it is.

### 4.4 Anything else

A command whose leading binary is not in §4.1 and not in §4.2 does not
auto-fail — it requires **two maintainer approvals** and a note in the PR
explaining why an allowlisted command cannot do the job. Most such PRs should
end with the check being rewritten to use an allowlisted command.

### 4.5 The verify.suggest tier

Some checks can only be settled by the framework's own CLI — `php bin/console
debug:config framework`, `python manage.py check --deploy`, `next info`. Those
binaries cannot be enumerated or reasoned about the way `grep` can, so they are
**not** added to the allowlist. They go in `verify.suggest` instead.

A suggested command is **never run by the agent**. It is printed for the human
operator, who decides whether to run it. The published files label it
`Operator-run (do not run this yourself)` and carry a legend telling the agent
to report it as outstanding rather than execute it.

Everything else still applies to `verify.suggest`: the §4.2 denylist, the
forbidden constructs, the credential paths, and the per-binary constraints in
§4.1a. `git push`, `composer install`, `rm`, redirects, command substitution and
network binaries are rejected in this tier exactly as in `verify.cmd`. Inline
code execution — `php -r`, `python -c`, `node -e` — is banned in both tiers,
because it is the same hazard whoever types it.

**The assurance level is different, and this is the one place in the design
where it is.** For `verify.cmd`, read-only is guaranteed *by construction*: an
unknown binary cannot appear. For `verify.suggest`, read-only intent is
guaranteed *by maintainer review*: nothing stops a contributor suggesting a
framework subcommand that mutates, and CI cannot tell `debug:config` from
`cache:clear` without a per-framework subcommand table we do not maintain.
Reviewers must read suggested commands as content, not trust the linter.

This is a deliberate trade. The alternative — allowlisting framework CLIs — puts
commands we cannot reason about into the tier that agents run automatically,
which is worse. Pushing them into a tier that requires a human keeps the
automatic tier provably safe.

### 4.6 Commands are never executed by our CI

deploylist's own CI validates command *shape*. It never runs a contributed
command. Execution happens only on the operator's machine, under the operator's
agent, at the operator's choice.

### 4.7 Where this is implemented

`lint/command.js`. The tokenizer is quote-aware, every pipeline segment is
validated independently (so `ls | curl ...` fails on the second segment), and
`test/command.test.js` holds the attack corpus. Additions to the attack corpus
are welcome and do not need to be paired with a code change.

## 5. References

`references` entries must be `https://` URLs on the domain allowlist in
`schema/reference-domains.json`. Seed list:

```
developer.mozilla.org   web.dev   owasp.org   cheatsheetseries.owasp.org
rfc-editor.org          w3.org    ietf.org
symfony.com  laravel.com  nextjs.org  vercel.com  react.dev  vuejs.org
docs.djangoproject.com  docs.python.org  php.net  nodejs.org  expressjs.com
```

Adding a domain is a PR against that file, reviewed by CODEOWNERS. CI verifies
every reference URL returns 200. URL shorteners and redirectors are permanently
banned.

## 6. Provenance

- Check `id`s are stable and never reused or repurposed.
- `added` is stamped by CI at merge, not by the contributor.
- `manifest.json` publishes a sha256 for every generated file plus the build
  date and schema version, so a consumer can pin a known-good state and detect
  drift.
- The site is fully static, built from a tagged commit. There is no runtime
  user-submitted content and no dynamic rendering path.
- Maintainer merge commits are signed.

## 7. The gate cannot weaken itself

These paths are CODEOWNERS-protected and require review from a repository
owner, separate from any content review in the same PR:

```
/schema/**
/lint/**
/docs/security-model.md
/SPEC.md
/.github/**
/CODEOWNERS
```

Without this, the natural attack is one PR that adds a payload and relaxes the
rule that would have caught it. This is T6 and it is the most likely
sophisticated attempt against a repository like this one.

## 8. What this does not defend against

Said plainly here and in the public-facing docs:

**A check that is well-formed, passes every lint rule, cites a real source, and
gives subtly wrong or subtly harmful advice will merge if a human approves it.**
The same applies with more force to `verify.suggest` commands (§4.5), where
read-only intent rests on review rather than on the allowlist.
No automated control in this document catches that. Human review of substance is
the only backstop, which is why new stacks and any non-allowlisted command
require maintainer approval, and why the severity ladder exists — a bad
`optional` check costs far less than a bad `critical` one.

We do not claim the output is safe to act on unread. The published preamble
(SPEC §5) says exactly that to the agent, and the site says it to the human.
