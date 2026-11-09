import type { NextConfig } from 'next';
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // Never leak one-time token URLs via Referer headers or cached responses.
    return [{source:'/reset-password',headers:[
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'Cache-Control',value:'no-store'}
    ]},{source:'/signup/verify',headers:[
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'Cache-Control',value:'no-store'}
    ]}];
  },
  async rewrites() {
    return [{source:'/api/v1/:path*',destination:`${process.env.API_PROXY_TARGET || 'http://localhost:4000'}/api/v1/:path*`}];
  }
};
export default config;
