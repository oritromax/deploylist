# Contributing to deploylist

Thanks for helping. This repo feeds text to autonomous agents working on other
people's projects, so the review bar is higher than most checklist repos. The
rules below exist to make contributions *reviewable*, not to make them hard.

Read [SPEC.md](SPEC.md) first. The trust rules are in
[docs/security-model.md](docs/security-model.md).

## The bar for a check

A check must be:

1. **True of the whole stack**, not of your project. If it depends on your
   hosting, your CI, or your team's conventions, it does not belong.
2. **Authored in the right layer.** If it applies to every web project, it goes
   in `universal`, not in your framework file. If it applies to all PHP, it goes
   in `php/index.json`. Duplicating an inherited check is a build error.
3. **Either falsifiable or flagged.** Objective checks need a `verify` block
   whose output settles the question. Judgment calls are welcome, but set
   `subjective: true` and `severity: optional`. CI enforces both directions.
4. **Honestly severity-rated.** `critical` means exploitable or data-losing
   right now. Inflating severity to get attention is the fastest way to make
   the whole list untrustworthy, and it is the most common reason a PR gets
   sent back.

## Writing the fields

- `why` is the **consequence**, not a restatement of the title. "Debug mode
  exposes stack traces and env vars to any visitor" — not "debug mode should be
  off."
- `action` is what the operator does about it, in one or two sentences.
- All prose is **plain text**. No markdown, no HTML, no URLs, no code
  formatting. URLs go in `references`, which is domain-allowlisted.
- `id` is permanent. Once merged it is never reused or repurposed, because
  consumers pin against it.
- Do not set `added` — CI stamps it at merge.

## Writing `verify`

Commands are **read-only, always**. There is no exception and no reviewer
discretion to grant one.

- Prefer a command from the allowlist in security-model §4.1. Those merge on
  normal review.
- Anything outside it needs two maintainer approvals plus a note explaining why
  an allowlisted command cannot do the job. Usually the right outcome is
  rewriting the check.
- The denylist in §4.2 is a hard fail — no writes, no network, no privilege
  escalation, no credential paths.
- **If only the framework's CLI can settle it, use `verify.suggest`.**
  `php bin/console debug:config framework`, `python manage.py check --deploy`,
  `next info` and friends are not on the allowlist and will not be added. A
  suggested command is printed for the operator and never run by the agent.
  Keep it read-only in intent — `debug:config`, not `cache:clear` — because in
  this tier that is enforced by the reviewer reading it, not by the linter.
- If no command can settle it, use `verify.manual` with a short instruction for
  the human, or mark the check `subjective`.

## Suppressing an inherited check

A framework layer may suppress a check it genuinely covers better:

```json
"suppressions": [
  { "id": "universal.gitignore-env", "reason": "Symfony's skeleton .gitignore already excludes .env.local; replaced by php.symfony.env-local-ignored." }
]
```

The `reason` is required and must say **why the risk is already handled**, not
just that the check is annoying. Every suppression gets maintainer review — a
suppression is a deletion, and quietly deleting a security check is a threat we
explicitly model.

There is no way to rewrite an inherited check's text. Suppress it and add your
own; that produces a diff a reviewer can actually read.

## PR shape

- One check, or one coherent group of checks, per PR. Easier to review, easier
  to revert.
- A brand-new stack is its own PR and needs maintainer review.
- A new stack also needs a link on the landing page, which is hand-written at
  `site/index.html`. The build copies that file as-is rather than generating
  it, so the page is yours to lay out; a test fails if it is missing a stack
  that is published, or links one that is not.
- Say in the PR body how you verified the command works, on what version.

## Running the gate locally

```
npm install
npm run lint     # schema, prose, commands, references, structure, composition
npm test         # the gate's own test suite
npm run build    # emit dist/, refuses input that does not lint
npm run check    # all three
```

`npm run lint -- --check-links` additionally fetches every reference. That one
is network-dependent and is not part of the merge gate; see below.
CI runs the same commands, and never executes a contributed verification command.

## CI gates

A PR merges only when all of these pass:

| Gate | Checks |
|---|---|
| Schema | Validates against `schema/layer.schema.json` |
| Path | `id` matches the file's location |
| Prose lint | Injection shapes, markup, encoding, Unicode (security-model §3) |
| Command lint | Allowlist / denylist / read-only invariant (§4); `suggest` is denylist-checked but not allowlist-checked |
| References | `https://`, on the domain allowlist |
| Composition | Resolves cleanly; no duplicate ids; every suppression targets a real inherited check |
| Subjectivity | `subjective: true` ⇒ `severity: optional`; otherwise `verify` present |

CI never executes a contributed command. It validates shape only.

Whether a reference still resolves is deliberately **not** one of these gates.
It answers a different question, on a different clock: your change cannot break
a link that a documentation site moved last month, and a gate that fails for
reasons outside the contributor's control gets ignored. A scheduled workflow
fetches every reference weekly and opens an issue when one has rotted. A host
that rate-limits the checker is recorded as a warning, never as rot.

## Protected paths

Changes to `schema/`, `lint/`, `docs/security-model.md`, `SPEC.md`,
`.github/`, and `CODEOWNERS` require a repository owner's review, separate from
any content review in the same PR. A PR cannot relax the rule that would have
caught it.

## What we will turn down

- Checks that are really preferences, submitted at `high` or `critical`.
- Checks with a `verify` that mutates anything, however harmless it looks.
- Advice to fetch and run remote content, in any form.
- Vendor or product recommendations. "Use structured logging" is a check;
  "use $VENDOR for logging" is not.
- Anything we cannot verify against the framework's own documentation.
