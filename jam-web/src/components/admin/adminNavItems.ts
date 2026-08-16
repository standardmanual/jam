export type NavItem = { href: string; label: string; icon: string; exact?: boolean }
export type NavGroup = { id: string; label: string; items: NavItem[] }

export const DASHBOARD_ITEM: NavItem = { href: '/admin', label: '대시보드', icon: '📊', exact: true }

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'content',
    label: '콘텐츠 관리',
    items: [
      { href: '/admin/badges', label: '배지 관리', icon: '🏅' },
      { href: '/admin/poi', label: 'POI 관리', icon: '📍' },
      { href: '/admin/itembooks', label: '컬렉션', icon: '📖' },
      { href: '/admin/factions', label: '세계관', icon: '🌍' },
      { href: '/admin/recipes', label: '믹스 레시피', icon: '⚗️' },
      { href: '/admin/today', label: '투데이 콘텐츠', icon: '📰' },
    ],
  },
  {
    id: 'policy',
    label: '정책 및 밸런스',
    items: [
      { href: '/admin/drop-policy', label: '드랍 정책', icon: '🎲' },
      { href: '/admin/ambient-drop-policy', label: '앰비언트 드랍', icon: '🗺️' },
      { href: '/admin/combine-policy', label: '믹스 정책', icon: '🧪' },
      { href: '/admin/missions', label: '미션 관리', icon: '🎯' },
      { href: '/admin/points', label: '포인트 관리', icon: '💎' },
    ],
  },
  {
    id: 'ops',
    label: '운영 도구',
    items: [
      { href: '/admin/simulator', label: '시뮬레이터', icon: '🎮' },
      { href: '/admin/users', label: '유저 조회', icon: '👥' },
      { href: '/admin/abusing', label: '어뷰징 관리', icon: '🚨' },
    ],
  },
  {
    id: 'design',
    label: '디자인',
    items: [{ href: '/admin/theme', label: '테마 컬러', icon: '🎨' }],
  },
]

export const ALL_NAV_ITEMS = [DASHBOARD_ITEM, ...NAV_GROUPS.flatMap((g) => g.items)]

export function isNavItemActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href
  return pathname.startsWith(item.href)
}

export function activeNavGroupId(pathname: string) {
  return NAV_GROUPS.find((group) => group.items.some((item) => isNavItemActive(pathname, item)))?.id
}
