import { createClient } from '@/lib/supabase/server'
import { redirect, unstable_rethrow } from 'next/navigation'
import { AdminNav } from '@/components/admin/AdminNav'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminSidebarProvider } from '@/components/admin/AdminSidebarContext'
import { AdminMain } from '@/components/admin/AdminMain'
import { AdminBodyThemeFix } from '@/components/admin/AdminBodyThemeFix'

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

  return (
    <div
      className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 flex flex-col"
      style={{ fontFamily: ADMIN_FONT_FAMILY }}
    >
      <AdminBodyThemeFix />

      <AdminSidebarProvider>
        {/* 모바일 네비게이션 (헤더 + 드로어) */}
        <AdminNav userEmail={userEmail} />

        {/* 데스크탑 사이드바 (접기/펼치기 가능) */}
        <AdminSidebar userEmail={userEmail} />

        {/* 메인 콘텐츠 영역 — md 이상: 사이드바 접힘 상태에 맞춰 왼쪽 여백 조정 / md 미만: 헤더 아래에 콘텐츠 */}
        <AdminMain>{children}</AdminMain>
      </AdminSidebarProvider>
    </div>
  )
}
