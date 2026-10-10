import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// One .env at the repository root serves the web app, the workers and Prisma.
// Variables already set in the environment win.
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Keep the dev overlay badge out of demo recordings and screenshots.
  devIndicators: false,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@botheist/core", "@botheist/db", "@botheist/engine", "@botheist/solana", "@botheist/agent"],
  // Database drivers stay as runtime dependencies on the server.
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "@prisma/client"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
