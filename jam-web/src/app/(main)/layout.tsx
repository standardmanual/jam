import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  return (
    <ToastProvider>
      <div className="min-h-dvh flex flex-col w-full relative">
        {/* 메인 컨텐츠 — 각 페이지가 자체 원색 풀블리드 배경과 상단 브랜딩을 지정 */}
        <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
          {children}
        </main>

        {/* 하단 탭 바 */}
        <TabBar />
      </div>
    </ToastProvider>
  )
}
