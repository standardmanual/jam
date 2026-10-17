import type { CSSProperties } from 'react'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ToastProvider } from '@/components/ui/Toast'
import TabBar from '@/components/ui/TabBar'
import Footer from '@/components/ui/Footer'
import StravaConnectReveal from '@/components/StravaConnectReveal'
import StravaDuplicateSheet from '@/components/strava/StravaDuplicateSheet'
import { TopNavDataProvider } from '@/lib/topNavData'
import { resolveStravaUiState } from '@/lib/strava/connection-state'
import { hasUnread, latestBumpingNotificationAt } from '@/lib/notifications/feed'
import { getAdminQuestPreview } from '@/lib/onboarding-quest/preview'
import QuestPreviewBanner from '@/components/QuestPreviewBanner'
import { PAGE_GRADIENT_BACKGROUND } from '@/lib/pageBackground'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const service = createServiceClient()
  // TopNav 3분할(20260824_010) — 우측 아바타·중앙 동기화 버튼에 필요한 데이터를
  // 레이아웃에서 한 번만 조회해 컨텍스트로 내려준다(호출부 각각 조회하지 않음).
  // 20260824_021: 알림 종의 빨간 버블 판정도 여기서 함께 내려준다. seen_at은 위 users
  // 조회에 컬럼 하나만 더 붙이고, 최신 소식 시각은 병렬로 읽어 왕복 지연을 더하지 않는다.
  const [{ data: profileRaw }, { data: stravaConnRaw, error: stravaConnError }, latestBumpingAt, questPreview] = await Promise.all([
    service
      .from('users')
      .select('username, avatar_url, notifications_seen_at')
      .eq('id', user.id)
      .maybeSingle(),
    // 연결 상태 판정에 필요한 두 칸만 읽는다(connection-state.ts 한 곳에서 판정)
    service
      .from('strava_connections')
      .select('disconnected_at, disconnect_reason')
      .eq('user_id', user.id)
      .maybeSingle(),
    latestBumpingNotificationAt(user.id),
    // 관리자 전용 퀘스트 미리보기 띠(티켓 20260928_0138, N5b). 쿠키가 없으면 관리자 조회
    // 자체를 하지 않아(getAdminQuestPreview 내부) 일반 유저 진입 비용이 늘지 않는다.
    getAdminQuestPreview(),
  ])
  const profile = profileRaw as {
    username: string | null
    avatar_url: string | null
    notifications_seen_at: string | null
  } | null
  const username = profile?.username ?? null
  const avatarUrl = profile?.avatar_url ?? null
  // 조회가 실패하면 상단 메뉴는 이전과 같이 동기화 시작 버튼(none)으로 둔다 — 라벨이 중립이고
  // 끊김·연결됨을 단정하지 않는다. 실패는 로그로만 남긴다.
  if (stravaConnError) console.error('[(main)/layout] strava_connections 조회 실패', stravaConnError)
  const stravaState = stravaConnError ? 'none' : resolveStravaUiState(stravaConnRaw)
  const hasUnreadNotifications = hasUnread(latestBumpingAt, profile?.notifications_seen_at ?? null)

  return (
    <ToastProvider>
      <TopNavDataProvider value={{ username, avatarUrl, stravaState, hasUnreadNotifications }}>
        <div
          className="min-h-dvh flex flex-col w-full max-w-[430px] mx-auto relative"
          // 띠가 있을 때 TopNav의 안전영역 padding-top을 0으로 눌러 이중 여백을 없앤다 —
          // 안전영역은 물리적 최상단인 띠가 진다(design-system/components/navigation/TopNav.jsx
          // `--topnav-safe-top` 폴백 참고, 티켓 20260928_0138 재작업 ①).
          style={questPreview ? ({ '--topnav-safe-top': '0px' } as CSSProperties) : undefined}
        >
          {/* 관리자 전용 퀘스트 미리보기 띠 — null이면 DOM에 아예 없다(관리자가 아니거나
              미리보기 중이 아닐 때). 문서 흐름 안에 두어 TopNav를 아래로 민다(fixed 오버레이
              아님, 채원 판정 승인 항목 ①). */}
          {questPreview && <QuestPreviewBanner value={questPreview} />}

          {/* 메인 컨텐츠 — 각 페이지가 자체 원색 풀블리드 배경과 상단 브랜딩을 지정.
              배경은 `--background` 단색이며(라이트 그라데이션 재설계는 티켓 20261015_2133), 값은
              `@/lib/pageBackground`에 있다((legal) 레이아웃과 공용, 티켓 20260929_1400). */}
          <main
            className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]"
            style={PAGE_GRADIENT_BACKGROUND}
          >
            {/* sticky footer 트릭: 컨텐츠 래퍼가 뷰포트 높이(dvh)를 항상 확보해, 컨텐츠가 짧아도
                Footer가 화면 중간이 아닌 항상 그 아래로 밀려나게 한다.
                main은 flex-basis:0%로 크기가 정해지는 flex 아이템이라 `height` computed value가
                'auto'로 남는다 — 자식의 `min-h-full`(퍼센트)이 여기에 기대는 percentage-of-flex-item
                해석에 의존하는데, 실측 결과 브라우저가 이를 해석하지 않아(auto로 폴백) Footer가
                화면 안에 그대로 남는 회귀가 있었다. 퍼센트 대신 뷰포트 절대 단위(dvh)를 써서
                이 의존성 자체를 없앤다. */}
            <div className="min-h-dvh">{children}</div>
            <Footer />
          </main>

          {/* 하단 탭 바 */}
          <TabBar username={username} />

          {/* 최초 Strava 연동 직후(reveal=1) 획득 배지 연출.
              콜백 리다이렉트 도착 지점이 profile 경유로 한 번 더 옮겨가므로
              특정 페이지가 아니라 레이아웃에 둔다 (20260824_003) */}
          <StravaConnectReveal username={username} />

          {/* 중복 연결 안내(?strava=duplicate, 티켓 20261017_1422) — 이미 다른 JAM! 계정에 동기화된
              Strava 계정이라 저장하지 않았음을 알린다. 목적지가 어디든 열리도록 레이아웃에 둔다 */}
          <StravaDuplicateSheet />
        </div>
      </TopNavDataProvider>
    </ToastProvider>
  )
}
