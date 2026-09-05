/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app lives in a subdirectory of the rumik-native monorepo, which has its own
  // package-lock.json; pin the tracing root here so Next doesn't guess the wrong workspace root.
  outputFileTracingRoot: __dirname,
};

module.exports = nextConfig;
