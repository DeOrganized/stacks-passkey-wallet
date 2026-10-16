# Cross-device and cross-browser hardening

This page documents how `stacks-passkey-wallet` behaves across devices, browsers and passkey providers, what was changed to harden it, and what remains open. It reflects the library at **v0.5.0** and its production use on deorganized.com, recorded between July and October 2026.

The wallet is derived from a passkey's PRF output: PRF → HKDF → BIP-39 entropy → the Stacks and Bitcoin keys. Nothing is stored. So "does it work on this device?" really means two questions: can this browser run a WebAuthn ceremony with the PRF extension, and does the passkey provider make the same credential available on the user's other devices?

## 1. How passkey providers move between devices

Hybrid sign-in (the QR flow) is one-directional by protocol: the phone is always the authenticator and the device holding the browser is always the client. Windows and macOS do not implement the phone role. That gives three provider classes:

| Provider | Syncs between devices | Serves hybrid (QR) sign-in | What it means for a wallet |
|---|---|---|---|
| Google Password Manager | yes | yes | fully portable |
| iCloud Keychain | yes | yes | fully portable |
| Samsung Pass | no | yes | portable by QR only, not by sync |
| Windows Hello | no | no | permanently single-device |

Windows Hello and Samsung Pass are both "no sync", but only Samsung Pass has the hybrid escape route. Windows Hello passkeys are device-bound, so the library refuses to derive a wallet from a device-bound credential at create time, and the platform steers Windows users to Google Password Manager before the native passkey prompt appears.

A second provider trap: passkeys created in an incognito window on Windows land in Windows Hello, not in Google Password Manager. Verification steps therefore name both credential stores explicitly.

Third-party managers are recorded but not yet verified on our matrix: 1Password reported working; Bitwarden reported no PRF support.

## 2. The matrix

Legend: ✅ verified · ⚠️ works with a caveat · ❌ cannot work (by platform design) · ◻ open

### Browsers and operating systems

| Platform | Create | Sign in / re-derive | Evidence |
|---|---|---|---|
| iPhone, Safari, iCloud Keychain | ✅ | ✅ | Create 2026-07-27; sign-in 2026-07-30 re-derived the same addresses across a sign-out. |
| macOS, Apple desktop | ✅ | ✅ | Create confirmed 2026-07 (browser version not captured). |
| Laptop → iPhone (Chrome) via iCloud sync | — | ✅ | 2026-08-14: wallet created on a laptop, synced through iCloud, signed in with Chrome on an iPhone, and it was the same wallet. Reported publicly by the tester with a screenshot. |
| Desktop Chrome, Google Password Manager | ✅ | ✅ | Mainnet transfer signed 2026-09-05 (tx below). |
| Android Chrome (Galaxy S25), Google Password Manager | ✅ | ✅ | Mainnet transfer signed 2026-09-05 (tx below). |
| Android Chrome, other devices | ✅ | ✅ | Two further Android create successes, 2026-08. |
| Pixel 6 with a pattern lock only (no biometrics) | ✅ | ✅ | End-to-end 2026-08-12. A knowledge-factor unlock (pattern, PIN, passcode) satisfies WebAuthn `userVerification: "required"`; recorded in `prf-verification-checklist.md`. |
| Samsung Pass on a phone, then a laptop | ✅ (phone) | ⚠️ | No laptop sync by design; the route is hybrid/QR sign-in from the phone. |
| Windows Hello | ❌ | ❌ | Device-bound; refused at create; users steered to Google Password Manager. |
| iPhone 17 Pro Max | ◻ | — | 2026-10-10: one tester could not complete sign-up on this phone (desktop worked). The browser is not confirmed. **Open.** |

### Moving funds across devices

