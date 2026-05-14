/** @type {import('next').NextConfig} */
const backendOrigin =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:30000';

const nextConfig = {
  reactStrictMode: true,
  // Experimental features for better DX
  experimental: {
    // Optimize package imports for faster HMR
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
  },
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Compiler optimizations
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // API proxy to backend
  async rewrites() {
    return [
      // 代理 /api/* 路径
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
      // 代理 MiniMax 相关路径 (前端使用 /minimax 而非 /api/minimax)
      {
        source: '/minimax/:path*',
        destination: `${backendOrigin}/minimax/:path*`,
      },
      // 代理 MCP 相关路径
      {
        source: '/mcp/:path*',
        destination: `${backendOrigin}/mcp/:path*`,
      },
      // 代理 n8n 相关路径
      {
        source: '/n8n/:path*',
        destination: `${backendOrigin}/n8n/:path*`,
      },
      // 代理检查点路径
      {
        source: '/checkpoint/:path*',
        destination: `${backendOrigin}/checkpoint/:path*`,
      },
    ];
  },
  // Only cache immutable build assets. Caching HTML/app routes causes stale UI and HMR issues.
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
