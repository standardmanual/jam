import { createClient } from '@/lib/supabase/server'
import { redirect, unstable_rethrow } from 'next/navigation'
import { AdminNav } from './AdminNav'

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
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
      <AdminNav userEmail={userEmail} />

      {/* 메인 영역 */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
