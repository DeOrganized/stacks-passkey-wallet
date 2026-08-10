# Wallet-identity definition (FROZEN)

This document defines the deterministic mapping from a WebAuthn PRF output to a
wallet. It is the single most safety-critical contract in the library: everything
below is **frozen**. Changing any part of it changes every wallet the library
derives, and is a **breaking change that creates a new, incompatible wallet
universe** (existing users would derive different, empty wallets). The one narrow
exception — correcting a test-network path that no wallet could reproduce — is
spelled out in the [change policy](#change-policy).

## The pipeline

```
passkey PRF output (32 bytes)
        │
        ▼  HKDF-SHA256   (RFC 5869; ikm = PRF bytes, salt = utf8(PRF salt), info = fixed)
BIP-39 entropy (32 bytes)
        │
        ▼  BIP-39        (@scure/bip39)
mnemonic (24 words)
        │
        ▼  BIP-39 seed → BIP-32 master node   (@scure/bip32, no passphrase)
HD root
        │
        ├─▶ m/44'/5757'/0'/0/0  → Stacks address   (compressed key, @stacks/transactions)
        ├─▶ m/84'/0'/0'/0/0     → Bitcoin address  (native SegWit P2WPKH, @scure/btc-signer)
        └─▶ m/84'/1'/0'/0/0     → Bitcoin testnet  (BIP-84 coin type 1' — see Networks)
```

## The frozen constants

Defined in [`src/wallet-identity.ts`](../src/wallet-identity.ts):

| Constant | Value | Meaning |
|---|---|---|
| `DEFAULT_SALT` | `stacks-passkey-wallet/v1` | Default PRF salt. Overridable per app (see below). |
| `PRF_BYTES_LENGTH` | `32` | Required PRF output length. |
| HKDF hash | `SHA-256` | HKDF (RFC 5869) hash. |
| HKDF `ikm` | the 32 PRF bytes | Input keying material. |
| HKDF `salt` | `utf8(PRF salt)` | Binds the salt/universe into the KDF. |
| `HKDF_INFO` | `stacks-passkey-wallet/bip39-entropy/v1` | Fixed context string. |
| `ENTROPY_BYTES` | `32` | HKDF output → BIP-39 entropy → 24-word mnemonic. |
| `BIP39_MNEMONIC_WORDS` | `24` | Mnemonic length. Derived from `ENTROPY_BYTES` (256 bits → 24 words), not independently settable. |

Paths are defined in [`src/derivation/paths.ts`](../src/derivation/paths.ts) and were
verified (M1 diagnosis, V1) as byte-identical to Leather's and Xverse's account-0
defaults.

**Scope.** What is frozen is the mapping above: the constants, and the account-0 path
for each chain. Deriving at any *other* path in the same tree is an **addition, not a
change** — account-0 derivation stays byte-identical and no existing address moves.
Only a change to what account 0 derives is a wallet-universe break, governed by the
change policy below. Any such addition must state which multi-account indexing
convention it follows, because the wallets diverge — Leather-software increments the
final index, while Xverse and Leather-on-Ledger increment the `account'` field — and
leaving it unstated hands adopters an interoperability footgun.

## Networks

The two chains handle networks differently, and the asymmetry is part of the frozen
definition:

- **Bitcoin — the path changes.** BIP-84 mandates SLIP-44 coin type `0'` on mainnet
  and `1'` on *all* test networks (testnet, signet, regtest), so the testnet address
  derives at `m/84'/1'/0'/0/0`. The derivation path and the address encoder are both
  selected from the same `network` argument in
  [`src/derivation/bitcoin.ts`](../src/derivation/bitcoin.ts), so they cannot
  disagree. They could before 0.2.0 — a mainnet-path key encoded with the testnet
  HRP — which produced `tb1…` addresses that no standard testnet wallet reproduces.
  See the change policy below.
- **Stacks — the path does not change.** `m/44'/5757'/0'/0/0` is used on both
  networks; only the address version byte differs, so the same key yields either an
  `SP…` or an `ST…` address. Nothing about Stacks derivation is network-dependent.

## Why HKDF

Authoritative WebAuthn-PRF guidance is to treat the PRF result as input keying
material and run it through a KDF, not to use it directly as a key/entropy. HKDF
gives domain separation (via `info`) and binds the salt/universe (via `salt`), so
the same passkey under different apps/salts cannot collide.

WebAuthn detail: the browser itself hashes the salt as
`SHA-256("WebAuthn PRF" ‖ 0x00 ‖ inputSalt)` before evaluating the authenticator's
hmac-secret. The library supplies the UTF-8 bytes of `DEFAULT_SALT`; the transform
is applied client-side. Consequence: our PRF output will not equal a raw CTAP2
hmac-secret computed on the same salt.

## Salt = wallet universe

`DEFAULT_SALT` is exposed as a library parameter. A host app MAY override it, but:

- Each distinct salt defines a **distinct, incompatible wallet universe**.
- The **same passkey** under a different salt yields a **completely different
  wallet** — different mnemonic, different addresses, no shared funds.

DeOrganized uses the default. Overriding is only for apps that deliberately want an
isolated universe, and must be documented to their users.

## Locked test vectors

[`test/vectors/derivation.vectors.json`](../test/vectors/derivation.vectors.json)
pins fixed **public** PRF inputs (all-zero, all-ff, a counter, a tagged hash — test
vectors, not real wallets) to their expected mnemonic, Stacks address, and Bitcoin
mainnet **and testnet** addresses.
[`test/derivation.test.ts`](../test/derivation.test.ts) asserts the library
reproduces them and additionally, on every run:

- cross-validates each Stacks address against **@stacks/wallet-sdk** and each
  Bitcoin address against **bitcoinjs-lib** (independent implementations), and
- checks a **BIP-84 published golden vector** (the canonical `abandon … about`
  mnemonic → `bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu`).

Regenerate with `npm run gen:vectors` — but note regeneration is only appropriate
when *intentionally* defining a new universe. The generator refuses to write if any
cross-validation disagrees.

### Verifying without trusting this library

Everything above runs inside this repository's own test suite. To check the vectors
independently, two harnesses sit beside them:

- [`test/vectors/verify.mjs`](../test/vectors/verify.mjs) re-derives every vector
  and checks it against the file.
- [`test/vectors/negctl.mjs`](../test/vectors/negctl.mjs) runs five negative
  controls, so that a passing verification is evidence rather than an assumption —
  including a regression pin for the 0.2.0 testnet coin-type fix.

**Neither harness imports anything from `src/` or from the published
`stacks-passkey-wallet` package.** The pipeline is rebuilt from the specs (RFC 5869,
BIP-39, BIP-32/44/84) on third-party primitives and cross-checked against
`@stacks/wallet-sdk` and `bitcoinjs-lib`. That restriction is what makes "without
trusting the library" checkable rather than merely asserted: a verifier that called
into this code would reproduce any bug in the library's own composition of those
steps, and so could never detect one.

Run them with `node test/vectors/verify.mjs` and `node test/vectors/negctl.mjs`;
both log every assertion and exit non-zero on failure. See
[`test/vectors/README.md`](../test/vectors/README.md) for details.

## Change policy

Changing `DEFAULT_SALT`, any HKDF parameter, the entropy length, the wordlist, or a
**mainnet** derivation path is a **major, breaking** change. It MUST bump the salt
version (`…/v1` → `…/v2`), ship new vectors, and be called out as a wallet-universe
break — never a silent edit. This rule is absolute: anything that changes an address
a user may already hold funds at breaks that user's wallet.

**One narrow exception, for test networks only.** Correcting a *test-network* path
that produced addresses no standard wallet could reproduce is a bug fix, not a
universe break — there is no interoperable wallet to stay compatible with, and no
mainnet address moves. 0.2.0 is the worked example: the testnet Bitcoin path was
corrected from coin type `0'` to the BIP-84-mandated `1'` and shipped as a minor
version with `DEFAULT_SALT` unchanged, because mainnet derivation was byte-for-byte
untouched and the previous testnet output was unusable by construction. Such a fix
must still ship new vectors and be called out in the changelog. The exception does
not extend to mainnet under any circumstances.
