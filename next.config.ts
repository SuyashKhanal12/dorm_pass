import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          // CSP is only enforced in production.
          // In development Next.js HMR uses WebSockets that would be blocked
          // by a strict connect-src 'self' policy.
          ...(!isDev
            ? [
                {
                  key: "Content-Security-Policy",
                  value: [
                    "default-src 'self'",
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                    // 'self' added so locally-hosted fonts are never blocked.
                    "font-src 'self' https://fonts.gstatic.com",
                    "img-src 'self' data:",
                    "connect-src 'self'",
                  ].join("; "),
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
