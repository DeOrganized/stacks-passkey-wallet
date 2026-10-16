# Milestone 2: findings and impact recap

`stacks-passkey-wallet` is an open-source (MIT) library that turns a device passkey into a self-custodied Stacks and Bitcoin wallet. The wallet is derived from the passkey's PRF output every time it is needed and stored nowhere. Development of this milestone was supported by a Stacks Endowment grant (DeGrants Cohort 4).

This milestone was about hardening: putting the library in front of real people on real devices, reviewing it adversarially, and fixing what that turned up. This recap covers what we learned, from July to mid-October 2026. The detailed records it draws on are linked at the end.

## 1. Wallet and account usage

- **27 wallets** were created through the live passkey flow on deorganized.com, which uses this library in production. Test, staff and internal accounts are excluded from that count by a fixed rule.
- Of those, **22 accounts were opened with a passkey at sign-up**; the rest added a passkey to an existing account.
- Members have used the wallet to receive small rewards in an invite-only walkthrough, sign messages, send STX and tokens, and move funds from an existing extension wallet into their passkey account, all on mainnet.

**How we counted:** a read-only command run against the production database on 2026-10-12 counts accounts holding at least one passkey wallet created through the live flow, then removes a fixed list of staff, test and internal accounts. The full output and the account list are kept privately and are available to the Endowment on request.

## 2. Browser and device compatibility

