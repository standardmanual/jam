import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ToastProvider } from '@/components/ui/Toast'
import TabBar from '@/components/ui/TabBar'
import Footer from '@/components/ui/Footer'
import StravaConnectReveal from '@/components/StravaConnectReveal'
import { TopNavDataProvider } from '@/lib/topNavData'
import { hasUnread, latestBumpingNotificationAt } from '@/lib/notifications/feed'

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
  const [{ data: profileRaw }, { data: stravaConnRaw }, latestBumpingAt] = await Promise.all([
    service
      .from('users')
      .select('username, avatar_url, notifications_seen_at')
      .eq('id', user.id)
      .maybeSingle(),
    service.from('strava_connections').select('user_id').eq('user_id', user.id).maybeSingle(),
    latestBumpingNotificationAt(user.id),
  ])
  const profile = profileRaw as {
    username: string | null
    avatar_url: string | null
    notifications_seen_at: string | null
  } | null
  const username = profile?.username ?? null
  const avatarUrl = profile?.avatar_url ?? null
  const stravaConnected = Boolean(stravaConnRaw)
  const hasUnreadNotifications = hasUnread(latestBumpingAt, profile?.notifications_seen_at ?? null)

  return (
    <ToastProvider>
      <TopNavDataProvider value={{ username, avatarUrl, stravaConnected, hasUnreadNotifications }}>
        <div className="min-h-dvh flex flex-col w-full max-w-[430px] mx-auto relative">
          {/* 메인 컨텐츠 — 각 페이지가 자체 원색 풀블리드 배경과 상단 브랜딩을 지정 */}
          <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] bg-surface">
            {children}
            <Footer />
          </main>

          {/* 하단 탭 바 */}
          <TabBar username={username} />

          {/* 최초 Strava 연동 직후(reveal=1) 획득 배지 연출.
              콜백 리다이렉트 도착 지점이 profile 경유로 한 번 더 옮겨가므로
              특정 페이지가 아니라 레이아웃에 둔다 (20260824_003) */}
          <StravaConnectReveal username={username} />
        </div>
      </TopNavDataProvider>
    </ToastProvider>
  )
}
