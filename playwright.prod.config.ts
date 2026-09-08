import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

// Production-variant config: exercises the built app (dist/) instead of the
// dev server. Used for flows that only exist in production builds —
// currently the cross-origin-isolation service worker, which main.tsx
// registers solely when import.meta.env.PROD is true.
//
// Usage: pnpm build && pnpm exec playwright test -c playwright.prod.config.ts e2e/coi-isolation.spec.ts
// (or `pnpm test:e2e:prod`, which chains both steps).
export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: "http://localhost:3100",
  },
  webServer: {
    command: "pnpm preview --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 300000,
  },
});
