# stacks-passkey-wallet: security review

This is the public record of the structured security review of `stacks-passkey-wallet`, and of the platform surfaces that carry the wallet's trust on deorganized.com, the library's production integration. It covers the review conducted in September 2026 and the reviewed changes made through 2026-10-22.

It describes the work at disposition level: what each defect was and what was done about it. Reproduction detail lives in the internal reader reports and is deliberately not reproduced here. Those reports, and the commit references for the platform's private repositories, are available to the Stacks Endowment on request.

---

## 1. Summary

The review was **two independent adversarial reads of one written threat model**, with the previously known findings withheld from both readers and used afterward to check the method.

It covered the four areas the wallet's security rests on: **passkey and PRF behavior, recovery flows, seed export, and cross-device and cross-browser behavior**. A platform service outside the library was also reviewed as a secondary ring. Its findings are recorded internally.

**Outcome.**
- Two critical defects were found in the **platform's integration** of the wallet, not in the library. Both were reproduced, fixed, deployed and verified within the review window, and a blast-radius check showed no exposure had occurred.
- A family of address-binding weaknesses was closed by rebuilding the platform so that every wallet address it records is proven by a signature from the key that controls it.
- The remaining fix-first items (an account-deletion authorization gap, a dead destructive code path, a shared-device mis-bind hazard) were fixed in one build, which also found and closed two further account-authorization defects (§4.3).
- In the library, the review found that the seed-export seal was incomplete. That was fixed in **v0.5.0** (§8.5). Other library hardening items are scheduled.

Every finding has a disposition (§4).

The most important methodological result: **each independent reader found serious issues the other missed** (§3).

## 2. Method

**2.1 Threat model.** A written brief set the scope: the published `stacks-passkey-wallet@0.4.0` artifact, audited against its published types rather than local source, plus the platform's sign-in modal, send ceremony and wallet-binding paths. It ranked the assets (the PRF-derived key material; the account-to-wallet binding; signing authority; the derivation constants), named the trust boundaries (authenticator and browser; the passkey provider's cloud account as de facto custodian; library and host; frontend and backend; device and sync fabric), and listed the threat actors. They included the platform itself, with claim accuracy as a target, and a compromised passkey-provider account, which readers were required to treat as in scope.

**2.2 Two independent readers.** Both reads ran from the identical brief with no shared context. Each reader was told to actively construct exploit paths, pin every finding to a file and line in the published artifact or a repository commit, and list what it could not assess. Reader 1 drove the real browser path, using a virtual authenticator running actual WebAuthn ceremonies. Reader 2 exercised the published package against mocked WebAuthn results and ran the test suites.

The two readers were automated review sessions rather than people: Reader 1 was Claude Code and Reader 2 was OpenAI Codex, each run in September 2026. Each ran under the withheld-priors check (§2.3) and pinned every finding to a file and line in the published artifact or a repository commit.

**2.3 Withheld-priors check.** Previously known findings were withheld from both readers: a prior binding-and-continuity audit, open library issues, and a sealed-export design decision. Afterward each was scored. **Every withheld prior was rediscovered by at least one reader (8 of 8), and six of eight by both.** Both readers also independently found that the sealed-export seal was incomplete.

**2.4 Reconciliation.** Where both readers found the same defect, it is recorded as an agreement. Where one found what the other missed, the difference was settled by reproduction, never by majority.

**2.5 Reproduction discipline.** Both criticals were reproduced before any fix. Fixes were mutation-tested: each protective check was removed in turn to confirm its test fails. The merged suite had to pass five consecutive clean runs before merge (§3.3).

## 3. Methodological findings

**3.1 Two readers caught what one would have missed, in both directions.** Reader 1 alone found the most severe defect (§4.1) and the open-delete defect. Reader 2 alone found the send ceremony's transaction-id mismatch hazard and the backup-eligible versus backed-up distinction, among others.

**3.2 Mock-based reads cannot catch transport leaks.** Reader 2, working through mocks, concluded the backend never sees PRF material and so missed the most severe finding, because the real browser's credential serialization never ran. Reader 1 found the leak in the actual request body. **Standing requirement: at least one reader exercises the real browser path.**

