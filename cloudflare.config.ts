import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "error-notification-tail-worker",
    compatibilityDate: "2026-10-06",
    entrypoint,
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      logs: { enabled: true },
    },
    env: {
      INCOMING_WEBHOOK_URL_01: bindings.secret(),
      INCOMING_WEBHOOK_URL_02: bindings.secret(),
      CLOUDFLARE_ACCOUNT_ID: bindings.secret(),
    },
  },
});
