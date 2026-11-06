import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    // Playwright のテスト（e2e/）は Vitest では動かさない。supabase/tests は PGlite で SQL を確かめる
    include: ["lib/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    environment: "node",
  },
});
