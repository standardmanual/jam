import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/admin', label: '대시보드', icon: '📊', exact: true },
  { href: '/admin/badges', label: '배지 관리', icon: '🏅' },
  { href: '/admin/poi', label: 'POI 관리', icon: '📍' },
  { href: '/admin/itembooks', label: '아이템북', icon: '📖' },
  { href: '/admin/simulator', label: '시뮬레이터', icon: '🎮' },
  { href: '/admin/users', label: '유저 조회', icon: '👥' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  if (!adminEmails.includes(user.email ?? '')) redirect('/forbidden')

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex">
      {/* 사이드바 */}
      <aside className="w-56 border-r border-white/10 flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-white/10">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="text-[#AEEA00] font-black text-xl tracking-tighter">JAM!</span>
            <span className="text-white/40 text-xs font-semibold uppercase tracking-widest">Admin</span>
          </Link>
        </div>
        <nav className="flex-1 py-4 px-3 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-xs text-white/30 truncate">{user.email}</p>
          <Link href="/" className="text-xs text-[#AEEA00]/60 hover:text-[#AEEA00] mt-1 inline-block transition-colors">
            ← 앱으로 돌아가기
          </Link>
        </div>
      </aside>

      {/* 메인 영역 */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
