import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  outputFileTracingIncludes: {
    "/app/settings/api/export": ["./src/modules/integration-export/update-cms-docs.mjs"],
  },
};

export default nextConfig;
