import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ffmpeg-static", "postgres"],
  experimental: {
    // Lotes de anexos na jornada (vários PDFs/fotos por pergunta).
    serverActions: {
      bodySizeLimit: "210mb",
    },
  },
};

export default nextConfig;
