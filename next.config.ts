import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.hdslb.com" },
      { protocol: "http", hostname: "*.hdslb.com" },
    ],
  },
};

export default nextConfig;
