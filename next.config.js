/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app lives in a subdirectory of the rumik-native monorepo, which has its own
  // package-lock.json; pin the tracing root here so Next doesn't guess the wrong workspace root.
  outputFileTracingRoot: __dirname,
  // There's no app/page.tsx (the old dashboard UI was replaced by the static ticker page
  // in public/), so serve the ticker at the root path.
  async rewrites() {
    return [{ source: "/", destination: "/ticker.html" }];
  },
};

module.exports = nextConfig;
