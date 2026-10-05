import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const isExtensionBuild = mode === "extension";

  return {
    plugins: [react()],
    base: isExtensionBuild ? "./" : "/",
    ...(isExtensionBuild
      ? {
          build: {
            outDir: "extension",
            emptyOutDir: false,
            rollupOptions: {
              input: {
                popup: "./src/extension.jsx",
                content: "./extension/content.js",
                background: "./extension/background.js",
              },
              output: {
                assetFileNames: "assets/[name][extname]",
                chunkFileNames: "assets/[name].js",
                entryFileNames: "assets/[name].js",
              },
            },
          },
        }
      : {}),
  };
});