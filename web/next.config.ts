import type { NextConfig } from "next";

// Static export: the apps are plain files on Amplify Hosting; everything dynamic goes through the API.
// NEXT_DIST_DIR keeps a production build from clobbering a running dev server's .next.
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default config;
