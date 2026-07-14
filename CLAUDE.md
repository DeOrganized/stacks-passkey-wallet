# Repository policy — READ FIRST

This repository is currently PRIVATE but is built to go PUBLIC. It is the
reference-implementation deliverable for a pending DeGrants application
("Passkey Onboarding Wallet — Open Reference Implementation for Stacks").
When the repo is made public, its ENTIRE git history becomes permanently
world-readable and will be reviewed by grant stewards. Therefore: treat every
commit, from the first one, as if it were already public.

## Hard rules

- NEVER commit secrets, API keys, tokens, .env files, or internal service URLs.
  Use .env.example with placeholder values only.
- NEVER copy code from private DeOrganized repos (deorganized, deorganizedapi,
  or any other private repo) into this one. This repo is standalone.
- NEVER copy code from github.com/friedger/passnokkel — it has NO license.
  It is pattern-reference reading only. All implementation here is clean-room
  from the WebAuthn PRF, BIP39, and BIP-32/44 specifications.
- No references to DeOrganized internal infrastructure (Railway URLs, service
  names, internal endpoints) in code, comments, tests, or commit messages.
- Commit messages are public record: clear, professional, no internal context.
- NEVER rewrite or squash published history to "clean up" before going public.
  The real development history is preserved intact; it is part of the
  deliverable's credibility.

## Scope

This repo contains ONLY the reference library, demo page, and documentation
(Part A of the Milestone 1 spec). The DeOrganized platform integration
(Part B — backend endpoints, user-model changes, signup flow) lives in the
private platform repos and is NOT developed here.

## Workflow

- Diagnose → report → await explicit approval → implement. Verification items
  V1–V5 in the M1 spec are diagnosis tasks, not build tasks.
- Feature branches for exploration; main receives coherent, reviewed merges.
- Code blocks in reports contain only file contents; commentary goes outside.
