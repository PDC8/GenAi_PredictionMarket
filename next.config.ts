import type { NextConfig } from "next";

const major = Number.parseInt(process.versions.node.split(".")[0], 10);

if (process.env.NODE_ENV === "development" && major !== 22) {
  throw new Error(
    `[dev setup] Node ${process.versions.node} detected. Use Node 22.x for stable Next.js dev runtime.\n` +
      "Run: nvm use 22"
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3", "drizzle-orm"],
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid filesystem cache corruption in fallback compiler on some local setups.
      config.cache = false;
    }

    return config;
  }
};

export default nextConfig;
