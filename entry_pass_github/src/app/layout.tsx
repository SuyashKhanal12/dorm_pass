import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "GatePass — IIT Delhi Abu Dhabi",
  description: "Hostel exit and return pass system for IIT Delhi Abu Dhabi",
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
  themeColor: "#7B1113",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
