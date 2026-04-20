import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "My Assistant",
  description: "가계부 · 주식 · 일정을 한 곳에서",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "My Assistant",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#6366f1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKR.variable} h-full`}>
      <head>
        <link rel="apple-touch-icon" href="/icon" />
      </head>
      <body className="min-h-full bg-gray-50 font-sans antialiased">
        <div className="max-w-lg mx-auto min-h-screen">
          {children}
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
