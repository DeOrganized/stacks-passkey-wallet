# WebAuthn PRF support matrix (living doc)

Seeded from the Milestone-1 diagnosis (V4, 2026-07-14); completed during M2
hardening. A passkey wallet needs **byte-identical PRF output across all of a
user's synced devices** — that is the axis that matters here, not just "does PRF
run."

## Browser engine — does `getClientExtensionResults().prf.results` return bytes?

| Engine | PRF | Since |
|---|---|---|
| Chrome / Edge desktop | ✅ | 116 (Aug 2023) |
| Safari desktop (macOS) | ✅ | 18.0 (Sep 2024) |
| Chrome on Android | ✅ | 116 |
| Safari iOS/iPadOS | ✅ (reliable cross-device **18.4+**) | 18.0; floor 18.4 |
| Firefox desktop | ✅ | 139 (May 2025) |
| Firefox Android / Android WebView | ❌ | — |

## Provider — PRF **and** byte-identical across synced devices?

| Provider | PRF | Synced-consistent | Notes |
|---|---|---|---|
| **iCloud Keychain** | ✅ | ✅ | iOS/iPadOS 18.4+, macOS 15.4+. The 18.0–18.3 hybrid-vs-local mismatch is fixed in 18.4. |
| **Google Password Manager** | ✅ | ✅ | On by default; broadest and most reliable. |
| **Windows Hello** | ✅ | ❌ | Device-bound (TPM). Would be a single-device wallet — **not supported for derivation**. |
| **Hardware keys** | ✅ (fw ≥5.2) | ❌ | Device-bound. |
| **Hybrid / caBLE (QR)** | ✅ | follows phone's provider | |

## Launch support (this library)

| Tier | Target |
|---|---|
| Supported | iCloud Keychain (iOS/iPadOS 18.4+, macOS 15.4+); Google Password Manager (Chrome/Edge 116+, incl. Windows & Android) |
| Not for derivation | Windows Hello, hardware keys — device-bound |
| Unsupported | Firefox Android, Android WebView, cross-vendor hybrid |

The **iOS 18.4 floor is enforced in code** (`assertPlatformSupportsPrf`), not just
documented. Windows *users* are supported via Google Password Manager; the
create-flow steers them there (`providerGuidance`).

## Failure surface (for feature detection)

Unsupported PRF is signalled non-uniformly:

| Situation | `getClientExtensionResults()` |
|---|---|
| Browser ignored the extension | `prf` absent → `PrfUnsupportedError("prf-not-processed")` |
| Authenticator can't PRF at create | `{ prf: { enabled: false } }` |
| `get()` returned no bytes | `{ prf: {} }` → `PrfUnsupportedError("no-prf-results")` |

Ground truth is a real `get()` returning `prf.results.first` of 32 bytes.

## Implementation gotchas (carried into the library)

- **Salt is hashed by the browser:** `actualSalt = SHA-256("WebAuthn PRF" ‖ 0x00 ‖ inputSalt)`.
- **HKDF the PRF output** before BIP-39 (don't use PRF bytes directly).
- **Dedicated `get()`** for bytes; don't rely on create-time results.
- **UV consistency:** create and get must use identical `userVerification` (CTAP2
  keeps separate UV/non-UV PRFs). Enforced + tested.

## Sources

W3C WebAuthn L3 · MDN WebAuthn extensions · WebKit Safari 18.0 notes · Chrome 116
notes · Apple Developer Forums 764730/774112 · Chrome-for-Devs GPM · Yubico PRF
guides. See the M1 diagnosis report for the full citation set.
