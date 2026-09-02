import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { defineConfig } from "vite";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: "public/magick.wasm",
          dest: ".",
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
  },
  // @ffmpeg/ffmpeg resolves its class-worker script relative to its own
  // module URL. Vite's esbuild pre-bundling rewrites that URL to a bogus
  // /node_modules/vite/deps/worker.js (404), so ffmpeg.load() hangs forever
  // and conversions stall at 0%. Keep the original files unbundled.
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
});
