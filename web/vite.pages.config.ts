import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "pages-client",
  base: process.env.PAGES_BASE_PATH || "/pack-qa-checker/",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  build: { outDir: "../dist-pages", emptyOutDir: true },
});
