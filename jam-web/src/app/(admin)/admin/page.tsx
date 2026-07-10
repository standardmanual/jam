import Link from 'next/link'

const MENU = [
  { href: '/admin/badges', label: '배지 관리', desc: '배지 목록 조회 / 등록 / 수정' },
  { href: '/admin/poi', label: 'POI 관리', desc: 'POI 목록 조회 / 등록 / 수정 / 삭제' },
  { href: '/admin/drops', label: '드랍 이벤트 관리', desc: '드랍 포인트 등록 및 현황 확인' },
  { href: '/admin/test', label: '테스트 도구', desc: '가상 활동 시뮬레이션 / 배지 수동 발급 / Strava 강제 동기화' },
  { href: '/admin/stats', label: '유저 통계', desc: '가입자 수 / Strava 연동률 / 배지 획득 현황' },
]

export default function AdminHomePage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Admin 대시보드</h2>
      <div className="grid gap-4">
        {MENU.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block bg-gray-900 border border-white/10 rounded-xl p-5 hover:border-[#AEEA00]/50 transition-colors"
          >
            <div className="font-bold text-lg mb-1">{item.label}</div>
            <div className="text-white/50 text-sm">{item.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
