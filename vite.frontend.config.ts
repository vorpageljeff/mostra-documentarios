import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  root: "frontend",
  plugins: [react()],
  publicDir: path.resolve("public"),
  build: { outDir: "../dist-frontend", emptyOutDir: true },
});
