# deploylist

Checklists of what should be true before software ships, published as plain
files at fixed URLs so a coding agent can read them.

## Start here

Give your agent this one link:

```
https://deploy-list.com/llms.txt
```

Or just say it:

> Check this project against https://deploy-list.com/llms.txt

That file is the index. Your agent reads it, works out which stack this project
is built on, fetches the matching checklist, runs the read-only verification
steps, and hands you a report of what it found. You decide what to do about it.

Nothing needs installing. There is no CLI, no account and no configuration —
the URLs are the whole product.

## What it checks

Everything that should be true before a project goes to production: secrets
that should not be in git, debug flags left on, caching and build settings,
meta tags, error pages, logging, accessibility. Not only security, and not only
the basics.

Every check carries a category and a severity, so you can take the whole list
or only the ship-blockers.

## Covered today

| Language | Frameworks |
|---|---|
| JavaScript / TypeScript | Next.js |
| PHP | Laravel, Symfony |
| Python | Django |

Plus a universal layer that applies whatever the project is written in. The
live catalog, always current, is [index.json](https://deploy-list.com/index.json).

## It reports. It does not change anything.

There is no apply mode and there will not be one. The commands an agent runs
are read-only, enforced in CI against an allowlist. Where only your framework's
own CLI can answer a question, deploylist does not run it — it suggests it, and
you decide.

The agent's job ends at a report handed to you. What to fix, and whether to fix
it, is your call: you know your project and your deadline.

## Trust

This repository feeds text to agents working inside other people's codebases,
so it is treated as a supply chain. Every check is schema-constrained with no
free-form field large enough to host injected instructions; prose is linted for
injection shapes, markup and invisible Unicode; agent-run commands are checked
against an allowlist with writes, network access and credential paths
hard-blocked, and anything needing a framework CLI is demoted to a suggestion a
human has to act on; references are domain-allowlisted; and the schema, lint
and CI configuration are owner-protected so a pull request cannot relax the
rule that would have caught it.

**These controls reduce risk. They do not eliminate it.** A well-formed check
that gives subtly wrong advice will pass every automated gate if a human
approves it. Read what your agent reports before acting on it.

Full detail: [docs/security-model.md](docs/security-model.md).

## Contributing

Nobody knows every stack. New checks and new stacks are very welcome — start
with [CONTRIBUTING.md](CONTRIBUTING.md), which covers how layers, ids and
severities work and what the gate will reject.

## License

[MIT](LICENSE). The checklists and the tooling that publishes them are both
covered — use them, fork them, build on them.
