# Frozen derivation vectors — and how to verify them yourself

`derivation.vectors.json` is the frozen definition of this library's wallet
identity: for a fixed PRF input and salt, exactly which mnemonic, Stacks address
and Bitcoin addresses must come out. Regenerating it with different constants is
a breaking, universe-splitting change — see
[`docs/wallet-identity.md`](../../docs/wallet-identity.md).

> ⚠️ The PRF byte patterns in the vectors are **synthetic** — constant and
> counting patterns that no real credential ceremony produces — and the derived
> mnemonics and addresses exist only to reproduce these vectors. **Never fund
> these addresses. Never import these mnemonics** for any other purpose.

Two harnesses sit beside the vectors. They are development tooling: `test/` is
excluded from the published npm package, so they ship on GitHub only.

## `verify.mjs` — independent re-derivation

```
node test/vectors/verify.mjs
```

Re-derives all four vectors and checks them against the file. Exit code `0` if
every assertion passes, `1` otherwise; every check is logged individually as
`PASS` or `FAIL`, with expected and actual values printed on failure.

**It imports nothing from `src/`, and nothing from the published
`stacks-passkey-wallet` package.** That restriction is the entire point. A
verifier that called into the library would reproduce any bug in the library's
own composition of HKDF, BIP-39 and BIP-32, and could never detect it — it would
only be testing self-consistency. Instead the pipeline is rebuilt from the specs
(RFC 5869, BIP-39, BIP-32/44/84) on third-party primitives, and each result is
confirmed against an independent reference implementation:

| Checked | Verified against |
|---|---|
| PRF → HKDF-SHA256 → BIP-39 mnemonic | `@noble/hashes`, `@scure/bip39` rebuilt from the specs |
| Stacks address, from the mnemonic | `@stacks/wallet-sdk`'s own HD traversal |
| Stacks address, at the stated path | `@scure/bip32` + `@stacks/transactions` |
| Bitcoin address (mainnet and testnet) | `bitcoinjs-lib`'s own P2WPKH encoder |

The derivation parameters and the expected values are both read from
`derivation.vectors.json`, so the artifact under test is self-describing —
nothing is hard-coded in the harness that the file does not also state. The one
exception is the derivation paths, which are restated in `verify.mjs` so that a
silent path change in the file fails the run rather than verifying itself.

So a third party can check this library's claims with no TypeScript toolchain
and without trusting its test suite: install dependencies, run one command.

## `negctl.mjs` — negative controls

```
node test/vectors/negctl.mjs
```

"All assertions pass" is only evidence if the harness is capable of failing.
These five controls each break something that is supposed to matter and require
the result to change. Exit `0` if all five behaved correctly, `1` otherwise. A
`BROKEN` result means `verify.mjs` is not proving what it claims.

1. **One flipped PRF byte → different mnemonic.** Catches a verifier that
   ignores its input.
2. **Different PRF salt → different universe.** The salt is the wallet
   universe; the same passkey under another salt shares no funds.
3. **Different HKDF `info` → different entropy.** Confirms the domain-separation
   constant is load-bearing.
4. **Testnet at mainnet coin type `0'` → not the frozen testnet address.** A
   regression pin for the bug fixed in 0.2.0, where addresses were derived at
   `m/84'/0'/0'/0/0` but encoded with the testnet HRP, producing `tb1…`
   addresses no standard testnet wallet reproduces. BIP-84 mandates coin type
   `1'` for test networks. The control prints the wrong-path address, which
   shares its hash160 with the mainnet address and differs only in the prefix —
   the signature of exactly that mistake. If this control ever reports `BROKEN`,
   the bug is back.
5. **Corrupted expected address → the verifier reports `FAIL`.** Runs
   `verify.mjs` against a deliberately tampered copy of the vectors and requires
   failures to be raised, proving the harness does not pass vacuously.

The controls call `verify.mjs`'s own helpers rather than reimplementing them, so
they exercise the real verification path.

## Regenerating

`npm run gen:vectors` rewrites the file via `scripts/generate-vectors.ts`, which
performs the same cross-validation at generation time and refuses to write if
anything disagrees. Regeneration is only appropriate when the frozen definition
is deliberately being changed — which is a breaking change requiring a new salt
version and new vectors, never a silent edit.
