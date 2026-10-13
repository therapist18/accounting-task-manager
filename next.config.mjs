/** @type {import('next').NextConfig} */

// `standalone` emits a self-contained server bundle under .next/standalone, which
// is what the Electron build ships (see scripts/prepare-electron-build.mjs).
//
// It is opt-in via NEXT_OUTPUT_STANDALONE rather than unconditional: the same
// `npm run build` is used by the normal web deployment, where the .next/server
// output is what gets served and the extra standalone tree is just dead weight.
// `npm run build:desktop` sets the flag.
//
// The desktop build also writes to its own .next-desktop folder: a `next dev`
// running alongside it rewrites .next and would delete .next/standalone midway
// through packaging, leaving the installer without its server.
const desktopBuild = process.env.NEXT_OUTPUT_STANDALONE === "1"
const nextConfig = {
  output: desktopBuild ? "standalone" : undefined,
  distDir: desktopBuild ? ".next-desktop" : ".next",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // /api/render-pdf (headless Chromium) - keep these out of the bundle and
  // make sure the compressed Chromium binary is traced into the function,
  // since it is read from disk at runtime rather than imported.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/render-pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
}

export default nextConfig
