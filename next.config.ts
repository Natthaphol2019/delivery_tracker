import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // สั่งให้ข้ามการเช็ค ESLint ตอนกด Build ขึ้น Vercel
  eslint: {
    ignoreDuringBuilds: true,
  },
  // สั่งให้ข้ามการเช็ค Type (TypeScript) ตอนกด Build ขึ้น Vercel
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;