import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Standalone demo. The library is aliased to its source so the demo always
// reflects src/, while still importing it exactly as a consumer would
// (`import { ... } from "stacks-passkey-wallet"`).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      "stacks-passkey-wallet": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
  },
  server: { port: 5178 },
});
