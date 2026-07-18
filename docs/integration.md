# Integration guide (skeleton)

How a host app (e.g. deorganized.com) wires the library into an invisible-wallet
signup. This is a Milestone-1 skeleton; it accretes as the platform integration
(Part B) lands in the private repos.

## 1. Feature-detect before you offer the flow

```ts
import { assertPlatformSupportsPrf, providerGuidance, PrfUnsupportedError } from "stacks-passkey-wallet";

try {
  assertPlatformSupportsPrf();          // hard gate: no WebAuthn, or iOS < 18.4
} catch (e) {
  if (e instanceof PrfUnsupportedError) {
    // Fall back to Leather/Xverse connect. Do NOT silently proceed.
  }
}

const g = providerGuidance(navigator.userAgent);
if (g.steer) showBanner(g.message);      // Windows → steer to Google Password Manager / QR-to-phone
```

Ground truth is still a real `get()` that returns PRF bytes; `createPasskey` and
`evaluatePrf` throw a typed `PrfUnsupportedError` if it doesn't.

## 2. Signup — one tap, no crypto words

```ts
import { createPasskey, deriveAddressesFromPasskey } from "stacks-passkey-wallet";

await createPasskey({ rpName, rpId, userId, userName, challenge });      // biometric tap
const { stacks, bitcoin } = await deriveAddressesFromPasskey({ challenge, rpId });
// Register stacks.address + bitcoin.address to the user via your backend
// (Part B: POST /api/auth/passkey/register). Store addresses + WebAuthn
// credential data ONLY — never key material.
```

No "wallet", "seed", or "chain" wording at signup. The wallet is invisible; a
dashboard wallet-home surface is where you later reveal it.

**Returning users are a `get()`, not a `create()`.** Sign-in re-derives the same
wallet via `deriveAddressesFromPasskey` (a `get()`); only genuinely new users
should reach `createPasskey`. A failed `get()` cannot tell "no passkey on this
device" from "user cancelled," so never auto-fall-through from one to the other —
see [get-vs-create-ambiguity.md](./get-vs-create-ambiguity.md) for why, and the
`get()`-first / confirm-before-`create()` pattern that avoids silently minting a
duplicate empty wallet.

## 3. Signing

```ts
import { evaluatePrf, signStacksMessage, signBitcoinPsbt } from "stacks-passkey-wallet";

const bytes = await evaluatePrf({ challenge, rpId });
const { signature } = signStacksMessage(bytes, message);
// or: const { psbt } = signBitcoinPsbt(bytes, unsignedPsbt);
bytes.fill(0);
```

The library derives → signs → discards internally; your app never handles raw
key material. Broadcast is your app's concern.

## 4. Backup — keep two actions distinct

Use `WALLET_ACTIONS` so UI copy never conflates the two:

```ts
import { WALLET_ACTIONS, exportSeedPhrase } from "stacks-passkey-wallet";

// WALLET_ACTIONS.addPasskey    → login-convenience (same wallet, synced passkey)
// WALLET_ACTIONS.restoreWallet → funds-recovery (via the exported seed phrase)

// Show a multi-step warning, then:
const seed = await exportSeedPhrase({ challenge, rpId, acknowledgedBackupWarning: true });
displayOnce(seed.reveal());   // shown once; never log or transmit
```

Surface the backup prompt at first meaningful balance — not buried in settings.
Warn explicitly that a *new* passkey is a *new, empty* wallet, not a backup.

## 5. Engagement (Part B)

Emit your existing event types (`wallet.passkey_created`, `wallet.revealed`,
`wallet.backup_confirmed`, `wallet.first_tx`) at the corresponding points. The
library is agnostic to this; it lives in the host app.

## 6. Server verification: `expected_origin` must match the browser origin exactly

The WebAuthn response carries the *exact* origin the ceremony ran in
(`clientDataJSON.origin`, e.g. `https://www.example.com`). Your server's
`expected_origin` must match it exactly — scheme, host, and port. A bare-apex
value (`https://example.com`) will reject a ceremony that actually ran on the
`www.` host, and vice versa.

The trap is that the RP ID and the origin have *different* matching rules:

- **RP ID** matches by registrable-domain suffix, so `example.com` is a valid RP
  ID for a page on `www.example.com`. `navigator.credentials.create()` succeeds
  and a passkey is minted in the authenticator.
- **Origin** matches *exactly*, so if `expected_origin` names the wrong host,
  `verify` rejects the response even though creation "worked".

The symptom is distinctive: a credential exists in the authenticator (keychain /
password manager) with **no server-side record**, registration never completes,
and later sign-in fails as "unknown credential". Most often the cause is an
apex↔www redirect you forgot about — the site is served at
`https://www.example.com` (the apex 301-redirects to it), so every ceremony's
origin is the `www` host even though your config named the apex.

Fix, in order of preference:

1. Serve the app from a single canonical origin and set `expected_origin` to it.
2. If both hostnames are reachable, **accept both** — `expected_origin` may be a
   list (py_webauthn accepts `str | list[str]`); include every origin the app
   can run under, e.g. `["https://example.com", "https://www.example.com"]`.

Check your host/CDN redirect config to learn which origin users actually land
on. When in doubt, log `clientDataJSON.origin` from a real ceremony and compare
it byte-for-byte against `expected_origin`.

## 7. Restoring into a multi-account wallet (e.g. Xverse)

Some wallets scan more than one multi-account derivation convention when they
restore a recovery phrase, so importing the exported seed can show **two
"wallets"/accounts for the same phrase** — Xverse does this, for example. This
is expected, not a bug. **Account 0 is identical across both conventions** — it
is the account this library derives (Stacks `m/44'/5757'/0'/0/0`, Bitcoin
native segwit `m/84'/0'/0'/0/0`) and the one that holds the funds. The
conventions only diverge at account index ≥ 1, which is out of Milestone-1
scope.

Host-app guidance: tell users that seeing two accounts is normal and their
funds are on the first / account-0 entry. When verifying a restore, match the
address *type* — native segwit (`bc1q…`) for Bitcoin, the `SP…`/`ST…` Stacks
account address — and expect no BIP39 passphrase.
