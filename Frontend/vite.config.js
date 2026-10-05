import { readFileSync } from "node:fs";
import process from "node:process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function extensionManifestPlugin(apiUrl) {
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
      const hostPermissions = [
        ...new Set([
          ...localHostPermissions,
          ...(apiHostPermission ? [apiHostPermission] : []),
        ]),
      ];
      const hostPermissionsMatch = manifestSource.match(
        /("host_permissions"\s*:\s*)\[[\s\S]*?\]/,
      );
      if (!hostPermissionsMatch) {
        throw new Error("Could not find host_permissions in extension/manifest.json.");
      }
      const formattedPermissions = JSON.stringify(hostPermissions, null, 2)
        .replace(/\n/g, "\n  ");

      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: manifestSource.replace(
          hostPermissionsMatch[0],
          `${hostPermissionsMatch[1]}${formattedPermissions}`,
        ),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const isExtensionBuild = mode === "extension";
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    plugins: [
      react(),
      ...(isExtensionBuild ? [extensionManifestPlugin(env.VITE_API_URL)] : []),
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