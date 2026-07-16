# Design decisions

Rationale behind the library's cryptographic and derivation choices. This is the
"why"; the normative, **frozen** contract (exact constants, paths, change policy)
is [`wallet-identity.md`](./wallet-identity.md), which this document defers to
wherever a choice is safety-critical.

## Why HKDF between the PRF output and BIP-39

WebAuthn's PRF extension returns pseudorandom bytes bound to a credential and an
input salt. The authoritative guidance is to treat that output as *input keying
material* (IKM), not as a finished key or as BIP-39 entropy directly. We run it
through HKDF-SHA256 (RFC 5869) before it becomes entropy, for three reasons:

- **Domain separation.** HKDF's `info` parameter binds a fixed context string, so
  the bytes derived here cannot be confused with bytes some other protocol might
  derive from the same PRF output.
- **Universe binding.** HKDF's `salt` binds the PRF salt — the "wallet universe"
  (see below) — so the same passkey under a different app/salt cannot collide.
- **Hygiene.** A KDF is the standard, reviewable way to turn IKM into fixed-length
  key material. Using PRF bytes raw would couple the wallet to authenticator- and
  browser-specific representations we don't control.

The output is 32 bytes → BIP-39 entropy → a 24-word mnemonic, so the result is a
standard BIP-39/32/44 wallet any compatible tool can import. See
`wallet-identity.md` for the exact HKDF parameters and a note on the browser's own
salt pre-hash.

## Salt = wallet universe, and why it's frozen

The PRF salt is the seed of identity: change it and the *same* passkey derives a
*different* mnemonic and different addresses, with no shared funds. We therefore
treat the salt — together with the HKDF parameters, wordlist, and derivation
paths — as a single **frozen wallet-identity definition**. It ships with a version
tag (`stacks-passkey-wallet/v1`) and locked, cross-validated test vectors.

Consequences of this decision:

- The salt is a **parameter** (a host app can define its own isolated universe),
  but the default is fixed and must not drift.
- Any change to a frozen constant is a **major, breaking, wallet-universe change**:
  it bumps the version (`…/v1` → `…/v2`), ships new vectors, and is announced as
  such — never a silent edit, because a silent change would strand every existing
  user on a different, empty wallet.

This "freeze + explicit version bump" policy is what lets a user trust that
re-deriving next year reproduces the same wallet.

## Account 0 only (single-account)

The library derives exactly account 0 on each chain (Stacks `m/44'/5757'/0'/0/0`,
Bitcoin `m/84'/0'/0'/0/0`). Higher account indices are deliberately out of scope
for this milestone:

- **Portability.** Account 0 is the one index where mainstream wallets agree.
  Multi-account derivation has historically been implemented with differing
  conventions, so accounts ≥ 1 can diverge between wallets, while account 0
  restores identically everywhere. (On restore, a wallet may present two accounts
  for one phrase — see the integration guide — but account 0 is identical in both.)
- **A single, stable identity.** The invisible-wallet model is "one passkey → one
  wallet." A single account keeps that mapping unambiguous and the recovery story
  simple.

Multi-account derivation is a possible future addition; it is intentionally not
part of the frozen v1 identity.

## Bitcoin: native SegWit (P2WPKH)

The Bitcoin address is native SegWit (bech32 `bc1q…`, BIP-84, `m/84'/0'/0'/0/0`).
Among the widely supported address types:

- **Native SegWit** has the broadest modern support and the lowest fees of the
  universally-supported types, and it is the account-0 default in the wallets a
  Stacks user is most likely to restore into — so the derived address reproduces
  identically on import, the property the locked vectors verify.
- **Legacy (P2PKH)** and **nested SegWit (P2SH-P2WPKH)** are older and costlier; we
  do not derive them.
- **Taproot (P2TR, `m/86'`)** and ordinals-style derivations are explicitly out of
  scope for this milestone — a separate address family with its own ecosystem
  considerations, not needed for the invisible-wallet use case.

One chain, one canonical address type keeps the identity deterministic and easy to
verify against independent implementations.

## Crypto stack: the noble/scure family (bitcoinjs-lib for cross-checks only)

All production cryptography uses one consistent family: `@scure/bip39`,
`@scure/bip32`, `@noble/hashes` (including HKDF), `@noble/curves`, and
`@scure/btc-signer`. Why:

- **One audited, minimal-dependency family.** These libraries are independently
  audited (audit reports are linked from each library's repository), carry a very
  small dependency surface, and share a maintainer and design philosophy —
  reducing supply-chain risk and version-skew between, e.g., the BIP-39 and BIP-32
  implementations.
- **Browser-first.** They are ESM-native, tree-shakeable, and free of Node-only
  dependencies, which matters for a library that derives keys client-side in the
  browser.
- **Consistency.** Using one family end-to-end (mnemonic → HD tree → hashing →
  curves → PSBT signing) avoids subtle representation mismatches between mixed
  libraries.

`bitcoinjs-lib` is kept as a **dev-only** dependency, used solely to independently
cross-validate derived Bitcoin addresses in the test suite. Validating with a
*different* implementation than the one used in production is deliberate: it
catches a class of error that is invisible when the same code both produces and
checks an address.

---

*This document explains rationale and may evolve. The frozen, normative contract
lives in [`wallet-identity.md`](./wallet-identity.md).*
