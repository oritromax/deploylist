## What this adds

<!-- One line. Which stack, and what the check is about. -->

## Contributor checklist

- [ ] The check is true of the whole stack, not just my project.
- [ ] It is authored in the highest layer where it is true (universal, language, or framework).
- [ ] Objective check with a `verify` block, **or** marked `subjective: true` with `severity: optional`.
- [ ] Severity is honest. `critical` means exploitable or data-losing right now.
- [ ] `verify.cmd` is read-only and uses an allowlisted binary (security-model section 4.1).
- [ ] If it needs a framework CLI, it is in `verify.suggest`, not `verify.cmd`, and is read-only in intent.
- [ ] Prose is plain text: no markdown, no HTML, no URLs, no backticks.
- [ ] References are official documentation on the domain allowlist.
- [ ] I did not set `added` — CI stamps it at merge.

## How I verified the command

<!-- What you ran it against, and on which version of the framework. -->

## If this suppresses an inherited check

<!-- Say why the risk is already handled. A suppression is a deletion. -->
