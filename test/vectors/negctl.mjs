/**
 * Negative controls for verify.mjs.
 *
 * A verifier that passes unconditionally is worthless, and "all assertions
 * pass" is only evidence if the harness is capable of failing. These five
 * controls each break one thing that is supposed to matter and require the
 * result to change. If any control reports BROKEN, verify.mjs is not actually
 * testing what it claims to.
 *
 * They reuse verify.mjs's own helpers on purpose — the point is to exercise the
 * real verification path, not a parallel reimplementation of it.
 *
 * Run:  node test/vectors/negctl.mjs
 * Exit: 0 = all five controls behaved correctly, 1 = at least one did not.
 */
import { hexToBytes } from "@noble/hashes/utils.js";

import {
  bitcoinAddressAtPath,
  EXPECTED_PATHS,
  loadVectors,
  mnemonicToRoot,
  prfToMnemonic,
  verifyAll,
} from "./verify.mjs";

const doc = loadVectors();
const params = doc.hkdf;
const v = doc.vectors[0];
const prf = hexToBytes(v.prfBytesHex);
const salt = v.salt ?? doc.salt;

let broken = 0;
const control = (n, name, held, detail) => {
  if (!held) broken++;
  console.log(`  [${held ? "OK" : "BROKEN"}] ${n}. ${name}${detail ? ` — ${detail}` : ""}`);
};

console.log(`Negative controls, against vector: ${v.name}\n`);

// 1. A single flipped PRF bit must land in a completely different wallet.
//    Guards against a verifier that ignores its input entirely.
const flipped = Uint8Array.from(prf);
flipped[0] ^= 0x01;
const flippedMnemonic = prfToMnemonic(flipped, salt, params.info, params.outputBytes);
control(1, "one flipped PRF byte → different mnemonic", flippedMnemonic !== v.mnemonic);

// 2. The salt is the wallet universe: the same PRF under a different salt must
//    derive a different wallet, with no shared funds.
const otherSaltMnemonic = prfToMnemonic(prf, `${salt}-not`, params.info, params.outputBytes);
control(2, "different PRF salt → different universe", otherSaltMnemonic !== v.mnemonic);

// 3. HKDF's info string is domain separation. Changing it must change the
//    entropy, or the constant is not actually load-bearing.
const otherInfoMnemonic = prfToMnemonic(prf, salt, `${params.info}-not`, params.outputBytes);
control(3, "different HKDF info → different entropy", otherInfoMnemonic !== v.mnemonic);

// 4. REGRESSION PIN for the 0.2.0 testnet fix. Deriving at the mainnet coin
//    type (0') while encoding for testnet produced tb1… addresses that no
//    standard testnet wallet reproduces. BIP-84 mandates coin type 1'. If this
//    control ever reports BROKEN, the bug is back.
const root = mnemonicToRoot(v.mnemonic);
const wrongCoinType = bitcoinAddressAtPath(root, EXPECTED_PATHS.bitcoin, "testnet");
control(
  4,
  "testnet at mainnet coin type 0' → NOT the frozen testnet address",
  wrongCoinType !== v.bitcoin_testnet.address,
  `wrong-path address ${wrongCoinType}`,
);
root.wipePrivateData();

// 5. The harness itself must fail on bad data. Corrupt an expected address and
//    require verify.mjs to report failures rather than passing vacuously.
const tampered = JSON.parse(JSON.stringify(doc));
const target = tampered.vectors[0].stacks.address;
tampered.vectors[0].stacks.address = `SP0${target.slice(3)}`;
const failures = await verifyAll(tampered, () => {}); // silent: only the count matters
control(
  5,
  "corrupted expected address → verifier reports FAIL",
  failures > 0,
  `${failures} assertion failure(s) raised`,
);

console.log("\n=================================");
console.log(
  broken === 0
    ? "RESULT: ALL 5 CONTROLS BEHAVED CORRECTLY"
    : `RESULT: ${broken} CONTROL(S) BROKEN — verify.mjs is not proving what it claims`,
);
console.log("=================================");
process.exit(broken === 0 ? 0 : 1);
