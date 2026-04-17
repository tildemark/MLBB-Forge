/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanchez.ph",
        pathname: "/mlbb/**",
      },
    ],
  },
};

export default nextConfig;
