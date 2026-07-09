import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminDashboardPage() {
  const supabase = createServiceClient()

  const [
    { count: badgeCount },
    { count: poiCount },
    { count: itemBookCount },
    { count: userCount },
  ] = await Promise.all([
    supabase.from('badges').select('*', { count: 'exact', head: true }),
    supabase.from('poi').select('*', { count: 'exact', head: true }),
    supabase.from('item_books').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }),
  ])

  const stats = [
    { label: '배지', value: badgeCount ?? 0, href: '/admin/badges', icon: '🏅' },
    { label: 'POI', value: poiCount ?? 0, href: '/admin/poi', icon: '📍' },
    { label: '아이템북', value: itemBookCount ?? 0, href: '/admin/itembooks', icon: '📖' },
    { label: '유저', value: userCount ?? 0, href: '/admin/users', icon: '👥' },
  ]

  const shortcuts = [
    { label: '배지 등록', href: '/admin/badges/new', icon: '➕' },
    { label: 'POI 등록', href: '/admin/poi/new', icon: '📌' },
    { label: '아이템북 등록', href: '/admin/itembooks/new', icon: '📝' },
    { label: '시뮬레이터 실행', href: '/admin/simulator', icon: '🎮' },
  ]

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-8">대시보드</h1>

      <div className="grid grid-cols-4 gap-4 mb-10">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-colors"
          >
            <p className="text-3xl mb-2">{stat.icon}</p>
            <p className="text-3xl font-bold tabular-nums">{stat.value.toLocaleString()}</p>
            <p className="text-white/50 text-sm mt-1">{stat.label}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-base font-semibold mb-4 text-white/70">빠른 실행</h2>
      <div className="grid grid-cols-2 gap-3">
        {shortcuts.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-4 hover:border-[#AEEA00]/30 hover:bg-[#AEEA00]/5 transition-colors"
          >
            <span className="text-2xl">{s.icon}</span>
            <span className="font-medium">{s.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
