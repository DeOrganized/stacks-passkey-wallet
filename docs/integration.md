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