- **Works across devices when the passkey provider syncs:** iCloud Keychain (iPhone, Mac) and Google Password Manager (Android, Chrome on desktop) carry the same passkey between devices, and the same passkey always produces the same wallet. We confirmed it on a laptop-to-iPhone sign-in, with mainnet transfers signed from desktop Chrome and a Galaxy S25, and with signing dry-runs on iPhone Safari.
- **Works without biometrics:** a phone with only a pattern lock passes, because a PIN, pattern or passcode satisfies the user-verification requirement.
- **Works inside many apps:** links opened from X, LinkedIn, Reddit, Discord, Telegram and WhatsApp on Android open in a browser tab that shares the system's passkeys, and the wallet works there.
- **Cannot work, by platform design:** Windows Hello passkeys are bound to one device and cannot sync, so the library refuses to derive a wallet from them and the platform steers Windows users to Google Password Manager. Some in-app browsers (Facebook, Instagram, TikTok, and one wallet app's own browser) cannot run the passkey extension the wallet needs; the platform detects them and shows the way out.
- **Still open:** one iPhone sign-up failure on a newer model, browser unconfirmed; in-app browsers on iPhone; some password managers (1Password reported working, Bitwarden reported no support).

The full matrix, with transaction links: [hardening.md](hardening.md).

## 3. Security findings

A structured security review ran in September 2026: two independent adversarial reads of one written threat model, covering passkey and PRF behavior, recovery flows, seed export, and cross-device behavior.

- **Two critical defects were found in the platform's integration of the library, not in the library itself.** Both were fixed, deployed and verified during the review, with no exposure found. One sent passkey extension output to the server during sign-in. The other was a legacy sign-in route that could issue a session without proof.
- **A family of address-binding weaknesses** was closed by rebuilding the platform so that every wallet address it records is proven by a signature from the key that controls it.
- **In the library:** the review found that helper functions still let code holding the passkey's PRF output produce the recovery phrase without a fresh passkey ceremony. v0.5.0 removed those helpers from the public API (below).
- **Each reader found serious issues the other missed,** and the reader that used mocks missed the most severe one, which only a real browser exposed. Both lessons became standing rules.

Since then, every change that touches signing, keys or sign-in gets an independent read before it ships. Several of those reads returned "not mergeable"; each finding was fixed and read again before release.

Full review: [security-review.md](security-review.md).

## 4. Recovery and seed-export edge cases

- **The seed phrase is abstracted, not eliminated.** Members never have to write anything down to start, but the phrase still exists and can be revealed, because that is what makes the wallet theirs. It restores the wallet in any Stacks wallet, such as Xverse or Leather.
- **Revealing it is fenced:** only the signed-in account's own passkey can reveal its phrase. A synced passkey for a different account on the same device is refused.
- **A lost passkey means a new wallet address.** The account continues with a new passkey. Funds are recovered by restoring the saved phrase in any Stacks wallet and sending them to the new address. Our recovery copy now says exactly that, rather than implying the platform can recover funds.
- **Custody, stated precisely (v0.5.0):** "Holding the PRF bytes is holding the seed. The library exposes no path from PRF bytes to seed material outside the gated ceremony; it does not and cannot prevent code that already holds PRF bytes from deriving the seed independently." An earlier release stated this too broadly; the [v0.5.0 release notes](https://github.com/DeOrganized/stacks-passkey-wallet/releases/tag/v0.5.0) correct the record.
- **Every account is a hot wallet.** We say so wherever it matters. The answer is architecture, not reassurance: hold what you can afford to lose, and use a more secure setup for value that matters.

## 5. Issues identified

From the review, field reports and our own testing:

- Passkey extension output reached the server (fixed).
- A legacy sign-in route could issue a session without proof (fixed).
- Wallet addresses were stored without proof of possession (fixed by rebuild).
- The recovery-phrase reveal accepted another account's passkey on a shared device (fixed).
- The seed-export seal was incomplete in the library (fixed in v0.5.0).
- A send whose result couldn't be confirmed was reported as "nothing sent", a duplicate-payment risk (fixed: it now shows the transaction to check).
- Cancelled and missing-credential errors look identical by design in WebAuthn, which can silently create a second, empty wallet (fixed with a get-first sign-in pattern, documented in `docs/get-vs-create-ambiguity.md`).
- In-app browsers without passkey support could create duplicate accounts (detection fixed; merging duplicates still open).
- On a device holding several accounts' passkeys, the passkey picker isn't yet narrowed to the signed-in account for every action (open).
- The passkey's RP ID, not the page, bounds the wallet, and hosts sharing the RP ID had not been treated as part of that boundary (raised externally 2026-10-15; among the hosts identified and probed, none third-party, user-supplied or dangling; library docs updated; further hardening scheduled for immediately after this milestone, see [security-review.md](security-review.md) §8.8).

## 6. Changes and improvements made

- **Library releases:**
  - **v0.3.0:** an audit-and-correct cycle that narrowed documentation claims to what the code enforces.
  - **v0.4.0:** Stacks transaction signing, `signStacksTransaction`, designed in public with a game studio as design partner, with frozen test vectors and refusal of transactions that don't protect the assets they move.
  - **v0.5.0:** the custody seal.
- **Platform:** members can now send STX and tokens from their DeOrganized account, and move funds from an existing wallet into it. The signing step checks the exact transaction bytes it signs, refuses anything not on mainnet before any prompt, and shows tokens it doesn't recognise as unverified, with their contract.
- **Process:** an independent read before merge on every value or sign-in change; five consecutive clean test runs before merge; a live check against real services before merging anything that calls an outside API.
- **Any token (2026-10-14):** members can send any token they hold, from a searchable picker; every token's details are read from its own contract before it can be sent.

## 7. User and builder feedback

- **Users:** 8 members completed a structured survey after walking through account setup and wallet use on deorganized.com. Every step averaged 4.5 out of 5 or higher. The lowest was saving the recovery phrase, which is deliberately the step with the most friction. The clearest requests were:
  - step-by-step rather than all-at-once guidance;
  - more help on mobile;
  - clearer explanation of what the transaction explorer shows;
  - short learning resources about STX and Bitcoin.

  Participants were invited individually and received small amounts of STX and USDCx during the walkthrough (returning part of the STX in its send step), and earned DAPs, DeOrganized's participation signal, which is not money. Rewards were for completing steps; answers were never rewarded. Details: [feedback.md](feedback.md).
- **Builders:**
  - **Rapha-btc (Pillar, Juice)** reviewed the library publicly. That review shaped the trust-model language, the device verification checklist, and the decision to build transaction signing.
  - **Skullcoin Strike** served as design partner for `signStacksTransaction`.
  - **Xtrata** is evaluating the library for its apps.

  Records: [builder-evaluations.md](builder-evaluations.md).

## 8. Key learnings and next steps

**Learnings:**
- **Mocks can't see transport.** The most severe finding, and our most visible production slip, were both invisible to mocked tests. Real browsers and live services are now part of the bar.
- **Two independent readers beat one.** Each found what the other missed, and readers kept finding real issues after the review ended. We made the practice permanent.
- **Say exactly what the code enforces.** Two of our corrections were to our own claims, not our code. Publishing the correction is part of the work.
- **Sync is the product.** Whether a passkey wallet is portable depends almost entirely on the user's passkey provider, so steering people to a syncing provider matters as much as the cryptography.

**Next:**
- signing back in with a recovery phrase, in-app or through a wallet app where it has been restored, so recovery lands at the same account and address;
- narrowing the passkey picker to the signed-in account everywhere;
- closing the open device cells;
- the remaining library hardening items listed in the review.

The library is built so any app can offer this same experience.

---

Records: [hardening.md](hardening.md) · [security-review.md](security-review.md) · [builder-evaluations.md](builder-evaluations.md) · [feedback.md](feedback.md) · [releases](https://github.com/DeOrganized/stacks-passkey-wallet/releases)
