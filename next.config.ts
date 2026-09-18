import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // OneDrive can lock files in .next during local builds. Set NEXT_DIST_DIR to
  // use a separate local build directory without changing the deployment output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;

