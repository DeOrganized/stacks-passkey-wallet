# External builder evaluations

This milestone included evaluation of the implementation by at least two external Stacks builders, with supporting evidence. This page lists each evaluation and links the public record of it. The evidence is the public record itself; the descriptions below summarize what that record shows.

## Rapha-btc: review of the library (Pillar, Juice)

- **What:** an independent review of `stacks-passkey-wallet` v0.1.0, filed as [issue #1](https://github.com/DeOrganized/stacks-passkey-wallet/issues/1), "Review feedback: provider-custody trust model, PRF matrix coverage, Stacks transaction signing", opened 2026-07-16.
- **Points raised:**
  1. Synced passkeys mean the passkey provider's account security is part of the wallet's security perimeter; the docs should say so in a trust-model statement.
  2. Cross-device, cross-provider byte-identical PRF output is the design's load-bearing assumption; the support matrix needed hand-verified rows and a manual verification checklist until browser tests exist. The reviewer offered device coverage across iOS, macOS, Android and Linux.
  3. Stacks transaction signing was missing; it should follow the same derive-sign-discard pattern as message signing, with post-conditions as a first-class part of the API.
- **What changed because of it:**
  - Points 1 and 2: the verification checklist (`docs/prf-verification-checklist.md`) and the matrix cross-links landed in [PR #3](https://github.com/DeOrganized/stacks-passkey-wallet/pull/3) (merged 2026-07-17); provider-custody language is in the library's security documentation.
  - Point 3: `signStacksTransaction` shipped in **v0.4.0** (2026-09-05) with derive-sign-discard, an origin-address check, and refusal of Allow-mode transactions unless explicitly opted out; see the [v0.4.0 release](https://github.com/DeOrganized/stacks-passkey-wallet/releases/tag/v0.4.0).
  - Device testing: on 2026-08-14 a wallet created on a laptop was signed into from an iPhone via iCloud sync, the first organic cross-device confirmation (`docs/prf-verification-checklist.md`; see also [hardening.md](hardening.md)).
- *Relationship, for transparency:* this review was filed before any working relationship. Since October 2026, DeOrganized has worked with Rapha on the user experience of Juice's staking pages.

## Skullcoin Strike (Xenitron): design partner for transaction signing

- **What:** Skullcoin Strike, a browser game whose players hold real assets, is adopting the library as its wallet layer and served as design partner for the `signStacksTransaction` API, worked in public in [issue #12](https://github.com/DeOrganized/stacks-passkey-wallet/issues/12), "signStacksTransaction — API design (design partner: Skullcoin Strike)", opened 2026-08-07.
- **Decisions recorded in that issue:** one generic signer, with the caller building the unsigned transaction and the library signing it; no convenience wrapper; no sponsored or network option, since the transaction itself is the single source of truth for both; a standard transaction returns a txid, while a sponsored one returns an origin-signed result with no txid; an origin-address check before any signature; derive-sign-discard with nothing secret returned; wallet-identity constants frozen.
- **Public partnership record:** [`builds-with-skullcoin`](https://github.com/DeOrganized/builds-with-skullcoin) (MIT): playbook, device matrix and integration notes.
- **Outcome:** the design shipped as v0.4.0 with frozen signing vectors.
- Skullcoin's team (`proofofgame`) commented on the thread four times between 2026-08-07 and 2026-08-10, closing with "no further API or operational-model questions".

## Xtrata (JimdotBTC): evaluation in progress (additional)

- [`builds-with-xtrata`](https://github.com/DeOrganized/builds-with-xtrata): a public partnership playbook for passkey wallets in Xtrata's apps.
- Xtrata reviewed the shipped v0.4.0 code and posted an integration canary on [issue #12](https://github.com/DeOrganized/stacks-passkey-wallet/issues/12) (2026-09-12).

## How to verify

Every item above is public: the issue threads, pull requests, releases and partnership repositories can be read directly. Issue and release links are pinned to their numbers and tags.
