import {
  assertPlatformSupportsPrf,
  createPasskey,
  deriveAddresses,
  evaluatePrf,
  exportSeedPhrase,
  PrfUnsupportedError,
  providerGuidance,
  signStacksMessage,
  verifyStacksMessage,
} from "stacks-passkey-wallet";

const out = document.getElementById("out") as HTMLPreElement;
const log = (msg: string): void => {
  out.textContent += `${msg}\n`;
};

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

const rpId = location.hostname; // "localhost" in dev
let credentialId: Uint8Array | undefined;

const getInput = () => ({
  challenge: randomBytes(32),
  rpId,
  allowCredentialIds: credentialId ? [credentialId] : undefined,
});

function handle(error: unknown): void {
  if (error instanceof PrfUnsupportedError) {
    log(`✗ PRF unsupported (${error.reason}): ${error.message}`);
    log("  → a host app would fall back to Leather/Xverse connect here.");
  } else {
    log(`✗ ${(error as Error).message}`);
  }
}

// Steer Windows users toward a synced provider before they start.
const guidance = providerGuidance(navigator.userAgent);
if (guidance.steer) {
  (document.getElementById("guidance") as HTMLDivElement).textContent = `⚠ ${guidance.message}`;
}

document.getElementById("create")?.addEventListener("click", async () => {
  try {
    assertPlatformSupportsPrf();
    const credential = await createPasskey({
      rpName: "Passkey Wallet Demo",
      rpId,
      userId: randomBytes(16),
      userName: "demo-user",
      challenge: randomBytes(32),
    });
    credentialId = new Uint8Array(credential.rawId);
    log("✓ passkey created — PRF enabled");
  } catch (error) {
    handle(error);
  }
});

document.getElementById("derive")?.addEventListener("click", async () => {
  try {
    const bytes = await evaluatePrf(getInput());
    const { stacks, bitcoin } = deriveAddresses(bytes);
    bytes.fill(0);
    log(`Stacks  : ${stacks.address}`);
    log(`Bitcoin : ${bitcoin.address}`);
  } catch (error) {
    handle(error);
  }
});

document.getElementById("sign")?.addEventListener("click", async () => {
  try {
    const bytes = await evaluatePrf(getInput());
    const message = `I control this wallet — ${new Date().toISOString()}`;
    const { signature, publicKey } = signStacksMessage(bytes, message);
    bytes.fill(0);
    log(`message  : ${message}`);
    log(`signature: ${signature.slice(0, 40)}…`);
    log(`verified : ${verifyStacksMessage(message, signature, publicKey)}`);
  } catch (error) {
    handle(error);
  }
});

document.getElementById("export")?.addEventListener("click", async () => {
  const acknowledged = window.confirm(
    "Reveal your 24-word seed phrase?\n\nWrite it down privately — it is shown once and is the " +
      "only way to recover your funds. This is NOT the same as adding a passkey.",
  );
  if (!acknowledged) return;
  try {
    const seed = await exportSeedPhrase({ ...getInput(), acknowledgedBackupWarning: true });
    log(`SEED (write down — shown once): ${seed.reveal()}`);
  } catch (error) {
    handle(error);
  }
});
