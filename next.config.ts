import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cabeceras para servir correctamente el manifest y assets de la PWA
  async headers() {
    return [
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
