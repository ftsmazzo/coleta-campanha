import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ffmpeg-static", "postgres"],
};

export default nextConfig;
