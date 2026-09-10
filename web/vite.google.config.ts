import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "google-client",
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  build: { outDir: "../dist-google", emptyOutDir: true, assetsInlineLimit: 1000000,
    cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } },
});
