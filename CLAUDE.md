# Repository policy — READ FIRST

This repository is PUBLIC. Its entire git history — every commit, from the
first one — is permanently world-readable. Write accordingly.

This is a general-purpose MIT reference library for anyone building
passkey-derived wallets on Stacks and Bitcoin, and it should read that way
throughout.

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
- NEVER rewrite or squash published history to "clean up." The real development
  history is preserved intact; it is part of this project's credibility.

## Scope

This repo contains ONLY the reference library, demo page, and documentation.
The DeOrganized platform integration (backend endpoints, user-model changes,
signup flow) lives in the private platform repos and is NOT developed here.
DeOrganized is this library's test bed, not its subject.

## Workflow

- Diagnose → report → await explicit approval → implement. Spec verification
  items are diagnosis tasks, not build tasks.
- Feature branches for exploration; main receives coherent, reviewed merges.
- Code blocks in reports contain only file contents; commentary goes outside.

## Publishing

- Pre-publish (Windows/OneDrive): pause OneDrive syncing before `npm publish` or
  any build that cleans `dist/` — the prepare/prepublishOnly double-build
  collides with OneDrive file locks (EBUSY on dist files). Resume after.
- A stale npm login surfaces as E404 "not found" on PUT, not 401 — re-login
  (browser + security key; no OTP path on this account) before diagnosing
  further.
