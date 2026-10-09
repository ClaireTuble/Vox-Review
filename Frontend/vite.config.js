import { readFileSync } from "node:fs";
import process from "node:process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { DEFAULT_API_URL, DEFAULT_APP_URL } from "./extension/config.js";

function extensionManifestPlugin(apiUrl, appUrl) {
  return {
    name: "extension-manifest",
    generateBundle() {
      const manifestSource = readFileSync(
        new URL("./extension/manifest.json", import.meta.url),
        "utf8",
      );
      const manifest = JSON.parse(manifestSource);
      const localHostPermissions = manifest.host_permissions.filter((permission) => {
        const hostname = new URL(permission.replace(/\/\*$/, "")).hostname;
        return hostname === "localhost" || hostname === "127.0.0.1";
      });
      const apiHostPermission = apiUrl ? `${new URL(apiUrl).origin}/*` : null;
      const appOrigin = new URL(appUrl || DEFAULT_APP_URL).origin;
      const appHostPermission = `${appOrigin}/*`;
      const hostPermissions = [
        ...new Set([
          ...localHostPermissions,
          ...(apiHostPermission ? [apiHostPermission] : []),
          appHostPermission,
        ]),
      ];
      manifest.host_permissions = hostPermissions;
      manifest.content_scripts = manifest.content_scripts.filter(
        (contentScript) => !contentScript.js.includes("assets/authSync.js"),
      );
      manifest.content_scripts.push({
        matches: [`${appOrigin}/*`],
        js: ["assets/authSync.js"],
        run_at: "document_idle",
      });

      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const isExtensionBuild = mode === "extension";
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiUrl = env.VITE_API_URL || DEFAULT_API_URL;
  const appUrl = env.VITE_APP_URL || DEFAULT_APP_URL;
  const appOrigin = new URL(appUrl).origin;

  return {
    define: isExtensionBuild
      ? { __VOXREVIEW_APP_ORIGIN__: JSON.stringify(appOrigin) }
      : {},
    plugins: [
      react(),
      ...(isExtensionBuild
        ? [extensionManifestPlugin(apiUrl, appUrl)]
        : []),
    ],
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
                authSync: "./extension/authSync.js",
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