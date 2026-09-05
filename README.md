# stacks-passkey-wallet

> ⚠️ **Pre-release — v0.3.0.** Production hardening is in progress and the
> cross-device PRF support matrix is **incomplete** (see
> [`docs/prf-support-matrix.md`](docs/prf-support-matrix.md)). Adopters inherit
> these caveats: pin an exact version, and verify on your target passkey
> providers before relying on it for funds. Breaking changes between pre-1.0
> versions are listed in [CHANGELOG.md](CHANGELOG.md) — read it before upgrading.

Passkey-derived wallet reference implementation for Stacks and Bitcoin —
WebAuthn PRF → deterministic HD wallet. **MIT licensed. Clean-room** from the
WebAuthn PRF, BIP-39, BIP-32/44/84 and RFC 5869 specifications.

One passkey, one biometric tap, and a user has a Stacks + Bitcoin wallet — no
seed phrase to write down at signup, no browser extension. This repository is
the open reference library; [deorganized.com](https://deorganized.com) consumes
it as a dependency.

## How it works

```
passkey PRF output (32 bytes)
   │  HKDF-SHA256 (RFC 5869)
BIP-39 entropy (32 bytes) → 24-word mnemonic → BIP-32 seed
   ├─▶ m/44'/5757'/0'/0/0  → Stacks address   (SP…)
   └─▶ m/84'/0'/0'/0/0     → Bitcoin address  (bc1q…, native SegWit)
```

The same passkey + the same salt always derives the same wallet. The derivation
paths are byte-identical to Leather's and Xverse's account-0 defaults (verified
against their current sources). The salt, HKDF parameters, and locked test
vectors are frozen together — see [docs/wallet-identity.md](docs/wallet-identity.md).

## ⚠ Trust model — read this first

**This is a hot wallet — the same security class as a browser-extension wallet.**
At signing time the private key is briefly in clear-text page memory; device
malware at that moment could steal it. The passkey improves the *experience*
(no seed at signup, phishing-resistant login) — it does **not** change the
underlying trust model.

**Your passkey provider is part of the trust boundary.** Because the wallet's
keys are derived from PRF output — the passkey *is* the key material, it doesn't
merely sign an assertion the chain verifies — and passkeys sync through iCloud
Keychain or Google Password Manager, **whoever can restore your Apple ID or
Google account can re-derive your funds.** In practice the provider custodies
the wallet. This is a different trust model from architectures where the passkey
only signs and the provider never holds spendable key material. Treat the
account-recovery security of your passkey provider (strong password, 2FA on the
Apple/Google account, recovery contacts) as part of securing this wallet.

Appropriate for onboarding and casual/moderate balances. **Not for treasuries.**
Full guidance for users and integrators:
[docs/securing-your-funds.md](docs/securing-your-funds.md).

The library persists nothing and transmits nothing: the seed is re-derived on
demand and lives only in page memory. The HD root and the byte buffers the
library holds are zeroized after use; derived child keys and string values (the
mnemonic, hex-encoded keys) are released to garbage collection, not overwritten
— `src/memory.ts` states where that boundary sits. Nothing touches
localStorage, IndexedDB, cookies, or any server.

## ⚠ The #1 pitfall: a new passkey is a *new, empty* wallet

Two actions look similar and must never be conflated:

- **"Add a passkey"** = *login convenience*. Another way to sign in to the **same**
  wallet, via a passkey synced by the same provider (iCloud Keychain / Google
  Password Manager).
- **"Restore my wallet"** = *funds recovery*. Re-deriving your wallet on a new
  device from your **exported seed phrase**.

Creating a genuinely *new* passkey (a different provider, or an unsynced device)
derives a **different, empty wallet** — not access to your original. Always back
up the seed phrase for recovery. The library exposes
`WALLET_ACTIONS` so host apps keep this language straight.

This pitfall has a subtle integration counterpart: a failed sign-in `get()`
cannot be told apart from a user cancellation, so auto-creating on failure
silently mints a duplicate empty wallet. See
[docs/get-vs-create-ambiguity.md](docs/get-vs-create-ambiguity.md) for the
`get()`-first / confirm-before-`create()` pattern that avoids it.

## Supported platforms

Reliable, byte-identical PRF across a user's synced devices exists on two
providers today:

| Provider | Status |
|---|---|
| **iCloud Keychain** (iOS/iPadOS **18.4+**, macOS **15.4+**) | ✅ supported |
| **Google Password Manager** (Chrome/Edge 116+, desktop + Android) | ✅ supported |
| Windows | ✅ **via Google Password Manager** — `createPasskey()` rejects Windows Hello (device-bound, would be single-device) before deriving; the `get()`-path calls apply no such gate today (tracked in [#13](https://github.com/DeOrganized/stacks-passkey-wallet/issues/13), see [docs/get-vs-create-ambiguity.md](docs/get-vs-create-ambiguity.md#checking-backup-eligibility-on-the-get-path)) |
| Firefox Android, Android WebView | ❌ not supported |

The iOS 18.4 floor is a conservative **user-agent check**, not a capability
probe (earlier versions can derive inconsistent bytes across devices); user
agents it does not recognize pass through to WebAuthn's own typed errors. Full
detail:
[docs/prf-support-matrix.md](docs/prf-support-matrix.md).

## Status & roadmap

**Production-verified** — running on deorganized.com, confirmed end-to-end on
real devices.

| | |
|---|---|
| Passkey signup → wallet in one tap | ✅ live |
| Stacks + Bitcoin address derivation | ✅ live, vectors cross-validated |
| Stacks message signing (RSV) | ✅ live |
| Bitcoin PSBT signing | ✅ live |
| Seed-phrase export + independent restore | ✅ verified in Xverse |
| iCloud Keychain (iOS 18.4+ / macOS 15.4+) | ✅ create + re-derive confirmed |
| Google Password Manager (desktop + Android) | ✅ create + re-derive confirmed |

**In development**

| | |
|---|---|
| `signStacksTransaction` — contract calls & token transfers | tracked in [issue #1](https://github.com/DeOrganized/stacks-passkey-wallet/issues/1) (pt 3). Message signing and PSBT signing exist today; transaction signing does not. |
| Cross-device / cross-provider PRF matrix | partially verified by hand — [`prf-support-matrix.md`](docs/prf-support-matrix.md) |
| Automated browser-mode PRF tests | not yet automated; the manual [checklist](docs/prf-verification-checklist.md) is the current instrument |

**Roadmap** — not started, no timeline committed.

| | |
|---|---|
| EVM address derivation | — |
| Solana address derivation | — |

Before holding funds on this, read
[docs/securing-your-funds.md](docs/securing-your-funds.md).

## Install

```bash
npm install stacks-passkey-wallet
```

## Usage

```ts
import {
  createPasskey,
  deriveAddressesFromPasskey,
  signStacksMessage,
  evaluatePrf,
  exportSeedPhrase,
} from "stacks-passkey-wallet";

// 1. Create a passkey with the PRF extension (throws PrfUnsupportedError if unavailable).
await createPasskey({
  rpName: "Your App",
  rpId: "yourapp.com",
  userId: crypto.getRandomValues(new Uint8Array(16)),
  userName: "alice",
  challenge: crypto.getRandomValues(new Uint8Array(32)),
});

// 2. Derive the wallet (fresh get() → PRF bytes → addresses).
const { stacks, bitcoin } = await deriveAddressesFromPasskey({
  challenge: crypto.getRandomValues(new Uint8Array(32)),
  rpId: "yourapp.com",
});
// stacks.address → "SP…", bitcoin.address → "bc1q…"

// 3. Sign — your app briefly holds the PRF bytes and zeroes them right after;
//    everything downstream is derived and discarded inside the library.
const bytes = await evaluatePrf({ challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: "yourapp.com" });
const { signature, publicKey } = signStacksMessage(bytes, "hello");
bytes.fill(0);

// 4. Export the seed for backup (gated + shown once).
const seed = await exportSeedPhrase({
  challenge: crypto.getRandomValues(new Uint8Array(32)),
  rpId: "yourapp.com",
  acknowledgedBackupWarning: true, // set only after the multi-step warning UI
});
showPhraseInYourUi(seed.reveal()); // the 24-word phrase, once — render it in your UI; never console.log it
```

See the [integration guide](docs/integration.md) for the full host-app flow and
[the demo](demo/) for a runnable standalone example (`npm run demo`). If your app
already has a wallet-extension or email sign-in, see
[docs/integrating-alongside-wallet-auth.md](docs/integrating-alongside-wallet-auth.md)
for the patterns that keep all three methods coherent behind one entry point.

## Transaction signing

One generic Stacks transaction signer. You build the transaction with
`@stacks/transactions`' own builders — that is where fees, nonces and
post-conditions are expressed — and the library signs exactly the bytes you
hand it, for exactly the wallet the passkey derives.

```ts
import { evaluatePrf, signStacksTransaction, signStacksTransactionWithRoot } from "stacks-passkey-wallet";
import { makeUnsignedSTXTokenTransfer } from "@stacks/transactions";

const tx = await makeUnsignedSTXTokenTransfer({
  recipient, amount, fee, nonce, network,
  publicKey,            // the account-0 public key of this wallet
});

const bytes = await evaluatePrf({ challenge, rpId });
const result = signStacksTransaction(bytes, tx);
bytes.fill(0);

if (result.kind === "complete") {
  broadcast(result.transaction);     // serialized signed transaction
  record(result.txid);               // stable from the moment of signing
} else {
  sendToSponsor(result.transaction); // origin-signed; the sponsor adds the fee-payer signature
}
```

Signatures:

```ts
function signStacksTransaction(
  prfBytes: Uint8Array,
  transaction: StacksTransactionWire,
  options?: { salt?: string; allowUnprotectedAssetMovement?: boolean },
): SignStacksTransactionResult;

function signStacksTransactionWithRoot(
  root: HDKey,
  transaction: StacksTransactionWire,
  options?: { allowUnprotectedAssetMovement?: boolean },
): SignStacksTransactionResult;

type SignStacksTransactionResult =
  | { kind: "complete";      transaction: Uint8Array; txid: string; publicKey: string }
  | { kind: "origin-signed"; transaction: Uint8Array; publicKey: string };
```

The result kind follows the transaction's own authorization type. A standard
transaction returns `complete` with the real txid. A sponsored transaction
returns `origin-signed` with **no txid field of any kind** — the only txid that
will ever exist is the one your sponsor service reports after it applies the
fee-payer signature. There is no `network` or `sponsored` option: the
transaction is the single source of truth for both.

Two refusals, both typed, both applied **before** any signature:

- **`OriginAddressMismatchError`** — the account-0 address derived from the
  passkey (for the network the transaction's own version byte names) does not
  equal the transaction's origin address. The wrong passkey answered the
  ceremony. The error carries `derivedAddress` and `originAddress`. A
  mismatched `salt` refuses here too — the fence is also your
  salt-configuration check.
- **`UnprotectedAssetMovementError`** — the transaction's post-condition mode
  is `Allow`, which permits any asset movement the contract attempts. Deny mode,
  with or without post-conditions, signs normally. To sign an Allow-mode
  transaction anyway, pass `allowUnprotectedAssetMovement: true`; the flag is
  deliberately uncomfortable to type. The library never inspects the
  post-conditions themselves — that policy is yours.

**What the caller owns.** Transaction construction, fee estimation, nonce
management, broadcast, and — for sponsored transactions — the sponsor service
and everything inside its trust boundary. The library ships client-side
cryptography only; it never returns, retains, or broadcasts anything beyond the
signed bytes, and it never mutates the transaction except to apply the origin
signature. `signStacksTransaction` derives, signs, and wipes the root in a
`finally` block on every path, including both refusals; the `WithRoot` variant
signs with a root you already hold and leaves its lifecycle to you.

Frozen signing vectors live in `test/vectors/signing.vectors.json` — seven
classes, every input recorded, exact bytes in and out, three negative
controls. An implementation that reproduces them byte-for-byte implements the
signer.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest — derivation vectors, signing, PRF, export
npm run build       # tsup → dist/ (ESM + types)
npm run gen:vectors         # regenerate the frozen derivation vectors (cross-validated)
npm run gen:vectors:signing # regenerate the frozen signing vectors (cross-validated)
npm run demo        # runnable browser demo (vite)
```

Derivation vectors are cross-validated against `@stacks/wallet-sdk` (Stacks) and
`bitcoinjs-lib` (Bitcoin), plus a BIP-84 published golden anchor. Signing vectors
are cross-validated by deserializing the frozen bytes with `@stacks/transactions`,
verifying the origin signature, recovering the public key against `@stacks/wallet-sdk`'s
independent derivation, and recomputing the txid.

## License & credits

MIT © DeOrganized. Built as open infrastructure for deorganized.com's one-tap
accounts. Contributions welcome under MIT.
