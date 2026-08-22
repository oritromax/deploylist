# deploylist

Pre-deployment checklists for web projects, one per stack, at stable URLs an
LLM agent can fetch.

```
https://deploy-list.com/php/symfony.md
https://deploy-list.com/javascript/nextjs.md
https://deploy-list.com/python/django.md
```

Point your agent at `https://deploy-list.com/llms.txt` and it will find the file
for your stack, run the read-only verification steps, and hand you a report.

## What it checks

Everything that should be true before a project goes live — secrets that should
not be in git, debug flags that should be off, caching and build settings,
meta tags, error pages, logging, accessibility. Not only security, and not only
the basics.

Each check carries a category and a severity, so you can take the whole list or
just the ship-blockers.

## It reports, it does not change anything

The commands an agent runs are read-only, enforced in CI against an allowlist.
Where only your framework's own CLI can answer a question, deploylist does not
run it — it suggests it, and you decide. Either way the agent's job ends at a
findings report handed to you. What to fix, and whether to fix it, is your call
— you know your project and your deadline.

## Trust

This repository feeds text to agents working on other people's codebases, so it
is treated as a supply chain. Every check is schema-constrained with no
free-form field large enough to host injected instructions; prose is linted for
injection shapes, markup and invisible Unicode; agent-run commands are checked
against an allowlist with writes, network access and credential paths
hard-blocked, and anything that needs a framework CLI is demoted to a
suggestion a human has to act on;
references are domain-allowlisted; and the schema, lint and CI configuration are
owner-protected so a pull request cannot relax the rule that would have caught
it.

**These controls reduce risk. They do not eliminate it.** A well-formed check
that gives subtly wrong advice will pass every automated gate if a human
approves it. Read what your agent reports before acting on it.

Full detail: [docs/security-model.md](docs/security-model.md).

## Contributing

Nobody knows every stack. New checks and new stacks are very welcome —
start with [CONTRIBUTING.md](CONTRIBUTING.md), and read [SPEC.md](SPEC.md)
for how layers, ids and severities work.
