import type { CSSProperties } from 'react'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ToastProvider } from '@/components/ui/Toast'
import TabBar from '@/components/ui/TabBar'
import Footer from '@/components/ui/Footer'
import StravaConnectReveal from '@/components/StravaConnectReveal'
import StravaDuplicateSheet from '@/components/strava/StravaDuplicateSheet'
import PendingItemsPickerProvider from '@/components/strava/PendingItemsPickerProvider'
import { countPendingItems } from '@/lib/strava/pending-items'
import { TopNavDataProvider } from '@/lib/topNavData'
import { resolveStravaUiState } from '@/lib/strava/connection-state'
import { hasUnread, latestBumpingNotificationAt } from '@/lib/notifications/feed'
import { getAdminQuestPreview } from '@/lib/onboarding-quest/preview'
import QuestPreviewBanner from '@/components/QuestPreviewBanner'
import { PAGE_GRADIENT_BACKGROUND } from '@/lib/pageBackground'
import ChapterRiseWatcher from '@/components/chapter/ChapterRiseWatcher'
import { parseChapterNo } from '@/lib/chapter/celebrate'
import { hasTribe, TRIBE_SELECT_PATH } from '@/lib/tribe/gate-contract'

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
  const [
    { data: profileRaw, error: profileError },
    { data: stravaConnRaw, error: stravaConnError },
    latestBumpingAt,
    questPreview,
    pendingItemsCount,
    { data: chapterRaw, error: chapterError },
  ] = await Promise.all([
    service
      .from('users')
      .select('username, avatar_url, notifications_seen_at, tribe_id')
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
    // 고르기를 기다리는 동기화 보류 개수(티켓 20261017_1425). 숫자만 클라이언트 프로바이더에 내려 앱을 열 때 고르기 화면을 다시 띄운다.
    // 서버 전용 헬퍼라 이 서버 컴포넌트에서만 가져온다. 읽지 못하면 0으로 두고 로그만 남긴다(레이아웃이 깨지지 않는다 —
    // 보류는 동기화 버튼(409)에서도 다시 만난다).
    countPendingItems(service, user.id).catch((err: unknown) => {
      console.error('[(main)/layout] 동기화 보류 개수 조회 실패', err)
      return 0
    }),
    // 챕터 오름 축하 연출용 지금 챕터 번호(티켓 20261019_1317). 이 레이아웃은 화면을 열 때마다 돌아 **번호 한 칸만** 읽는다 —
    // 진행 비율은 읽지 않는다(챕터는 숫자로만 표기해 연출은 번호만 있으면 된다, 2026-10-21 결정). 챕터가 없으면(행 없음·NULL) 연출 대상이 아니다.
    service.from('user_chapters').select('chapter_no').eq('user_id', user.id).maybeSingle(),
  ])
  const profile = profileRaw as {
    username: string | null
    avatar_url: string | null
    notifications_seen_at: string | null
    tribe_id: string | null
  } | null

  // 트라이브 게이트(티켓 20261021_1247, 운영 로직 2장): 트라이브를 고르기 전에는 이 레이아웃 아래 어느 화면도 쓸 수 없다.
  // 로그인 직후만이 아니라 앱에 들어오는 모든 경로가 이 레이아웃을 지나므로 여기서 한 번 판정한다(판정 기준은 `users.tribe_id` 하나 —
  // 로그인 콜백·프로필 경유지·고르기 화면도 같은 `hasTribe`를 쓴다). 고르기 화면은 `(onboarding)` 그룹에 있어 이 판정을 지나지 않는다 — 되돌림 반복이 없다.
  // `users`를 읽지 못했을 때는 막지 않고 로그만 남긴다: 읽기 실패 한 번으로 트라이브를 고른 유저를 고르기 화면으로 쫓아내지 않기 위해서다.
  // 이 화면 게이트는 보상을 주지 않는다 — 동기화·Strava 연결은 API가 읽지 못하면 «있음»으로 보지 않고 거절한다(`lib/tribe/gate.ts`).
  // 행이 없는 경우(`profile` null, 오류 없음)는 트라이브가 없는 것이다.
  if (profileError) {
    console.error('[(main)/layout] users 조회 실패 — 트라이브 게이트를 건너뛴다', profileError)
  } else if (!hasTribe(profile?.tribe_id)) {
    redirect(TRIBE_SELECT_PATH)
  }
  const username = profile?.username ?? null
  const avatarUrl = profile?.avatar_url ?? null
  // 조회가 실패하면 상단 메뉴는 이전과 같이 동기화 시작 버튼(none)으로 둔다 — 라벨이 중립이고
  // 끊김·연결됨을 단정하지 않는다. 실패는 로그로만 남긴다.
  if (stravaConnError) console.error('[(main)/layout] strava_connections 조회 실패', stravaConnError)
  const stravaState = stravaConnError ? 'none' : resolveStravaUiState(stravaConnRaw)
  const hasUnreadNotifications = hasUnread(latestBumpingAt, profile?.notifications_seen_at ?? null)
  // 읽지 못하면 로그만 남기고 연출하지 않는다(레이아웃이 깨지지 않는다). 챕터가 없거나 값이 손상됐으면 null이다.
  if (chapterError) console.error('[(main)/layout] user_chapters 조회 실패 — 챕터 오름 연출을 건너뛴다', chapterError)
  const chapterNo = chapterError ? null : parseChapterNo((chapterRaw as { chapter_no?: unknown } | null)?.chapter_no)

  return (
    <ToastProvider>
      <TopNavDataProvider value={{ username, avatarUrl, stravaState, hasUnreadNotifications }}>
        <PendingItemsPickerProvider initialPendingCount={pendingItemsCount}>
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

            {/* 챕터 오름 축하 카드(티켓 20261019_1317) — 챕터가 있을 때만. 기기에 저장된 «마지막으로 축하한 챕터»보다
                높으면 다음에 앱을 열 때 한 번 띄운다. 목적지가 어디든 열리도록 레이아웃에 둔다 */}
            {chapterNo !== null && <ChapterRiseWatcher chapterNo={chapterNo} userId={user.id} />}
          </div>
        </PendingItemsPickerProvider>
      </TopNavDataProvider>
    </ToastProvider>
  )
}
