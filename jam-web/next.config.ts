import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Supabase Storage — 배지/아이템/북 이미지
        protocol: 'https',
        hostname: 'ceehnkzdbecxwzxrhhns.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        // Google OAuth 프로필 아바타
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
