import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  base: "./",

  build: {
   outDir: "extension",
  emptyOutDir: false,

   rollupOptions: {
  input: {
    popup: "./src/extension.jsx",
    content: "./extension/content.js",
  },

      output: {
        assetFileNames: "assets/[name][extname]",
        chunkFileNames: "assets/[name].js",
        entryFileNames: "assets/[name].js",
      },
    },
  },
});