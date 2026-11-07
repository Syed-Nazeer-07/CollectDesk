import type { NextConfig } from 'next';
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{source:'/api/v1/:path*',destination:`${process.env.API_PROXY_TARGET || 'http://localhost:4000'}/api/v1/:path*`}];
  }
};
export default config;
