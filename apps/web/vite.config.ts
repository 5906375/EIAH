import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8080";

  const cspDev = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    `connect-src 'self' ${apiTarget} http://localhost:8080 http://127.0.0.1:8080 ws://localhost:5173 ws://127.0.0.1:5173 ws://localhost:5174 ws://127.0.0.1:5174`,
    "worker-src 'self' blob:",
  ].join("; ");

  const cspBuild = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self'",
    `connect-src 'self' ${apiTarget} http://localhost:8080 http://127.0.0.1:8080`,
    "worker-src 'self' blob:",
  ].join("; ");

  return {
  plugins: [
    react(),
    {
      name: "inject-csp-meta",
      apply: "build",
      transformIndexHtml(html) {
        const meta = `<meta http-equiv="Content-Security-Policy" content="${cspBuild}">`;
        return html.replace("</head>", `  ${meta}\n  </head>`);
      },
    },
  ],
  server: {
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
    headers: {
      "Content-Security-Policy": cspDev,
    },
  },
  preview: {
    headers: {
      "Content-Security-Policy": cspBuild,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@repo/utils": path.resolve(__dirname, "../../packages/utils/src"),
      "@eiah/core": path.resolve(__dirname, "../../packages/core/src"),
    },
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
};
});
