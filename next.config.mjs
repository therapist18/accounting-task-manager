/** @type {import('next').NextConfig} */

// `standalone` emits a self-contained server bundle under .next/standalone, which
// is what the Electron build ships (see scripts/prepare-electron-build.mjs).
//
// It is opt-in via NEXT_OUTPUT_STANDALONE rather than unconditional: the same
// `npm run build` is used by the normal web deployment, where the .next/server
// output is what gets served and the extra standalone tree is just dead weight.
// `npm run build:desktop` sets the flag.
const nextConfig = {
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
