import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Increase body size limit for API route handlers (file uploads)
  serverExternalPackages: [],
};

export default nextConfig;
