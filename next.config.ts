import type { NextConfig } from "next";

const config: NextConfig = {
  // The SDK spawns the Copilot runtime binary from its platform package; keep it out of the bundle.
  serverExternalPackages: ["@github/copilot-sdk", "@sparticuz/chromium-min", "puppeteer-core"],
  // Every route that starts a Copilot client needs the runtime in its function bundle.
  outputFileTracingIncludes: {
    "/api/chat": ["./node_modules/@github/copilot-sdk-linux-x64/**/*"],
    "/api/models": ["./node_modules/@github/copilot-sdk-linux-x64/**/*"],
  },
};

export default config;
