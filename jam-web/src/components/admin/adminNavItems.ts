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
  IconUserOff,
  IconPhoto,
  IconPhotoEdit,
  IconTag,
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
      { href: '/admin/badge-metric-labels', label: '배지 지표 라벨', icon: IconTag },
      { href: '/admin/item-badges', label: '아이템배지 현황', icon: IconBarcode },
      { href: '/admin/item-badges/orphaned', label: '미소유 아이템배지 현황', icon: IconUserOff },
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
      { href: '/admin/badge-image', label: '체크인 배지 이미지 생성', icon: IconPhoto },
      { href: '/admin/activity-badge-image', label: '액티비티 배지 이미지 생성', icon: IconPhotoEdit },
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

/**
 * `pathname`과 매칭되는 nav 항목 중 href가 가장 긴(=가장 구체적인) 것 하나만 고른다.
 *
 * `/admin/item-badges/orphaned`(신규, 티켓 20260830_0104)처럼 한 nav 항목의 href가 다른
 * nav 항목 href의 하위 경로인 경우, `isNavItemActive`를 항목마다 독립적으로 호출하면
 * 두 항목이 동시에 "활성"으로 판정된다(둘 다 prefix 매칭 조건을 만족하므로) — 사이드바에서
 * 메뉴 두 개가 동시에 하이라이트되거나(AdminSidebar), 헤더 타이틀이 배열 순서상 먼저 나온
 * 항목(부모)으로 고정되는(AdminHeader의 `.find()`) 오판을 일으킨다. href 문자열 길이가 긴
 * 쪽이 항상 더 구체적인 경로이므로, 매칭된 후보 중 그 하나만 "진짜 활성"으로 취급한다.
 */
export function mostSpecificActiveItem(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.filter((item) => isNavItemActive(pathname, item)).sort(
    (a, b) => b.href.length - a.href.length
  )[0]
}

export function activeNavGroupId(pathname: string) {
  return NAV_GROUPS.find((group) => group.items.some((item) => isNavItemActive(pathname, item)))?.id
}
