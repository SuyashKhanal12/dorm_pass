import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "GatePass — IIT Delhi Abu Dhabi",
  description: "Hostel exit and return pass system for IIT Delhi Abu Dhabi students and staff.",
  applicationName: "GatePass",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GatePass",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#8B0000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        {/* Preconnect to Google Fonts for faster Inter load */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