**3.3 One green test run was not enough.** A pre-existing signature-parsing defect, affecting roughly 0.8% of valid signatures and causing occasional spurious sign-in failures, survived six commits under single-run testing. It surfaced only once five consecutive clean runs were required. That requirement is now standing for sign-in changes, and was applied to every value-path change reviewed since (§8.7).

**3.4 A read-only diagnose before each fix build acts as a third read.** The fix build began with a read-only look at the surrounding code. It found two defects neither reader had reported, sharing one root cause (§4.3). Every fix build now starts this way.

**3.5 What could not be assessed.** Real-provider PRF behavior on physical iOS, Android and Windows devices and over hybrid transport; provider-account recovery in practice; non-Chrome serialization (only Chrome was driven); an in-app seed-phrase sign-in, which does not yet exist; deployed CSP headers (CSP has since been enforced; see 8.8); and the full transitive dependency supply chain. Deployment-state items (network posture, log retention) were closed afterwards by direct operator reads. Real-device behavior is recorded separately in the device matrix ([hardening.md](hardening.md)).

**3.6 Independent reads are now a standing gate (adopted 2026-10-12).** Any change to the signing ceremony, key or seed handling, sign-in, deletions, the library's public surface, security-review evidence, or a number cited to a grantor or partner gets a read by a reviewer not briefed on the implementation before it merges. Each read is a fresh session, and every finding gets a recorded disposition. §8 lists the reads run under this rule.

**3.7 A live check against real services is part of the merge bar for anything that calls an outside API (adopted 2026-10-13).** A token-display change passed its full mocked suite and three independent reads, then failed in production for a wallet holding more than 200 tokens: the public API rate-limited the burst of reads, which mocks could not show. It was caught within the hour and caused no loss. Nothing unsafe could be sent; unknown tokens were simply unsendable. The fix was a paced, prioritised request queue in which the reads a send depends on settle within a fixed 30-second deadline. It was verified live on a real wallet with more than 200 tokens and shipped on 2026-10-14 after further independent reads. This is the §3.2 lesson again: mocks cannot see transport behavior, including a third party's.

## 4. Findings and dispositions

Severity is the reconciled severity. Disposition is the state as of 2026-10-14.

### 4.1 Critical: fixed, deployed, verified

**PRF output sent to the backend.** The platform's passkey ceremonies serialized the whole credential object into the request sent for WebAuthn verification, including the PRF extension output, which is the wallet's root secret. Sign-in also requested PRF where it is never needed. *(Reader 1, real-browser reproduction.)*
- **Fixed:** the server request is now built explicitly and carries no extension output; sign-in no longer requests PRF; the backend refuses any credential carrying PRF material.
- **Blast radius:** application logs were searched for the relevant fields with zero hits; no performance or error-tracking tooling was configured; no proxy sits in the request path. The material passed through memory and TLS only. **No rotation and no member notification were required.**

**Legacy wallet sign-in issued a session without proof.** A legacy wallet sign-in route could bind an arbitrary signing key to an account and issue a session with no server-issued nonce, including for passkey-created accounts. *(Both readers.)*
- **Fixed:** the route refuses passkey accounts, requires a server-issued single-use nonce, and the client-side replay of a stored signature was removed.
- **Audit:** no account had been affected.

### 4.2 High: address binding, fixed by rebuild

**Wallet addresses stored without proof of possession.** The platform accepted client-supplied wallet addresses at bind time without checking that the signing key controlled them. During the fix it emerged that the ownership check the platform believed it had **had never worked in production**: a malformed address-encoding routine plus a call to a verification method that did not exist and silently returned false. *(Both readers.)*

**Fixed:** wallet binding was rebuilt to require proof of possession, meaning the recovered signing key must control the claimed address. It is enforced at account creation, on every sign-in (with self-healing of any earlier mis-bound record), and on wallet linking. The encoding was corrected and every stored address re-encoded to canonical form.

A residual group of 21 dormant, never-active external-wallet accounts remains in the pre-fix state. It carries no value: at most a session, never the wallet key. Each self-corrects on any proven sign-in.

