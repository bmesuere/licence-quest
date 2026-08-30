import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function contentSecurityPolicy(endpoint: string): Plugin {
  const origin = endpoint === "" ? "" : new URL(endpoint).origin;
  return {
    name: "licence-quest-csp",
    transformIndexHtml(html) {
      return html.replace(
        "__CONNECT_SRC__",
        origin === "" ? "'none'" : `'self' ${origin}`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  return {
    base: "./",
    plugins: [
      react(),
      contentSecurityPolicy((env.VITE_SYNC_ENDPOINT ?? "").replace(/\/$/, "")),
    ],
  };
});
