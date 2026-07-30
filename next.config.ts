import type { NextConfig } from "next";

const noStoreHeaders = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
  { key: "Pragma", value: "no-cache" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/", headers: noStoreHeaders },
      { source: "/login", headers: noStoreHeaders },
      { source: "/reset", headers: noStoreHeaders },
    ];
  },
};

export default nextConfig;
