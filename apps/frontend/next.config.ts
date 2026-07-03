const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  generateBuildId: async () => {
    return 'damnmail-static-' + Date.now()
  },
  images: {
    unoptimized: true
  },
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || '/api/proxy'
  }
}

export default nextConfig

// Add netlify functions to static export allowed files
// The output: 'export' already includes netlify/functions directory

// Manually add the proxy function for better control
// Note: Netlify automatically includes files in the functions directory for static exports