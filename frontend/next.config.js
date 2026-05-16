/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === 'true';

const backendOrigin = isGitHubPages
  ? process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000'
  : (process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000');

const nextConfig = {
  reactStrictMode: true,
  // GitHub Pages: use static export
  // Docker: use standalone
  // Dev: use default
  output: isGitHubPages ? 'export' : (process.env.DOCKER_BUILD ? 'standalone' : undefined),
  // GitHub Pages base path
  basePath: isGitHubPages ? '/SimpleAgent' : undefined,
  // Image optimization (required for static export)
  images: {
    unoptimized: isGitHubPages,
  },
  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // API proxy to backend (only for non-static exports)
  ...(!isGitHubPages && {
    async rewrites() {
      return [
        { source: '/api/:path*', destination: `${backendOrigin}/api/:path*` },
        { source: '/minimax/:path*', destination: `${backendOrigin}/minimax/:path*` },
        { source: '/mcp/:path*', destination: `${backendOrigin}/mcp/:path*` },
        { source: '/n8n/:path*', destination: `${backendOrigin}/n8n/:path*` },
        { source: '/checkpoint/:path*', destination: `${backendOrigin}/checkpoint/:path*` },
      ];
    },
    async headers() {
      return [
        {
          source: '/_next/static/:path*',
          headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
        },
      ];
    },
  }),
};

module.exports = nextConfig;