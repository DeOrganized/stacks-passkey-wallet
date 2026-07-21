# Integrating a passkey wallet alongside existing wallet auth

Most apps that adopt this library already have a wallet-extension sign-in (and
often an email path too). Adding a passkey-derived wallet as a third method is
easy to unify at the *button* — one modal, three options — and easy to leave
split *behind* the button, where each method still creates its session its own
way. The split is subtle and tends to surface only after you add a logged-out
landing page. These are the patterns that keep the methods coherent, written
symptom-first.

The library itself is deliberately small and stateless — it derives addresses and
signs messages (`deriveAddressesFromPasskey`, `signStacksMessage`) and persists
nothing. Everything below is about the surrounding auth code you write, not the
library; the same patterns apply whether the "other" method is a browser
extension, a hardware wallet, or WalletConnect.

## Symptom: the wallet connects, but the app doesn't treat the user as signed in

You connect the wallet; the extension reports connected; parts of the UI show a
"disconnect" control — yet a hard refresh drops you back to logged-out, and
session-gated features behave as if no one is signed in.

**Pattern: connection is not a session.** A connected wallet means one thing —
the app can *ask it to sign*. It does not mean the app has authenticated the
user. Authentication is the token you mint *after* the wallet signs a challenge
and your backend verifies it. Keep the two states distinct and let **only the
session** drive auth-dependent chrome and routing:

- `walletConnected` — an extension/credential is available to sign.
- `authenticated` — a verified session (token) exists.

If any header, menu, or route decision reads `walletConnected` instead of
`authenticated`, you will render a signed-in-looking UI for someone who has no
session. Make `authenticated` the single source of truth; `walletConnected` is an
implementation detail of one method.

## Symptom: sign-in completes from an in-app page but not from the entry point

Connecting from your landing/marketing page appears to do nothing; the *same*
connect from a page inside the app shell completes and signs you in.

**Pattern: create the session in the auth action, not in a component effect.**
It's tempting to kick off `connect()` from the button and then finish the job —
request the signature, verify it, store the token — in a `useEffect` that watches
"wallet just connected." But an effect only runs where its component is mounted.
Your newest entry point (a logged-out landing that intentionally omits the app
shell) may not mount the component that carries that effect, so the session step
silently never fires there. Put the whole sequence in the function the button
calls:

```text
async function signInWithWallet():
    address = await connect()          # promise-based connect returns/exposes the
                                        # address synchronously once it resolves —
                                        # no reactive hop needed to read it
    signature = await sign(challenge(address))
    session   = await verifyOnServer(address, signature)   # mint + store token
    return { ok: true, isNew: session.isNew }
```

Now completion depends on the *action*, not on which chrome happens to be on
screen. (The same applies to a passkey method: derive + authenticate inside the
action, not in a mounted effect.)

## Symptom: passkey/email feel instant, but the wallet path reloads the page

Two methods update in place; the third calls a full page reload "to show the
authenticated state."

**Pattern: don't mix reload-based and SPA auth.** A reload is usually a
work-around for state updates that were never wired — it forces a fresh read of
persisted tokens instead of updating in place. It also diverges from your other
methods and throws away SPA context (scroll, modals, in-flight nav). Have every
method do the same two things on success: set session state, then navigate the
same way. If one method still needs a reload to look signed in, treat that as a
signal that its state updates are incomplete, and fix those instead.

## Symptom: new users get a different first-run depending on how they signed up

A bring-your-own-wallet user lands in a profile-setup form; a passkey user gets a
welcome and a seed-backup nudge; an email user gets nothing — three separate
forks that drift apart over time.

**Pattern: one onboarding pipeline; compose method-specific steps into it.** Have
every method report success up a single channel with a small, uniform shape —
`{ method, isNew }` — and let one handler own routing and the welcome moment.
Method-specific needs then compose *into* that pipeline rather than forking it:

- a newly-derived passkey wallet has a seed the user should back up (this library
  exposes a one-time seed export for exactly that step);
- a brand-new external wallet may need a profile-setup step before an account
  exists;
- an email account may need nothing beyond a light welcome.

Each is a step the shared handler inserts for that `{ method, isNew }`, not a
parallel flow. One pipeline means one place to change onboarding, and no method
quietly missing a step.

## Bringing it together

```text
# one action per method, all returning the same shape
signInWithWallet()  -> { ok, isNew }   # connect -> sign -> verify -> store
signInWithPasskey() -> { ok, isNew }   # derive  -> authenticate -> store
signInWithEmail()   -> { ok, isNew }   # code    -> verify -> store

# one success channel
onAuthed({ method, isNew }):
    if isNew and method needs setup: route to setup, then resume onAuthed
    else if isNew:                   show welcome (method-appropriate), go to app
    else:                            go to app

# chrome reads the session, nothing else
render:  authenticated ? accountMenu : signInButton
```

## Why this bites specifically once you have a logged-out landing

While your only entry point is inside the app shell, a component-mounted
completion step and a `walletConnected`-keyed chrome both *happen* to work — the
component is always there, and a connected wallet almost always coincides with a
session. Add a logged-out landing (or any entry that omits the shell) and both
assumptions break at once: the completion effect isn't mounted there, and a user
can be wallet-connected with no session while the chrome insists they're signed
in. Designing session creation to not depend on chrome, and chrome to depend only
on the session, is what makes the new entry point behave like the old ones.
