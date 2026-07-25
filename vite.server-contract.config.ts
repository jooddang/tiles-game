import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/leaderboard/serverContractEntry.ts"),
      formats: ["es"],
      fileName: () => "replay-kernel.mjs",
    },
    outDir: "dist-server-contract",
    target: "node22",
  },
});
