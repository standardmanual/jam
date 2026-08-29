import type { ComponentType } from 'react'
import {
  IconLayoutDashboard,
  IconAward,
  IconBarcode,
  IconMapPin,
  IconBook,
  IconWorld,
  IconFlask,
  IconNews,
  IconDice,
  IconCloudFog,
  IconTestPipe,
  IconTarget,
  IconDiamond,
  IconDeviceGamepad2,
  IconUsers,
  IconShieldExclamation,
  IconPalette,
} from '@tabler/icons-react'
import { isPathActive } from '@/lib/isPathActive'

export type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string }>; exact?: boolean }
export type NavGroup = { id: string; label: string; items: NavItem[] }

export const DASHBOARD_ITEM: NavItem = { href: '/admin', label: '대시보드', icon: IconLayoutDashboard, exact: true }

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'content',
    label: '콘텐츠 관리',
    items: [
      { href: '/admin/badges', label: '배지 관리', icon: IconAward },
      { href: '/admin/item-badges', label: '아이템배지 발급 현황', icon: IconBarcode },
      { href: '/admin/poi', label: 'POI 관리', icon: IconMapPin },
      { href: '/admin/itembooks', label: '컬렉션', icon: IconBook },
      { href: '/admin/factions', label: '세계관', icon: IconWorld },
      { href: '/admin/recipes', label: '믹스 레시피', icon: IconFlask },
      { href: '/admin/today', label: '투데이 콘텐츠', icon: IconNews },
    ],
  },
  {
    id: 'policy',
    label: '정책 및 밸런스',
    items: [
      { href: '/admin/drop-policy', label: '드랍 정책', icon: IconDice },
      { href: '/admin/ambient-drop', label: '앰비언트 드랍', icon: IconCloudFog },
      { href: '/admin/combine-policy', label: '믹스 정책', icon: IconTestPipe },
      { href: '/admin/missions', label: '미션 관리', icon: IconTarget },
      { href: '/admin/points', label: '포인트 관리', icon: IconDiamond },
    ],
  },
  {
    id: 'ops',
    label: '운영 도구',
    items: [
      { href: '/admin/simulator', label: '시뮬레이터', icon: IconDeviceGamepad2 },
      { href: '/admin/users', label: '유저 조회', icon: IconUsers },
      { href: '/admin/abusing', label: '어뷰징 관리', icon: IconShieldExclamation },
    ],
  },
  {
    id: 'design',
    label: '디자인',
    items: [{ href: '/admin/theme', label: '테마 컬러', icon: IconPalette }],
  },
]

export const ALL_NAV_ITEMS = [DASHBOARD_ITEM, ...NAV_GROUPS.flatMap((g) => g.items)]

export function isNavItemActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href
  return isPathActive(pathname, item.href)
}

export function activeNavGroupId(pathname: string) {
  return NAV_GROUPS.find((group) => group.items.some((item) => isNavItemActive(pathname, item)))?.id
}
