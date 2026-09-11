import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { NavigationLoader } from "@/components/NavigationLoader";

// 어드민 테마 컬러 기능 완전 제거(티켓 20260908_1806)로 DB 조회 대신 고정값을 쓴다.
// 제거 시점 활성 프리셋 색상과 동일(코발트/아이스).
const THEME_COLORS = { mainColor: "#0033e5", subColor: "#f0f7ff" };

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { mainColor, subColor } = THEME_COLORS;
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* 고정 테마 컬러 — globals.css의 기본값을 명시적으로 덮어씀 */}
        <style>{`:root { --color-main: ${mainColor}; --color-sub: ${subColor}; }`}</style>
      </head>
      <body className="min-h-full flex flex-col">
        <NavigationLoader />
        {children}
      </body>
      {/* NEXT_PUBLIC_GA_MEASUREMENT_ID 미설정 환경(로컬 등)에서는 스크립트를 아예 렌더하지
          않는다 — GA4 스트림이 1개뿐이라 로컬 트래픽까지 섞이는 걸 막는다.
          staging/production 구분은 이벤트 파라미터(`environment`, src/lib/analytics/gtag.ts)로 한다. */}
      {gaMeasurementId && <GoogleAnalytics gaId={gaMeasurementId} />}
    </html>
  );
}
