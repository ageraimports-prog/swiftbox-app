import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // referral.ts is a server module, and `server-only` throws the moment it
      // is imported outside a React Server Component. Point it at the package's
      // own no-op build (the same file Next resolves under the react-server
      // condition) so the pure URL-building logic can be unit tested.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
