import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Allow importing CSS from node_modules
  transpilePackages: ['rrweb-player'],
};

export default nextConfig;
