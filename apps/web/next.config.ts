import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const apiProxyTarget = process.env.NEXT_SERVER_API_PROXY_URL ?? "http://127.0.0.1:4000/api";

const nextConfig: NextConfig = {
  typedRoutes: true,
  devIndicators: false,
  distDir: isDev ? ".next-dev" : ".next",
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