| Date | What | Transaction |
|---|---|---|
| 2026-09-05 | Mainnet STX transfer signed by a passkey wallet, desktop Chrome / Google Password Manager | [`0e1e6726…6b6e4`](https://explorer.hiro.so/txid/0x0e1e67269fe63d27a9bbebfc33727e06d04185af54630efbf88a62be90ceb6e4?chain=mainnet) (block 8926421) |
| 2026-09-05 | Mainnet transfer from Android, Galaxy S25 / Google Password Manager | [`679c0615…5ab7`](https://explorer.hiro.so/txid/0x679c0615af1dcfe6e462e01a923a5f4c5c11d7bc9bb23eefceffe189bc815ab7?chain=mainnet) (block 8926555) |
| 2026-09-05 | iOS Safari / iCloud Keychain: 12 of 12 signing dry-runs with a non-founder credential | (signed and discarded by design; no broadcast) |
| 2026-09-11 | 5 STX between two passkey accounts, desktop | [`7feedd78…36e3`](https://explorer.hiro.so/txid/0x7feedd78888971b772f8b3e4c6da148c6d039f1a78a1bc56d686ca9f636936e3?chain=mainnet) (block 8966340) |
| 2026-09-11 | The return transfer (4 STX), mobile | [`b9868e59…3599`](https://explorer.hiro.so/txid/0xb9868e59d9ce08afd3a1d151c727b46ac9af78d9d8cf89604f04a92974b53599?chain=mainnet) (block 8966403) |
| 2026-10-12 | Member send: 0.001 STX from a passkey account to an extension wallet | [`3a86ea24…361a`](https://explorer.hiro.so/txid/0x3a86ea2486a8d9a70363794c486abcf70b7a1fd0e5e4e77d526938a4f0c3361a?chain=mainnet) (block 9187002) |
| 2026-10-12 | Move to passkey: 5 STX from a connected extension wallet into the passkey account, desktop | [`43722b7c…b39e`](https://explorer.hiro.so/txid/0x43722b7cdeda89098bfa5f5fdaddc2491511d566dae2b5420595ed480b0eb39e?chain=mainnet) (block 9188932) |

### In-app browsers (links opened inside other apps)

The rule that explains every cell we have: **apps that open links in Chrome Custom Tabs (Android) or SFSafariViewController (iOS) inherit the system browser's passkeys and sessions; apps that render links in a raw WebView inherit nothing and cannot run a passkey ceremony.** The iOS half of that rule is still an inference from mechanism, waiting on its confirming pass.

| App browser | Result |
|---|---|
| X, LinkedIn, Reddit, Discord, Telegram, WhatsApp on Android (Chrome Custom Tabs) | ✅ passkey create and sign-in |
| YouTube on Android | ✅ operator-observed, 2026-08-31 (not yet independently verified) |
| Installed web app (home-screen icon, standalone mode) | ✅ operator-observed, 2026-08-31 (not yet independently verified) |
| Facebook and Instagram in-app browsers | ❌ cannot create passkeys |
| TikTok in-app browser | ❌ no PRF; the platform detects it, names the in-app browser, gives the escape steps, and offers an email fallback |
| Xverse's own in-app browser | ❌ no PRF; the platform now detects it before the user can create a second, empty account |
| WhatsApp on iPhone, X, Discord and Telegram on iPhone | ◻ untested |

## 3. What was changed

Library changes link to this repository. Platform changes were made in deorganized.com's own (private) codebase; their commit references are available on request.

| When | Change | Where |
|---|---|---|
| 2026-07-16 | WebAuthn expected-origin accepts both the apex and `www` hosts (a launch-day sign-in failure) | platform; documented in `integration.md` §6 |
| 2026-07-17 | Library 0.2.0: a device-bound credential is refused at create; a testnet Bitcoin coin-type path fixed (independent review) | library 0.2.0, CHANGELOG |
| 2026-07-17/18 | `docs/prf-verification-checklist.md` (by-hand create → sync → re-derive → compare) and `docs/get-vs-create-ambiguity.md` (why a cancelled ceremony and a missing credential look identical, and the get-first pattern that prevents silent duplicate wallets) | library PRs #3 and #4 |
| 2026-07-18 | Sign-in is get-first: "no passkey found" asks before creating, instead of silently minting an empty wallet | platform |
| 2026-07-21 → 08-07 | Windows users steered to Google Password Manager before the native prompt; the recovery prompt names the unlock the user will see ("your Windows Hello PIN, Touch ID, or fingerprint") | platform |
| 2026-07-29 | A transient Samsung credential-manager error during create no longer drops a user in a real browser into the in-app fallback; it offers "Try again" | platform |
| 2026-08-08 | Stale-bundle reload guard, abortable auth modal, clearer failure copy | platform |
| 2026-08-12 | Pattern-only device row added to the verification checklist | library `03f19fb` |
| 2026-08-28 | Rebuilt auth modal: in-app-browser detection at entry and on failure; fixed a create-path routing defect that sent new users into a sign-in prompt first | platform |
| 2026-08-31 | Xverse in-app browser detected before account creation | platform |
| 2026-09-10 | Recovery-phrase reveal fenced to the signed-in account's own passkey (a same-device synced passkey for another account can no longer reveal its phrase); "wrong account" is a named ceremony outcome | platform |
| 2026-09-18 → 09-22 | PRF output stripped from every server payload and no longer requested at login; a scoped PRF fallback for providers that do not return PRF at create | platform |
| 2026-09-23 | A send whose result cannot be confirmed shows "We couldn't confirm what happened" with the local transaction id, instead of guessing | platform |
| 2026-10-12 | Mainnet-only version and chain-id check before any signing prompt (the library signs for whatever network the transaction names) | platform |
| 2026-10-12 | Library 0.5.0: no public path from PRF bytes to seed material outside the gated ceremony | library `v0.5.0` |

## 4. Open items

Recorded so the gaps are as visible as the passes:

- **iPhone 17 Pro Max sign-up** (2026-10-10): one failure, browser unknown.
- **iOS in-app browsers:** the confirming pass for the SFSafariViewController / WKWebView rule.
- **Desktop Google Password Manager PRF** on a machine without a screen lock; whether passkeys survive a screen lock being turned off, per provider; the iOS no-passcode ceremony.
- **Third-party managers:** 1Password and Bitwarden on the matrix.
- **Provider sync check:** the library's `isSyncedCredential()` reads the credential's backup-eligible flag where backup-state is the accurate signal; tracked for a library release.
- **Picker scoping:** on a device holding several accounts' passkeys, the browser's passkey picker is not yet narrowed to the signed-in account for every ceremony (the recovery-phrase reveal already is; see §3, 2026-09-10).

## 5. How to check a device yourself

The by-hand procedure is in [`docs/prf-verification-checklist.md`](../prf-verification-checklist.md), and the provider notes are in [`docs/prf-support-matrix.md`](../prf-support-matrix.md). In short: create a wallet on device A, note its addresses, let the passkey sync (or use QR sign-in), sign in on device B, and compare: the same passkey must produce the same addresses on both.
