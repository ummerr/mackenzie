import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The iOS Shortcut POSTs a whole CSV body. Sessions are small (14 KB for 34
  // shots) but a long range session should not hit a limit mid-import.
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
