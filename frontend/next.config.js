/** @type {import('next').NextConfig} */
const backendOrigin =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:30000';

const nextConfig = {
  reactStrictMode: true,
  //poweredByHeader: false,
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
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`,
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
  // Log level for development
  loglies: false,
  // Enable strict mode for development
  reactStrictMode: true,
};

module.exports = nextConfig;
