# stacks-passkey-wallet

> ⚠️ **Pre-release — v0.1.0.** Production hardening is in progress and the
> cross-device PRF support matrix is **incomplete** (see
> [`docs/prf-support-matrix.md`](docs/prf-support-matrix.md)). Adopters inherit
> these caveats: pin an exact version, and verify on your target passkey
> providers before relying on it for funds.

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

Appropriate for onboarding and casual/moderate balances. **Not for treasuries.**

The library never persists anything key-related: the seed is re-derived on
demand, lives only in page memory, and is zeroized after use. Nothing touches
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

## Supported platforms

Reliable, byte-identical PRF across a user's synced devices exists on two
providers today:

| Provider | Status |
|---|---|
| **iCloud Keychain** (iOS/iPadOS **18.4+**, macOS **15.4+**) | ✅ supported |
| **Google Password Manager** (Chrome/Edge 116+, desktop + Android) | ✅ supported |
| Windows | ✅ **via Google Password Manager** — Windows Hello is **not** supported for derivation (device-bound, would be single-device) |
| Firefox Android, Android WebView | ❌ not supported |

The iOS 18.4 floor is enforced as a **hard runtime check** (earlier versions can
derive inconsistent bytes across devices). Full detail:
[docs/prf-support-matrix.md](docs/prf-support-matrix.md).

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

// 3. Sign — the library derives, signs, and discards the key internally.
const bytes = await evaluatePrf({ challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: "yourapp.com" });
const { signature, publicKey } = signStacksMessage(bytes, "hello");
bytes.fill(0);

// 4. Export the seed for backup (gated + shown once).
const seed = await exportSeedPhrase({
  challenge: crypto.getRandomValues(new Uint8Array(32)),
  rpId: "yourapp.com",
  acknowledgedBackupWarning: true, // set only after the multi-step warning UI
});
console.log(seed.reveal()); // the 24-word phrase, once
```

See the [integration guide](docs/integration.md) for the full host-app flow and
[the demo](demo/) for a runnable standalone example (`npm run demo`).

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest — derivation vectors, signing, PRF, export
npm run build       # tsup → dist/ (ESM + types)
npm run gen:vectors # regenerate the frozen vectors (cross-validated)
npm run demo        # runnable browser demo (vite)
```

Test vectors are cross-validated against `@stacks/wallet-sdk` (Stacks) and
`bitcoinjs-lib` (Bitcoin), plus a BIP-84 published golden anchor.

## License & credits

MIT © DeOrganized. Built as the open reference deliverable for a DeGrants
Milestone 1. Contributions welcome under MIT.
