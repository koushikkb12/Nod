import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages load WASM, native binaries or browser builds from disk at
  // runtime, so Node must require them directly instead of bundling them.
  serverExternalPackages: [
    "@electric-sql/pglite",
    "playwright",
    "playwright-core",
    "unpdf",
    "mammoth",
    "pg",
  ],
  experimental: {
    serverActions: {
      // CV uploads go through server actions.
      bodySizeLimit: "8mb",
    },
  },
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
