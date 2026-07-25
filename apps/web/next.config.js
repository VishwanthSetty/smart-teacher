/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@smart-teacher/shared-types'],
};

module.exports = nextConfig;
