import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone-сборка: самодостаточный сервер для Docker-образа web.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
