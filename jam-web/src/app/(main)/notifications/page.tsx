import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSeenAt, listNotificationViews } from '@/lib/notifications/feed'
import { d } from '@/lib/i18n'
import NotificationsClient from './NotificationsClient'

export const metadata = { title: `${d.notifications.title} — JAM!` }

/**
 * 알림(소식)함 — 티켓 20260824_021
 * 스펙: Specs/PRD/Notification/PRD.md §6-1
 *
 * ## 읽음 처리와 "새 소식" 구분선
 *
 * 진입하면 전체 읽음 처리한다. 그런데 그것만 하면 유저는 **뭐가 새 거였는지 알 수 없다.**
 * 그래서 이 서버 컴포넌트가 **진입 직전의 `seen_at`을 스냅샷해 함께 내려주고**, 클라이언트가
 * 그 값으로 구분선을 그린다. 읽음 처리(`POST /api/notifications/seen`)는 화면이 마운트된
 * 뒤에 일어나므로, 새로고침하면 구분선이 자연히 사라진다.
 */
export default async function NotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [seenAt, page] = await Promise.all([getSeenAt(user.id), listNotificationViews(user.id)])

  return (
    <NotificationsClient
      initialItems={page.items}
      initialCursor={page.nextCursor}
      initialFailed={page.failed}
      seenAtSnapshot={seenAt}
    />
  )
}
