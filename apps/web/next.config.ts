import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const apiProxyTarget = process.env.NEXT_SERVER_API_PROXY_URL ?? "http://127.0.0.1:4000/api";
const privateNetworkDevOrigins = [
  "10.*.*.*",
  "192.168.*.*",
  ...Array.from({ length: 16 }, (_, index) => `172.${16 + index}.*.*`)
];

const nextConfig: NextConfig = {
  typedRoutes: true,
  devIndicators: false,
  distDir: isDev ? ".next-dev" : ".next",
  allowedDevOrigins: isDev ? privateNetworkDevOrigins : undefined,
  experimental: {
    devtoolSegmentExplorer: false
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/:path*`
      }
    ];
  }
};

export default nextConfig;
