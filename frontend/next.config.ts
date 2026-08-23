import type { NextConfig } from "next";

const ONE_YEAR = 60 * 60 * 24 * 365;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Safe to cache forever because lib/data.ts appends a ?v= content hash, so a
        // rebuild produces new URLs rather than stale hits. Without the hash this would
        // pin users to old data for a year.
        source: "/data/:path*",
        headers: [
          { key: "Cache-Control", value: `public, max-age=${ONE_YEAR}, immutable` },
        ],
      },
    ];
  },
};

export default nextConfig;
