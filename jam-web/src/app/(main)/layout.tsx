import { redirect } from 'next/navigation'
import Link from 'next/link'
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
      <div className="min-h-dvh bg-[#EAEAE4] text-[#111111] flex flex-col w-full relative">
        {/* 상단 헤더 */}
        <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-3 min-h-14 bg-[#EAEAE4] sticky top-0 z-40">
          <Link href="/" className="flex items-center gap-1 select-none">
            <span className="font-black text-2xl tracking-tighter text-[#111111]">JAM!</span>
          </Link>
        </header>

        {/* 메인 컨텐츠 */}
        <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
          {children}
        </main>

        {/* 하단 탭 바 */}
        <TabBar />
      </div>
    </ToastProvider>
  )
}
