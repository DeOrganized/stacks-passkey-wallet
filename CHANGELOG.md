# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Pre-1.0 caveat:** while the library is below 1.0, breaking changes may land in
minor versions. Pin an exact version and read this file before upgrading.

## [Unreleased]

Documentation and packaging only — no library behavior has changed since 0.2.0.

### Changed

- `CHANGELOG.md` is now included in the published npm package.

### Added

- Passkey-provider custody documented in the README trust model: because the
  wallet keys are derived from PRF output, whoever can restore the user's Apple
  or Google account can re-derive the wallet.

## [0.2.0] - 2026-07-17

Two fixes from an independent security review of the derivation and PRF core.
**Mainnet derivation is byte-for-byte unchanged** — the frozen mainnet vectors
were not touched, so existing mainnet wallets re-derive identically.

### Security

- `createPasskey()` now **rejects device-bound authenticators** (Windows Hello,
  most hardware security keys) before any key derivation, by checking the Backup
  Eligibility flag in the attestation authenticator data. Previously these were
  only steered against in guidance copy, so a wallet could still be derived from
  a credential that exists on a single device and cannot be restored through
  synced-passkey behavior. Rejection raises the existing
  `PrfUnsupportedError("device-bound-authenticator")`. If the authenticator data
  cannot be read at all, the credential is rejected conservatively rather than
  assumed syncable.

### Fixed

- **Testnet Bitcoin derivation used the mainnet coin type.** Addresses were
  derived at `m/84'/0'/0'/0/0` but encoded with the testnet HRP, producing
  `tb1…` addresses that no standard testnet wallet reproduces. BIP-84 mandates
  coin type `1'` for testnet/signet/regtest, so testnet now derives at
  `m/84'/1'/0'/0/0`. The signing path derives its key at the same
  network-correct path, so a testnet address and its signing key can no longer
  diverge (which would have made funds unspendable).

  **This changes testnet addresses.** Any testnet address produced by 0.1.0
  differs from the one 0.2.0 produces for the same passkey; testnet funds held
  at a 0.1.0-derived address are reachable only via the old
  `m/84'/0'/0'/0/0` path. Mainnet is unaffected.

### Changed

- **BREAKING:** `deriveBitcoinAccount`, `signBitcoinPsbt` and
  `signBitcoinPsbtWithRoot` take a `"mainnet" | "testnet"` network argument
  instead of a `@scure/btc-signer` network object. This makes the derivation
  path and the address encoder come from a single source so they cannot
  disagree. See [Migrating from 0.1.0](#migrating-from-010) below.
- `deriveAddresses()` is unchanged in signature and in mainnet output, but its
  **testnet** Bitcoin address changes as described under Fixed above.

### Added

- `isSyncedCredential(authData)` — a pure, unit-tested predicate for whether a
  credential is backup-eligible (synced) rather than device-bound. Exposed so
  integrators can apply the same gate at their own `create()` call site. The
  supporting `authenticatorDataFlags(authData)` and `BACKUP_ELIGIBLE_FLAG` are
  exported alongside it.
- `BitcoinNetwork` type (`"mainnet" | "testnet"`).
- Optional `network` parameter on `bitcoinNativeSegwitPath()` and
  `bitcoinTaprootPath()` (defaults to `"mainnet"`, so existing calls are
  unaffected).
- Cross-validated testnet golden vectors at `m/84'/1'/0'/0/0`, alongside the
  existing mainnet vectors.

### Migrating from 0.1.0

Callers that relied on the default (mainnet) need no change. Callers that passed
a network object explicitly should pass a string instead:

```ts
// 0.1.0
import * as btc from "@scure/btc-signer";
deriveBitcoinAccount(root, btc.TEST_NETWORK);
signBitcoinPsbtWithRoot(root, psbt, btc.TEST_NETWORK);
signBitcoinPsbt(prfBytes, psbt, { network: btc.TEST_NETWORK });

// 0.2.0
deriveBitcoinAccount(root, "testnet");
signBitcoinPsbtWithRoot(root, psbt, "testnet");
signBitcoinPsbt(prfBytes, psbt, { network: "testnet" });
```

An explicit `btc.NETWORK` becomes `"mainnet"`. The `@scure/btc-signer` import is
no longer needed for network selection.

If your integration creates passkeys, also confirm your error handling covers
`PrfUnsupportedError("device-bound-authenticator")` from `createPasskey()` — on
0.1.0 that ceremony would have succeeded on a device-bound authenticator.

## [0.1.0] - 2026-07-15

Initial release — the Milestone-1 reference library (Part A).

### Added

- Deterministic derivation pipeline: WebAuthn PRF output → HKDF-SHA256 →
  BIP-39 24-word mnemonic → BIP-32 HD root, with the Stacks account at
  `m/44'/5757'/0'/0/0` and the Bitcoin native-SegWit account at
  `m/84'/0'/0'/0/0` — byte-identical to Leather's and Xverse's account-0
  defaults.
- Frozen wallet identity (default salt `stacks-passkey-wallet/v1`, HKDF
  parameters, entropy length) with golden vectors cross-validated against
  `@stacks/wallet-sdk` and `bitcoinjs-lib`.
- Signing: Stacks message signatures and Bitcoin PSBT signing, deriving and
  discarding key material internally.
- PRF layer: passkey create/evaluate wrappers, support detection with a hard
  iOS 18.4 floor, and provider steering for Windows users toward Google
  Password Manager.
- Gated, reveal-once seed-phrase export for backup.
- Standalone browser demo and the initial documentation set (setup, integration
  guide, PRF support matrix).

[Unreleased]: https://github.com/DeOrganized/stacks-passkey-wallet/compare/33d6f9d...main
[0.2.0]: https://github.com/DeOrganized/stacks-passkey-wallet/compare/98ff59c...33d6f9d
[0.1.0]: https://github.com/DeOrganized/stacks-passkey-wallet/commits/98ff59c
