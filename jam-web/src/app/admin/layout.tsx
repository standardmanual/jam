import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect, unstable_rethrow } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AdminBodyThemeFix } from '@/components/admin/AdminBodyThemeFix'
import { SidebarInset, SidebarProvider } from '@/components/admin/ui/sidebar'

// 어드민 전용 서체 — Pretendard (globals.css 최상단에 CDN import로 전역 로드됨,
// 서비스 본체·어드민 공용). shadcn 프리셋(b5Jgcv00m) 기본 폰트값(Inter)보다
// 이 값이 우선한다 (20260826_012).
const ADMIN_FONT_FAMILY =
  "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let userEmail: string | null = null

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
    if (!adminEmails.includes(user.email ?? '')) redirect('/forbidden')

    userEmail = user.email ?? null
  } catch (err) {
    unstable_rethrow(err)
    // Supabase 초기화 실패 등 실제 오류 → 접근 거부
    redirect('/forbidden')
  }

  // shadcn Sidebar 공식 쿠키 기반 상태 유지(SIDEBAR_COOKIE_NAME="sidebar_state",
  // src/components/admin/ui/sidebar.tsx). 서버에서 미리 읽어 SidebarProvider의 초기
  // 펼침 상태로 넘겨주면 새로고침 시 깜빡임 없이 이전 접기/펼치기 상태가 복원된다
  // (기존 AdminSidebarContext의 localStorage 방식을 shadcn 공식 쿠키 방식으로 대체).
  const cookieStore = await cookies()
  const sidebarDefaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'

  return (
    // data-admin-theme: shadcn 프리셋(b5Jgcv00m) 실값(--primary 등)이 걸리는 스코프.
    // globals.css의 [data-admin-theme] 규칙과 짝을 이룸 — 전역 :root에 두면 서비스 본체와
    // 변수 이름이 충돌해 향후 오사용 시 조용히 새어나가므로 어드민 루트에만 한정한다
    // (20260826_012 게이트 리뷰 WARN 후속).
    //
    // SidebarProvider는 이 wrapper div 안에서 렌더링돼야 한다 — [data-admin-theme] 스코프
    // 밖(예: 별도 포털)으로 옮기면 --sidebar-* 등 실값이 상속되지 않아 스타일이 깨진다
    // (20260826_013 티켓 CSS 스코프 주의 사항).
    <div
      data-admin-theme=""
      className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50"
      style={{ fontFamily: ADMIN_FONT_FAMILY }}
    >
      <AdminBodyThemeFix />

      <SidebarProvider defaultOpen={sidebarDefaultOpen}>
        <AdminSidebar />
        <SidebarInset>
          <AdminHeader userEmail={userEmail} />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
