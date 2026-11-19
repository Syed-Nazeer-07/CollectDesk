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
    ]},{source:'/organization/join',headers:[
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'Cache-Control',value:'no-store'}
    ]},{source:'/staff/activate',headers:[
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'Cache-Control',value:'no-store'}
    ]}];
  },
  async rewrites() {
    const target=process.env.API_PROXY_TARGET || 'http://127.0.0.1:4000';
    return [
      {source:'/api/health',destination:`${target}/readiness`},
      {source:'/api/v1/:path*',destination:`${target}/api/v1/:path*`}
    ];
  }
};
export default config;
