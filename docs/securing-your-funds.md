# Securing your funds

This page is for two audiences:

- **If you use an app built on this library** — start at [The short
  version](#the-short-version) and read through [If you lose
  access](#if-you-lose-access).
- **If you are integrating this library** — read all of it, then the
  [integrator checklist](#integrator-checklist) at the end.

Nothing here is a promise about your funds. It is a description of how this
wallet actually works and what that means for you.

## The short version

1. This is a **hot wallet**. Same security class as a browser-extension wallet.
   Suitable for onboarding and everyday amounts. Not for savings or a treasury.
2. **Your passkey provider — Apple or Google — can reach your funds.** Whoever
   can restore your iCloud Keychain or Google Password Manager can re-derive
   this wallet. Secure that account as if it were the wallet, because it is.
3. **Export your seed phrase and write it down.** It is the only recovery path
   that does not depend on your passkey provider.
4. **"Add a passkey" is not a backup.** It is a second way to sign in. Only the
   seed phrase recovers funds.

## What kind of wallet this is

The wallet's private key is derived from your passkey each time it is needed,
used, and then discarded. Deriving and signing happen in the web page you are
using — so at the moment you sign, the key exists in that page's memory.

That has two consequences worth being plain about:

- **Malware on your device** at signing time could read the key. This is true of
  every browser-based wallet, extension wallets included.
- **You are trusting the app's website.** The code that derives your key is
  JavaScript served by whoever runs that site. A compromised or malicious build
  of the app could take the key material. A passkey does not change this — it
  changes how you *log in*, not who is running the code.

The passkey genuinely improves things: there is no seed phrase to write down at
signup, and passkey login is phishing-resistant in a way passwords are not. It
does not make a web wallet into a hardware wallet.

## Who can reach your funds

Three parties are inside the trust boundary:

| Who | Why | What you can do |
|---|---|---|
| **You**, on your device | The key is derived and used locally | Keep the device patched; be careful about browser extensions |
| **Your passkey provider** (Apple / Google) | Passkeys sync, and the passkey *is* the key material | Strong password, 2FA, and careful recovery-contact setup on that account |
| **The app's operator** | Serves the code that derives your key | Prefer apps you would trust with a browser-extension wallet |

The passkey-provider point is the one most people miss, so it is worth stating
directly. In many passkey systems the passkey only *signs* a challenge and the
key never leaves the provider's secure hardware in a spendable form. **This
library is different**: it uses the passkey's PRF output as the seed for a
standard HD wallet. That is what lets you restore into Leather or Xverse with a
normal 24-word phrase — and it is also why anyone who can restore your Apple or
Google account can re-derive the same wallet.

There is no DeOrganized or vendor recovery path. That is a separate claim from
provider custody, and both are true at once: no company here can recover your
wallet for you, *and* your passkey provider is effectively a custodian.

## "Add a passkey" vs "Restore my wallet"

These two actions look similar in an interface and mean completely different
things. Conflating them is the most likely way to lose funds with this wallet.

**"Add a passkey" — login convenience.**
Another way to sign in to the **same** wallet, using a passkey synced by the
**same** provider. It does not back anything up. If you lose access to that
provider account, every passkey it holds goes with it.

**"Restore my wallet" — funds recovery.**
Re-deriving your wallet from your **exported seed phrase**, on any device or in
any standard wallet. This is the only action that recovers funds.

A genuinely *new* passkey — a different provider, or an unsynced device —
derives a **different, empty wallet**. Not access to your original one. Same
person, same app, different passkey: different funds.

Concretely: a passkey in Google Password Manager and a passkey in iCloud
Keychain are two separate credentials, and therefore two separate wallets. They
do not merge.

## Backing up: the seed phrase

Your wallet has a standard 24-word BIP-39 recovery phrase. Exporting it is the
one thing on this page that you should go do now if you have not.

**How the export works.** The app must show you a warning first, and you must
re-authenticate with your passkey at that moment. The phrase is then displayed
**once** and forgotten by the app. It is never sent anywhere, never logged, and
never written to your browser's storage. If you close the screen without writing
it down, you can run the export again — but each run shows it exactly once.

**How to store it.**

- Write it on paper. Two copies, two locations.
- Do not photograph it, type it into notes, email it to yourself, or paste it
  into a chat or a password field. A phrase in cloud storage is a phrase in
  whatever account holds that storage.
- Never type it into any website. No legitimate support process will ask for it.
  This app will not ask you to enter a phrase to "verify" it.

**Two things about this phrase that differ from a normal wallet:**

1. **It is a second, independent way in.** Once written down, the paper reaches
   your funds even without the passkey. Anyone who finds it has the wallet.
2. **It cannot be rotated.** The phrase is derived deterministically from your
   passkey, so you cannot issue a new phrase for the same wallet. If a phrase is
   exposed, the only remedy is to move the funds to a different wallet.

## Passkey providers: what to check

Byte-identical passkey output across your devices is the assumption this whole
design rests on. Not every provider or version delivers it.

| Provider | Works for this wallet | Notes |
|---|---|---|
| **iCloud Keychain** | Yes, on iOS/iPadOS **18.4+** and macOS **15.4+** | Earlier versions could derive inconsistently across devices. The library refuses to run below the iOS floor rather than risk it. |
| **Google Password Manager** | Yes | Chrome/Edge 116+, desktop and Android. On by default; the broadest option, and the recommended one on Windows. |
| **Windows Hello** | No | The credential never leaves that one PC. Rejected before any key is derived. |
| **Hardware security keys** | No | Same reason — device-bound. |
| **Firefox on Android, Android WebView** | No | No passkey PRF support. |

Practical caveats:

- **Sync must actually be on.** A passkey that never syncs is a single-device
  wallet, and losing the device means the seed phrase is your only way back.
- **Providers do not interoperate.** You cannot move a passkey from Google to
  Apple and arrive at the same wallet. Use the seed phrase to move.
- **Provider account changes propagate.** Losing your Apple ID or Google account
  — closure, lockout, recovery by someone else — takes the passkey with it.
- Cross-device and cross-provider coverage is still being verified by hand. See
  [`prf-support-matrix.md`](./prf-support-matrix.md) and
  [`prf-verification-checklist.md`](./prf-verification-checklist.md) for what has
  actually been confirmed on real devices, as opposed to what the specs promise.

## What this library never stores

The library holds no persistent state at all:

- **No seed, key, or phrase in `localStorage`, `IndexedDB`, cookies, or any
  other browser storage.** The seed is re-derived on demand, lives only in page
  memory, and the buffers are zeroized after use.
- **Nothing is transmitted.** The library sends no key material to any server —
  not DeOrganized's, not anyone's. There is no telemetry.
- **The exported phrase is reveal-once** and is redacted from logging and
  serialization, so it cannot leak through an accidental `console.log` or
  `JSON.stringify` of the export object.

What an app built on the library *will* normally store is your **addresses** —
which are public information — so it can show your balance. That is expected and
is not key material.

## How much to keep in this wallet

Treat it like the cash in your pocket, not the money in your bank.

Reasonable: onboarding, small purchases, tips, day-to-day balances you would be
annoyed but not harmed to lose.

Not reasonable: savings, treasury funds, anything you cannot afford to lose, or
anything held on behalf of other people.

**If a balance outgrows that, move the funds out to a wallet generated on a
hardware device.** Do not import *this* phrase into a hardware wallet and
consider the problem solved — that phrase has already existed in browser memory
and remains derivable from your passkey, so importing it carries the original
exposure along with it. A hardware wallet only helps if its key was generated on
the hardware and has never left it. Send the funds; do not move the phrase.

## If you lose access

- **Lost or wiped your device, passkey still synced** — sign in on another
  device with the same provider account. Same wallet.
- **Lost access to the passkey provider account** — use your seed phrase in any
  standard wallet (Leather, Xverse, or similar).
- **No passkey and no seed phrase** — the funds are not recoverable. Not by you,
  not by the app operator, not by anyone. This is what self-custody means, and it
  is why the phrase matters.

**When you restore into another wallet**, some wallets scan more than one
multi-account convention and will show you **two accounts for the same phrase**.
That is expected. Your funds are on the **first** account. Match the address
type when you check: `bc1q…` (native SegWit) for Bitcoin, `SP…` for Stacks. There
is no BIP-39 passphrase on this wallet — leave that field empty.

## Integrator checklist

Everything above is the user-facing contract. Keeping it true is on you.

**Do not weaken the built-in gates.**

- Seed export requires a fresh `get()` and an explicit
  `acknowledgedBackupWarning: true`. Set that flag only after the user has
  actually passed your warning UI — not as a constructor default.
- `SeedExport.reveal()` yields the phrase once. Do not cache the result, store
  it, or pass it to anything that persists or transmits.
- `createPasskey()` rejects device-bound authenticators before deriving. Do not
  work around this to "support Windows Hello" — the result would be a
  single-device wallet the user cannot restore.

**Keep the two actions distinct.** Use `WALLET_ACTIONS` as the source of truth
for the copy. "Add a passkey" must never be presented as a backup, and your
backup prompt must never be satisfied by adding a passkey.

**Do not auto-create on a failed sign-in.** WebAuthn deliberately cannot
distinguish "user cancelled" from "no credential", so calling `create()` after a
failed `get()` silently produces a second, empty wallet. Use the get()-first,
confirm-before-create pattern in
[`get-vs-create-ambiguity.md`](./get-vs-create-ambiguity.md).

**Never build a "type your phrase here" surface** except a deliberate,
clearly-labelled restore flow. Teaching users that entering a phrase into a
website is normal is teaching them to fall for the next phishing site.

**Your page is inside the trust boundary.** The key is derived in your app's
JavaScript context. Treat wallet pages accordingly: a strict Content Security
Policy, no third-party scripts or analytics on pages that derive or sign,
reviewed dependencies, and pinned versions. Pin this library to an exact version
— it is pre-1.0 and breaking changes may land in minor releases.

**Do not add key material to your logging or error reporting.** The library
redacts its own export object; it cannot redact a variable you captured
yourself.

**Verify on your target providers before you launch.** The PRF support matrix is
incomplete. If your users are on a combination that has not been confirmed
end-to-end, confirm it yourself with
[`prf-verification-checklist.md`](./prf-verification-checklist.md) before funds
depend on it.

**Tell your users what is in this document.** Not as a link in a footer — the
provider-custody point and the add-passkey-is-not-a-backup point belong in the
flow, at the moment they matter.

---

Questions or a correction? Open an issue at
[github.com/DeOrganized/stacks-passkey-wallet](https://github.com/DeOrganized/stacks-passkey-wallet/issues).
