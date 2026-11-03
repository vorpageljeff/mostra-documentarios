import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig(({ command }) => ({
  root: "frontend",
  plugins: [
    react(),
    {
      name: "local-api",
      transformIndexHtml(html) {
        return command === "serve"
          ? html.replace(
              "https://mostra-documentarios.jeffersonvorpageldrs.chatgpt.site",
              "http://127.0.0.1:5183",
            )
          : html;
      },
    },
  ],
  publicDir: path.resolve("public"),
  build: { outDir: "../dist-frontend", emptyOutDir: true },
}));