### 4.3 High: fixed, deployed, verified

- **Account deletion lacked an ownership check:** any signed-in user could delete any user. *(Reader 1.)* **Fixed:** deletion is owner-or-staff only. A non-owner's attempt is refused and nothing is deleted, with dependent records also tested.
- **Passkey registration accepted client-computed addresses** without a signature proof. *(Both readers.)* **Fixed:** registration and add-a-passkey issue a single-use server message. The derived wallet key signs it, and the server verifies the signature controls the claimed address **before any account or binding exists**. A failed proof creates nothing. This was verified end to end with a live production sign-up after deploy. Bitcoin addresses cannot be proven by a Stacks signature and are stored as display data only (§6.1).
- **Two further defects found by the fix build's own diagnose** share one root cause and were fixed in the same build:
  - **Anonymous account creation:** a default creation route was reachable without signing in and accepted a role and a wallet address from the client. **Fixed:** the route is closed; accounts are created only through the sign-in flows.
  - **Client-settable account role at setup:** the wallet-account setup path accepted a role from the client. **Fixed:** setup ignores any client role, and the field is read-only on every client-facing path.
  - **Root cause:** a self-service role opt-in was retired in July 2026 at the interface and on the profile path, but the field stayed writable on two other paths. **A read-only production audit of all accounts found no sign that either defect had been used.** No account was modified.
- **A diagnostic file-listing route left reachable without signing in** (file paths only; the files were already public by design). It was found by a routine diagnose after the review closed and was not exploited, as far as we know. **Fixed:** the route was removed (2026-09-23).

### 4.4 Medium

| Finding | Found by | Disposition |
|---|---|---|
| Unscoped fallback PRF evaluation at sign-up (shared-device mis-bind hazard) | Reader 1 | **Fixed**: scoped to the credential just created; confirmed in the served production bundle |
| A dead cascade-delete on the sign-in path (unreachable, but one data slip from destructive) | Fix build | **Fixed**: removed; a test guards that sign-in deletes nothing |
| A send whose result couldn't be confirmed was reported as "nothing was sent", a duplicate-payment hazard | Reader 2 | **Fixed** (2026-09-23): reported as unknown, with the transaction id to check |
| Recovery copy overstated: no in-app seed sign-in exists, and recovery after a lost passkey lands at a new address | Reader 2 | **Copy corrected**: the phrase restores the wallet in any Stacks wallet; a lost passkey means a new passkey and a new address; funds are moved from the restored wallet; every account is a hot wallet. Same-address recovery is scheduled (§5, principle 2) |
| "Add a passkey" creates a new wallet; backup confirmation is account-level | Both | **A standing design property** (§5, principle 1), not a defect to close |
| No signal when a passkey appears on a new device or provider | Reader 1 | **Scheduled**: a new-device security notification |
| Sealed-export claim incomplete: public helpers produced the phrase from held PRF bytes | Both | **Fixed in v0.5.0** (2026-10-12): the three helpers that turned PRF bytes into seed material are removed from the public API, and the earlier claim is corrected in the release notes (§8.5) |
| The library's export has no which-wallet fence (the platform mitigates this on its side) | Both | Library release |
| Backup-eligible reported as "synced" | Reader 2 | Library release |
| An orphan device-bound credential can remain after a refused create | Reader 2 | Scheduled (prevention layer) |

### 4.5 Low and informational

- A timeout re-runs the create step, which can leave an orphan passkey (scheduled).
- Script injection on the host page equals key compromise. This is accepted as hot-wallet class; a content security policy is owed (delivered 2026-10-22; see 8.8).
- The browser-version floor for PRF consistency can be bypassed (library release).
- The sign-in path's backup gate (tracked publicly as library issue #13).
- An acknowledgement flag is checked by truthiness (library release).
- The export-custody flag is account-level (design pass).
- A stale README shipped in the 0.4.0 package (library release).

**Verified positives (both readers):**
- the create and get PRF invariants hold in the artifact;
- the frozen derivation vectors reproduce;
- the transaction-signing origin fence refuses the wrong origin and Allow-mode asset movement;
- the platform's signing and reveal fences fail closed on a wrong passkey;
- seed export is reveal-once, with redacted serialization and zeroed buffers.

