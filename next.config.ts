import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // nodemailer is a Node-only library; keep it external so it isn't bundled.
  serverExternalPackages: ["nodemailer"],
};

export default nextConfig;
