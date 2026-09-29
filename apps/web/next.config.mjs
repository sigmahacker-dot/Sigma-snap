/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sigma-snap/shared', '@sigma-snap/lens-sdk'],
  images: { remotePatterns: [{ protocol: 'http', hostname: '**' }, { protocol: 'https', hostname: '**' }] },
};
export default nextConfig;
