import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // Import only the icons we use instead of the whole Phosphor barrel (~9k modules).
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
