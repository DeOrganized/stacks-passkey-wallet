# Wallet-identity definition (FROZEN)

This document defines the deterministic mapping from a WebAuthn PRF output to a
wallet. It is the single most safety-critical contract in the library: everything
below is **frozen**. Changing any part of it changes every wallet the library
derives, and is a **breaking change that creates a new, incompatible wallet
universe** (existing users would derive different, empty wallets).

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
        └─▶ m/84'/0'/0'/0/0     → Bitcoin address  (native SegWit P2WPKH, @scure/btc-signer)
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

Paths are defined in [`src/derivation/paths.ts`](../src/derivation/paths.ts) and were
verified (M1 diagnosis, V1) as byte-identical to Leather's and Xverse's account-0
defaults.

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
vectors, not real wallets) to their expected mnemonic + Stacks + Bitcoin addresses.
[`test/derivation.test.ts`](../test/derivation.test.ts) asserts the library
reproduces them and additionally, on every run:

- cross-validates each Stacks address against **@stacks/wallet-sdk** and each
  Bitcoin address against **bitcoinjs-lib** (independent implementations), and
- checks a **BIP-84 published golden vector** (the canonical `abandon … about`
  mnemonic → `bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu`).

Regenerate with `npm run gen:vectors` — but note regeneration is only appropriate
when *intentionally* defining a new universe. The generator refuses to write if any
cross-validation disagrees.

## Change policy

Changing `DEFAULT_SALT`, any HKDF parameter, the entropy length, the wordlist, or a
derivation path is a **major, breaking** change. It MUST bump the salt version
(`…/v1` → `…/v2`), ship new vectors, and be called out as a wallet-universe break —
never a silent edit.
