import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ToastProvider } from '@/components/ui/Toast'
import TabBar from './TabBar'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const service = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profileRaw } = await (service as any)
    .from('users')
    .select('username')
    .eq('id', user.id)
    .maybeSingle()
  const username = (profileRaw as { username: string | null } | null)?.username ?? null

  return (
    <ToastProvider>
      <div className="min-h-dvh flex flex-col w-full relative">
        {/* 메인 컨텐츠 — 각 페이지가 자체 원색 풀블리드 배경과 상단 브랜딩을 지정 */}
        <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
          {children}
        </main>

        {/* 하단 탭 바 */}
        <TabBar username={username} />
      </div>
    </ToastProvider>
  )
}
