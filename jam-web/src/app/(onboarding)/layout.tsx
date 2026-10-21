import Footer from '@/components/ui/Footer'
import { PAGE_GRADIENT_BACKGROUND } from '@/lib/pageBackground'

/**
 * 온보딩(아이디·이름 → 트라이브 고르기) 전용 레이아웃 (티켓 20261021_1247 1회).
 *
 * 이 화면은 `(main)` 밖에 둔다. `(main)/layout.tsx`가 «트라이브를 고르지 않은 유저는 `/onboarding`으로 보낸다»는 게이트를 가지는데,
 * 고르기 화면이 같은 레이아웃 안에 있으면 게이트가 이 화면에서도 다시 `/onboarding`으로 보내 되돌림이 끝나지 않는다.
 * 그래서 **이 레이아웃에는 리다이렉트도 트라이브 조회도 두지 않는다.** 주소(`/onboarding`)는 라우트 그룹이라 그대로다.
 * 이미 트라이브를 고른 유저를 홈으로 돌려보내는 일은 화면(`onboarding/page.tsx`)이 `tribe_id`로 맡는다.
 *
 * `(main)`과 달리 하단 탭 바·토스트·동기화 연출을 두지 않는다. 트라이브를 고르기 전에는 앱의 다른 화면으로 갈 수 없으므로
 * 눌러도 이 화면으로 되돌아오는 탭을 보이지 않게 한다. 푸터(개인정보 처리방침·이용약관 링크)는 가입 흐름에서 읽을 수 있어야 해 그대로 둔다.
 * 배경은 `(main)`과 같은 공용 값을 쓴다.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col w-full max-w-[430px] mx-auto relative text-foreground" style={PAGE_GRADIENT_BACKGROUND}>
      <main className="flex-1 pb-[env(safe-area-inset-bottom)]">
        {/* sticky footer: 컨텐츠 래퍼가 뷰포트 높이(dvh)를 확보해 짧은 화면에서도 푸터가 그 아래로 밀려난다((main)/layout.tsx와 같은 방식) */}
        <div className="min-h-dvh">{children}</div>
        <Footer />
      </main>
    </div>
  )
}
