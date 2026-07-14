# Setup

## Requirements

- Node.js ≥ 20.19 (the audited `@noble`/`@scure` v2 stack requires it)
- A browser with WebAuthn PRF for the demo / real use (see
  [prf-support-matrix.md](prf-support-matrix.md))

## Install & scripts

```bash
npm install

npm run typecheck    # tsc --noEmit (esbuild strips types; this is the real check)
npm test             # vitest run — all suites
npm run build        # tsup → dist/index.js (ESM) + dist/index.d.ts
npm run gen:vectors  # regenerate test/vectors/derivation.vectors.json
npm run demo         # vite dev server for the standalone demo (http://localhost:5178)
npm run demo:build   # production build of the demo
```

## Using the library in an app

```bash
npm install stacks-passkey-wallet
```

It is ESM-only, ships types, and targets modern browsers (ES2022). No Node
built-ins are required at runtime, so it bundles cleanly for the browser via
Vite/webpack/esbuild.

### Bundler note (Stacks)

`@stacks/transactions` internally bundles the legacy `@noble/secp256k1` v1, while
this library's derivation uses the v2 `@noble/curves`. Both work, but to avoid
shipping two `@noble` majors, configure your bundler to dedupe `@noble/*` (or
accept the extra ~KБ). This does not affect correctness.

## Regenerating the frozen vectors

`npm run gen:vectors` recomputes the derivation vectors and cross-validates each
against `@stacks/wallet-sdk` and `bitcoinjs-lib` before writing. It refuses to
write if anything disagrees. **Only regenerate when intentionally defining a new
wallet universe** (a salt/HKDF/path change) — see
[wallet-identity.md](wallet-identity.md).
