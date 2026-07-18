# Sign-in vs. sign-up: the `get()` / `create()` ambiguity

An invisible-wallet passkey has two entry actions that look adjacent but mean
opposite things:

- **Sign in a returning user** — a WebAuthn `get()` (assertion) against an
  existing credential, whose PRF output re-derives the *same* wallet. In this
  library that is `deriveAddressesFromPasskey()` (and the other `…FromPasskey`
  calls), each of which performs a fresh `get()` internally.
- **Sign up a new user** — a WebAuthn `create()` (registration) that mints a
  *new* credential, whose PRF output derives a *new, empty* wallet. In this
  library that is `createPasskey()`.

The integration question is: when a returning user's `get()` fails, can the host
app tell **"there is no passkey for this app on this device"** apart from
**"the user dismissed the prompt"**? The answer is **no** — not reliably, and not
by design. This document explains why, why the obvious workarounds don't work,
the specific damage a wrong guess causes for a *wallet*, and the pattern we
recommend instead. It complements the README's
[#1 pitfall](../README.md#-the-1-pitfall-a-new-passkey-is-a-new-empty-wallet)
and the [integration guide](./integration.md).

## The error is deliberately ambiguous

A failed `navigator.credentials.get()` rejects with a `NotAllowedError`
`DOMException`. WebAuthn intentionally returns that *same* error for a whole set
of distinct conditions — the user declined, the ceremony timed out, **and the
case where no matching credential exists at all** — and it does so after an
indistinguishable delay. There is no separate "no credential here" outcome.

This is a privacy guarantee, not an oversight. If a page could learn that no
credential exists for its relying-party ID on the current device, any site could
silently probe for the *presence or absence* of a passkey without user
interaction — a cross-site fingerprinting and enumeration signal (does this
person have an account here?). The platform closes that channel by making
"nothing to offer" and "offered, but declined" externally identical. The cost of
that guarantee is borne by the relying party: **the ambiguity is the feature.**

## Why heuristics don't recover the distinction

It is tempting to try to re-derive the missing signal. None of the common
approaches hold up:

- **Inspecting the error.** Both cases surface as the same `NotAllowedError`.
  There is no stable error code, `name`, or property that separates them; the
  human-readable `message` is user-agent-specific, varies by version, and is not
  a contract. Branching on message text is guessing.
- **Timing the rejection.** A recurring idea is to treat a *fast* rejection as
  "no credential" and a *slow* one as "user cancelled after seeing the prompt."
  Reject latency is not portable — it depends on browser, platform, authenticator,
  and version — so any threshold that works on one target misfires on another.
- **The usernameless case defeats timing outright.** A passkey wallet typically
  signs in with a **discoverable-credential** request — `get()` with an *empty*
  `allowCredentials` — so the user need not type an identifier first. With no
  allow-list to match against, the platform does not fast-reject when there is no
  local credential: it presents the account chooser and **falls through to the
  hybrid (cross-device / QR) transport**, offering to use a passkey on a nearby
  phone. There is no early rejection to measure, so the very request shape a
  wallet uses removes the timing tell entirely.

Treat the distinction as genuinely unavailable at the point of failure.

## The danger: a silent, duplicate, empty wallet

Because the failure is ambiguous, the shortcut that suggests itself is:

> `get()` failed → just call `create()`.

For an invisible-wallet library this is the **single most damaging bug**, and it
is the README's documented #1 pitfall reintroduced one layer up. `create()` mints
a *new* passkey, and a new passkey is a **new seed → a new, empty wallet** — not
access to the existing one. So a returning user who merely dismissed the prompt,
or whose credential simply wasn't offered on this attempt, is silently handed a
brand-new empty wallet and appears to have *lost their funds and identity*. The
library can be entirely correct and this failure still occurs, because it is
introduced by the host app's fall-through — auto-`create()`-on-any-`get()`-failure
crosses the sign-in→sign-up boundary without the user ever choosing to.

The rule that follows: **an ambiguous failure must never silently cross the
`get()` → `create()` boundary.** Re-deriving an existing wallet and minting a new
one have opposite consequences and must not share an automatic path.

## Recommended pattern: `get()` first, confirm before `create()`

Try `get()` first (frictionless for the common case, a returning user), and on
failure branch on whether the error is *ambiguous* or *unambiguous* before doing
anything irreversible:

```text
async function signInOrOfferSignUp():
    try:
        wallet = await getWallet()          # get(): deriveAddressesFromPasskey()
        return signIn(wallet)               # success — re-derived the same wallet
    catch (err):
        if isUnsupportedEnvironment(err):
            # UNAMBIGUOUS: WebAuthn/PRF cannot run here at all
            # (this library: PrfUnsupportedError — reason "no-webauthn",
            # "device-bound-authenticator", "ios-below-floor", …).
            # No existing wallet could have been derived on this device,
            # so routing elsewhere cannot orphan one.
            return routeToFallback(err)     # e.g. another auth method, or guidance

        if isAmbiguousCeremonyFailure(err): # NotAllowedError: cancelled OR none
            # DO NOT auto-create — the two cases are indistinguishable.
            # Turn the ambiguity into an explicit user decision.
            return showConfirmStep({
                message: "No passkey found for this device — or the prompt "
                       + "was dismissed.",
                warning: "Creating a new passkey makes a new, separate wallet "
                       + "— not access to an existing one.",
                onTryAgain:      signInOrOfferSignUp,   # re-run get()
                onCreateNewOnPurpose: createNewWallet,   # create(): explicit only
            })

        return showGenericError(err)

async function createNewWallet():
    # Reached ONLY from an explicit confirmation, never from a bare get() failure.
    wallet = await makeWallet()             # create(): createPasskey()
    return signIn(wallet)
```

The load-bearing choices:

- **Split failures into two classes.** An *unsupported-environment* error is
  unambiguous — WebAuthn or usable PRF genuinely cannot run here (this library
  raises `PrfUnsupportedError` with a machine-readable `reason`), so there is no
  existing wallet to strand and falling through is safe. The ceremony's
  `NotAllowedError` is the ambiguous one and is the *only* case that must not
  auto-create.
- **Make sign-up an explicit, informed act.** On the ambiguous branch, show a
  short confirm step that names the consequence in plain terms — creating a new
  passkey creates a new, separate wallet — alongside a "try again" affordance.
  Proceed to `create()` only on that explicit choice. (The library exposes
  `WALLET_ACTIONS` to help keep this "add a login" vs. "new wallet" language
  straight.)
- **Prefer "try again" as the default.** Most ambiguous failures in practice are
  dismissals and mis-taps, not truly-absent credentials, so the low-regret action
  (retry the `get()`) should be the easy one and the irreversible action
  (`create()`) the deliberate one.

## Future direction: conditional mediation sidesteps the ambiguity

The ambiguity exists because a *modal* `get()` must resolve to either an
assertion or an (opaque) failure. **Conditional mediation** — passkey autofill —
removes that forcing function. Called as
`navigator.credentials.get({ mediation: "conditional", … })` behind
`PublicKeyCredential.isConditionalMediationAvailable()`, and surfaced through a
field marked `autocomplete="webauthn"`, it offers any existing passkeys inline as
autofill suggestions and — crucially — **stays silent when there are none**. The
"no credential" case becomes *no suggestion shown* rather than an
indistinguishable error, so there is nothing to disambiguate and no failed `get()`
to recover from in the common path.

It is the better long-term shape, but it is additive, not a drop-in replacement:
it needs an input surface to attach to (it does not map onto a single button) and
its own support-matrix testing across browsers. Until it is in place, the
`get()`-first / confirm-before-`create()` pattern above is the safe default; once
it is, conditional mediation removes the failed `get()` from the common case and
the confirm step becomes the exception rather than the rule.

---

*This is integration guidance for host apps. The library's normative wallet
identity and derivation contract lives in
[`wallet-identity.md`](./wallet-identity.md); platform/PRF support is tracked in
[`prf-support-matrix.md`](./prf-support-matrix.md).*
