import { createClient } from '@/lib/supabase/server'
import { redirect, unstable_rethrow } from 'next/navigation'
import { Inter } from 'next/font/google'
import { AdminNav } from './AdminNav'

// 어드민 전용 서체 — Cal Sans는 공개 웹폰트가 아니라 디자인 시스템이 권장하는
// 대체 조합(Inter 600 + 네거티브 트래킹)을 그대로 사용한다.
const inter = Inter({ subsets: ['latin'], variable: '--font-admin-inter' })

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
      className={`${inter.variable} min-h-screen bg-white text-[#111111] flex flex-col`}
      style={{ fontFamily: 'var(--font-admin-inter), Inter, sans-serif', colorScheme: 'light' }}
    >
      <AdminNav userEmail={userEmail} />

      {/* 메인 영역 */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
