import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent-facing routes read role files and the shared mission protocol from
  // agents/ at runtime. Without this they are not bundled on Vercel and a bot is
  // handed nothing where its instructions should be.
  outputFileTracingIncludes: {
    "/api/agent/**": ["./agents/**/*.md"],
  },
};

export default nextConfig;
