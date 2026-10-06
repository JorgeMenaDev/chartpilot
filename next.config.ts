import type { NextConfig } from "next";

const config: NextConfig = {
  // The SDK spawns the Copilot runtime binary from its platform package; keep it out of the bundle.
  serverExternalPackages: ["@github/copilot-sdk"],
  outputFileTracingIncludes: {
    "/api/chat": ["./node_modules/@github/copilot-sdk-linux-x64/**/*"],
  },
};

export default config;
