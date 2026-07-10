import Link from 'next/link'

const TOOLS = [
  {
    href: '/admin/test/simulate',
    label: '가상 활동 시뮬레이션',
    desc: '활동 종류와 거리를 선택해 배지 엔진 + 드랍 엔진을 실행합니다. 실제 Strava 연동 없이 테스트 가능.',
    icon: '🚴',
  },
  {
    href: '/admin/test/award-badge',
    label: '배지 수동 발급',
    desc: '특정 유저에게 activity 배지를 즉시 발급합니다.',
    icon: '🏅',
  },
  {
    href: '/admin/test/add-item',
    label: '아이템 수동 추가',
    desc: '특정 유저의 인벤토리에 아이템 배지를 직접 추가합니다. (30일 만료)',
    icon: '📦',
  },
  {
    href: '/admin/test/force-sync',
    label: 'Strava 강제 동기화',
    desc: 'Strava 연동된 유저의 활동을 지금 바로 동기화합니다.',
    icon: '🔄',
  },
]

export default function TestHomePage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin" className="text-white/40 text-sm hover:text-white/70">
          ← Admin 홈
        </Link>
      </div>
      <h2 className="text-2xl font-bold mb-2">테스트 도구</h2>
      <p className="text-white/50 mb-6 text-sm">코딩 없이 배지·아이템·동기화를 테스트할 수 있는 도구 모음입니다.</p>
      <div className="grid gap-4">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="block bg-white/5 border border-white/10 rounded-xl p-6 hover:border-[#AEEA00]/50 transition-colors"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{tool.icon}</span>
              <span className="font-bold text-lg">{tool.label}</span>
            </div>
            <p className="text-white/50 text-sm leading-relaxed">{tool.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
