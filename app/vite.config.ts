import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Reservas AI — Panel de negocio",
        short_name: "Reservas AI",
        description: "Gestioná reservas, conversaciones y clientes de tu negocio desde el celular.",
        lang: "es",
        start_url: "/dashboard",
        scope: "/",
        display: "standalone",
        theme_color: "#B4513A",
        background_color: "#F7F1E5",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // Sólo se precachea el shell de la app (HTML/JS/CSS/íconos) para que
        // abra instantáneo/offline como shell. No se agrega runtime caching:
        // los datos del negocio (reservas, conversaciones) van siempre a
        // InsForge/compute service por red, nunca deben servirse desde cache.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    port: 5173
  }
});
