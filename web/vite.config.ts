import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

// Desarrollo: `npm run web:dev` sirve la interfaz en :5173 y manda /api, /l y /salud al backend (API_URL, por omisión :3000).
// El backend exige que el Origin de lo que cambia algo sea el suyo (CSRF): el proxy lo reescribe.
const objetivo = process.env["API_URL"] ?? "http://localhost:3000";
const haciaElBackend: ProxyOptions = {
  target: objetivo,
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on("proxyReq", (proxyReq) => {
      proxyReq.setHeader("origin", objetivo);
    });
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": haciaElBackend, "/l": haciaElBackend, "/salud": haciaElBackend } },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false, target: "es2022" },
});
