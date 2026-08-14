import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavigationLoader } from "@/components/NavigationLoader";
import { getActiveThemeColors } from "@/lib/theme/get-active-preset";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JAM!",
  description: "피지털 게이미피케이션 플랫폼",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { mainColor, subColor } = await getActiveThemeColors();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* 어드민에서 활성화한 테마 프리셋 컬러 — globals.css의 기본값을 런타임에 덮어씀 */}
        <style>{`:root { --color-main: ${mainColor}; --color-sub: ${subColor}; }`}</style>
      </head>
      <body className="min-h-full flex flex-col">
        <NavigationLoader />
        {children}
      </body>
    </html>
  );
}
