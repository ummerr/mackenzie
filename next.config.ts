import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Zero-build static pages under public/. Rewrites (not Vercel cleanUrls)
      // so the extensionless URLs work in `next dev` too.
      { source: "/courses", destination: "/courses/index.html" },
      { source: "/ball-flight", destination: "/ball-flight.html" },
    ];
  },
  async redirects() {
    return [
      // The profile moved to the front page when the two sites merged.
      { source: "/profile", destination: "/", permanent: true },
      // /scratch and /diary merged into /rounds (2026-08-24). Fragments
      // survive client-side, so old /diary#<scorecardId> deep links land on
      // the same anchors in their new home.
      { source: "/scratch", destination: "/rounds", permanent: true },
      { source: "/diary", destination: "/rounds", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/data/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;