### 4.6 Secondary ring

A platform service outside the library was reviewed in the same exercise. Its findings were addressed in code and are recorded in the internal review files, available to the Endowment on request.

## 5. Standing design principles adopted from the review

1. **Several passkeys means several wallets, and the member must always be able to see that.** By construction each passkey is its own wallet. The platform must always be able to show a member their wallets and addresses, and must remind and check whenever an account holds more than one passkey.
2. **A wallet restored from its phrase must be usable on the platform, not only recoverable off it.** Today the phrase restores the wallet in another app, while the platform's own signing is passkey-bound. The scheduled direction is that a member can sign back in with the phrase, in-app or through a wallet app where they restored it, and land at the same account and address.
3. **Value crossings trigger security escalation.** When a wallet's value crosses set thresholds, the member is told about security posture, backup, and safer storage than a hot wallet. Hot-wallet honesty becomes a behavior, not only a disclosure.

## 6. Remediation evidence

Library changes link to the public repository. The platform's repositories are private, so their commit references are kept in the internal record and are available to the Endowment on request.

| Fix | Closes | How it was verified |
|---|---|---|
| PRF transmission | §4.1, first item | Deployed to both tiers; production sign-in verified; log search zero hits; no performance tooling or proxy in path |
| Wallet sign-in | §4.1, second item | Deployed; audit found no affected accounts |
| Address-proof rebuild | §4.2; the signature-parsing defect (§3.3) | Deployed; production sign-in verified with a real wallet; all stored addresses re-encoded and checked idempotent; five-run suite stability |
| Account authorization (deletion ownership, closed anonymous creation, read-only role, dead delete removed) | §4.3; §4.4 dead delete | Deployed 2026-09-22; live probes: anonymous create refused, anonymous delete refused; five-run suite stability |
| Scoped fallback PRF | §4.4, first row | Deployed 2026-09-22; the scoped call confirmed present in the served bundle, absent before |
| Passkey address proof | §4.3, second item | Frontend deployed first (compatible with both server versions), then the server, strict; end to end, a real production passkey sign-up succeeded after deploy (2026-09-22) |
| Send-result honesty | §4.4 | Deployed 2026-09-23; served bundle verified |
| Recovery copy | §4.4 | Corrected wording ruled 2026-09-21 |
| Custody seal | §4.4 sealed export | [v0.5.0 release](https://github.com/DeOrganized/stacks-passkey-wallet/releases/tag/v0.5.0), published on npm |

### 6.1 Known limitations and accepted residuals

- **Bitcoin addresses are unproven.** A Stacks signature cannot prove control of the Bitcoin address derived from the same seed, and there is no BIP-322 verifier yet. Bitcoin addresses are stored as display data and are never used for authorization.
- **Passkey accounts created before the proof fix keep their original address records.** They cannot be re-proven without the member's key. Scheduled: re-prove at the account's next signing ceremony. No value path depends on an unproven passkey address, because the signing fence holds.
- **Strict-enforcement transient.** For about five minutes after the server deploy, a ceremony begun before it was refused once and succeeded on retry. A refused attempt can leave an unused passkey on the device, the same class as the scheduled timeout item.

## 7. What remains

- Scheduled: the new-device security notification and the orphan-passkey fixes (§4.4, §4.5).
- Library hardening still scheduled: the which-wallet export fence, backup-eligible versus backed-up, the truthiness-checked flag, the browser-version floor, the stale README.
- The design principles in §5.

Both readers found the wallet's core cryptographic properties intact. The defects found were in the platform's integration and in the accuracy of claims at the library's edges. They were fixed where they were live and are scheduled where they are not.

## 8. Continued review, 2026-09-25 to 2026-10-22

Changes to the wallet's trust surfaces after the September review, each with how it was reviewed.

**8.1 Wallet-account linking.** A review of linking an existing wallet to an account ran with an independent reader. Its findings and dispositions are recorded in the internal review files.

**8.2 An exposure incident, closed.** A platform route exposed stored files more broadly than intended. It was fixed by a hotfix that an independent reader cleared before merge. Credentials that could have been exposed were rotated, and the database was made private. It is recorded here because it bears on the platform's integrity, although it did not touch wallet key material: the wallet's secrets are never stored or sent (§4.1).

**8.3 Access hardening (2026-10-07).** Unauthenticated or over-broad routes were closed: unused proxies were removed, a data export now requires sign-in, and an image endpoint now validates its input. Live probes after deploy confirmed each. Two partial findings from the independent read were fixed before merge.

**8.4 Member send: the signing door (2026-10-12).** Members can send STX and SIP-010 tokens from a passkey account.
- The signing ceremony checks the transaction as decoded from its own bytes, never from a description supplied alongside it, and signs only that checked copy.
- It admits a native STX transfer, or a SIP-010 transfer carrying the platform's own Deny-mode exact post-condition, and refuses anything else.
- It refuses any transaction not for mainnet before any prompt (the library signs for whatever network a transaction names, so the application must refuse first).
- It checks the passkey before the prompt.
Three independent reads ran before merge.

**8.5 Library v0.5.0: the custody seal (2026-10-12).** This closes the §4.4 sealed-export finding: there is no public path from PRF bytes to seed material outside the gated ceremony. The custody statement, as published with the release: "Holding the PRF bytes is holding the seed. The library exposes no path from PRF bytes to seed material outside the gated ceremony; it does not and cannot prevent code that already holds PRF bytes from deriving the seed independently." Independent reads covered the release and the platform's upgrade to it. Field check: the recovery-phrase reveal works with the right passkey and refuses the wrong one.

**8.6 Moving and sending any token (2026-10-13 to 2026-10-14).** Members can move SIP-010 tokens from a connected extension wallet into their passkey account, and send any SIP-010 token they hold.
- The transfer builder, the signing door and the wallet request share one definition of a SIP-010 transfer with the platform's exact Deny-mode post-condition.
- Before merge, the first independent read found that the signing screen could show a token from an unknown contract under a familiar symbol (high), and that the token-standard check was too loose (medium). Both were fixed and confirmed closed by further reads.
- Tokens outside a fixed known list always show as unverified on the signing screen, with their contract identifier.
- Every token a member selects, the known ones included, is checked against its own contract before it can be sent. Transfers are built only from the chain's own values; decimals are never guessed.
- The token picker that followed (2026-10-14) adds two things. Display data comes from an indexer with a validated on-chain fallback, and is used for display only. Reads to the public API go through a paced, prioritised queue (§3.7).

**8.7 Method in this window.** Every change in §8.4 and §8.6 passed a five-run test bar and at least one independent read before merge. Several reads returned "not mergeable". Every finding was fixed and read again before the merge. The §3.7 rule was added after a display defect reached production with no loss of funds.

**8.8 External finding: the RP ID as the wallet's boundary (2026-10-15).** An external reviewer noted in the library's public discussions that, because the PRF salt is a public constant, the boundary around a user's wallet is the passkey's RP ID rather than the page that hosts the wallet: any origin able to use the RP ID can run the same ceremony and derive the same seed, and the prompt looks the same. The September threat model had not named hosts sharing the RP ID as a trust boundary. An audit of the platform's hosts found, among those identified and probed, none that is third-party, serves user-supplied code or is dangling, and no Related Origins file. The library's documentation now describes the RP ID as a security surface and as part of wallet identity ([securing-your-funds.md](../securing-your-funds.md#the-rp-id-as-a-security-surface)). Further hardening of the platform's hosts is scheduled for immediately after this milestone, including a Content Security Policy, which the platform does not yet serve.

- **2026-10-22:** Content Security Policy enforced on deorganized.com (commit reference in the internal record), after a walk of the member routes under the enforced policy, including a live send. `'wasm-unsafe-eval'` is allowed solely for code that browser extensions inject into pages; the application itself compiles no WebAssembly. A report-only copy of the policy stays in place for one cycle.

---

Related records: [findings-recap.md](findings-recap.md) · [hardening.md](hardening.md) · [builder-evaluations.md](builder-evaluations.md) · [feedback.md](feedback.md)
