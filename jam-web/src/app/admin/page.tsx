import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminDashboardPage() {
  let badgeCount: number | null = null
  let poiCount: number | null = null
  let itemBookCount: number | null = null
  let userCount: number | null = null
  let serviceError: string | null = null

  try {
    const supabase = createServiceClient()
    const [b, p, ib, u] = await Promise.all([
      supabase.from('badges').select('*', { count: 'exact', head: true }),
      supabase.from('poi').select('*', { count: 'exact', head: true }),
      supabase.from('item_books').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }),
    ])
    badgeCount = b.count
    poiCount = p.count
    itemBookCount = ib.count
    userCount = u.count
  } catch (e) {
    serviceError = e instanceof Error ? e.message : 'Service client initialization failed'
  }

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

      {serviceError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
          <p className="font-semibold mb-1">서비스 클라이언트 오류</p>
          <p className="text-red-500">Vercel 환경변수에 <code className="bg-[#f3f4f6] px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>를 설정해주세요.</p>
          <p className="text-red-600 text-xs mt-1">{serviceError}</p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-10">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white border border-[#e5e7eb] rounded-2xl p-5 hover:border-[#d1d5db] transition-colors"
          >
            <p className="text-3xl mb-2">{stat.icon}</p>
            <p className="text-3xl font-bold tabular-nums">{stat.value.toLocaleString()}</p>
            <p className="text-[#6b7280] text-sm mt-1">{stat.label}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-base font-semibold mb-4 text-[#374151]">빠른 실행</h2>
      <div className="grid grid-cols-2 gap-3">
        {shortcuts.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="flex items-center gap-3 bg-white border border-[#e5e7eb] rounded-xl p-4 hover:border-[#111111]/30 hover:bg-[#111111]/5 transition-colors"
          >
            <span className="text-2xl">{s.icon}</span>
            <span className="font-medium">{s.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
