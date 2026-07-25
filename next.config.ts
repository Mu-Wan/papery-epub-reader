import type { NextConfig } from "next";

const isTauri = process.env.PAPERY_STATIC_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isTauri
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        trailingSlash: true,
        typescript: { ignoreBuildErrors: true },
      }
    : {}),
};

export default nextConfig;
