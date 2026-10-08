import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "GatePass — IIT Delhi Abu Dhabi";
const DESCRIPTION =
  "Hostel exit and return passes for IIT Delhi Abu Dhabi. Students request from their hostel; staff approve in real time.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "GatePass",
  icons: { icon: "/iitd-seal.svg" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "GatePass",
    type: "website",
  },
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
  colorScheme: "light",
  themeColor: "#F5F5F7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Inter is the fallback for devices without SF Pro. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
