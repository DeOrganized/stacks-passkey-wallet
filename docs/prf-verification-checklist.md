# Manual PRF Verification Checklist (Living Log)

Companion to [`prf-support-matrix.md`](./prf-support-matrix.md). The matrix records
what *should* work per spec and provider docs; this file records what has actually
been **verified by hand, end to end**, on real devices.

The load-bearing assumption of the whole design is **byte-identical PRF output
across a user's synced devices**. Until the M2 browser tests automate this, the
table below is the only ground-truth record adopters can trust. If a combo is not
in the "Verified" table, treat it as unverified — not as broken, and not as known-good.

---

## The procedure (one combo = one row)

Run this for each provider/OS/browser combination you want to claim as verified.

1. **Create.** On **device A**, create a passkey through the library's create flow
   (real `navigator.credentials.create`, not a mock). Confirm PRF was returned at
   ground truth: a dedicated `get()` yields `prf.results.first` of **32 bytes**.
2. **Derive A.** Derive the wallet and record the **STX address**, the **BTC
   address**, and the **first 8 bytes of the raw PRF output** (hex) — enough to
   compare without logging full key material.
3. **Sync.** Let the passkey sync to **device B** through the *same* provider
   (iCloud Keychain or Google Password Manager). Confirm it appears in device B's
   passkey list before continuing.
4. **Derive B.** On device B, sign in with the synced passkey and derive again.
   Record the same three values.
5. **Compare.** STX address, BTC address, and PRF-prefix must be **identical**
   across A and B. Any difference = **fail** (do not ship that combo).
6. **UV consistency check.** Confirm create and get used identical
   `userVerification` — a UV/non-UV mismatch produces different PRFs on CTAP2 even
   on a "supported" provider. (`assertPlatformSupportsPrf` + the iOS 18.4 floor
   should catch the known cases; note anything that slips through.)

> Never paste full seed phrases, private keys, or complete PRF output into this
> doc or any log. The 8-byte prefix is a fingerprint for equality checking only.

---

## Verified combos (byte-identical A↔B confirmed by hand)

| # | Provider | Device A (OS / browser) | Device B (OS / browser) | STX match | BTC match | PRF-prefix match | Verified by | Date | Notes |
|---|---|---|---|---|---|---|---|---|---|
| _ | Google Password Manager | _ | _ | ☐ | ☐ | ☐ | _ | _ | _ |
| _ | iCloud Keychain | _ | _ | ☐ | ☐ | ☐ | _ | _ | _ |

_(Add one row per verified pair. Leave the placeholder rows until the first real
result replaces them.)_

## Combos to cover (priority order)

Target the two launch-supported providers first, then breadth. Contributors with
spare device coverage — see the offer on issue #1 — can claim a row here.

- [ ] **GPM** — Chrome/Android ↔ Chrome/desktop (Windows or macOS)
- [ ] **GPM** — Chrome/desktop ↔ Chrome/desktop (two machines, same Google account)
- [ ] **iCloud Keychain** — iOS 18.4+ ↔ macOS 15.4+ (Safari)
- [ ] **iCloud Keychain** — iOS 18.4+ ↔ iPadOS 18.4+
- [ ] **Cross-provider negative control** — same user, GPM vs iCloud → **must
      derive different wallets** (confirms the "new passkey = new wallet" footgun
      behaves as documented, not a regression)
- [ ] **Hybrid / caBLE (QR)** — phone provider drives result; record which provider backed it

## Known non-derivation combos (do not verify; expected to differ)

Recorded here so a "fail" against them is not mistaken for a regression. Rationale
lives in `prf-support-matrix.md`.

- Windows Hello — device-bound (TPM), single-device wallet
- Hardware security keys — device-bound
- Firefox Android / Android WebView — PRF not returned

---

_Last updated: 2026-07-17 · Update in place as combos are verified._
