import { PAGE_GRADIENT_BACKGROUND } from '@/lib/pageBackground'

/**
 * 정책 문서(개인정보 처리방침·위치기반서비스 이용약관) 전용 레이아웃 (티켓 20260929_1400).
 *
 * `(main)/layout.tsx`와 달리 인증 호출·리다이렉트가 없다 — 로그인하지 않은 방문자도 열 수
 * 있어야 하기 때문이다(개인정보 보호법 제30조제2항). ToastProvider·TopNavDataProvider·
 * TabBar·Footer·StravaConnectReveal도 두지 않는다. 로그인 여부와 무관하게 같은 최소 화면이다.
 *
 * 배경은 `(main)`과 같은 그라데이션을 공용 상수로 함께 쓴다(사용자 결정, 2026-09-29).
 * `main`의 overflow 스크롤 컨테이너가 없어 문서 스크롤이며, 하단은 안전영역만 확보한다.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-dvh w-full max-w-[430px] mx-auto text-text pb-[env(safe-area-inset-bottom)]"
      style={PAGE_GRADIENT_BACKGROUND}
    >
      {children}
    </div>
  )
}
