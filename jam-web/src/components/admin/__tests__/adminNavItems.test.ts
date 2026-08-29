/**
 * 어드민 사이드바 활성 메뉴 판정 회귀 테스트 (20260827_007).
 *
 * `isNavItemActive`가 `isPathActive` 공용 유틸로 리팩터링됐다. `/admin/points`가
 * `/admin/poi`에 오매칭되던 사고(티켓 20260827_003)가 재발하지 않는지 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { IconLayoutDashboard, IconAward, IconMapPin } from '@tabler/icons-react'
import { isNavItemActive, mostSpecificActiveItem } from '@/components/admin/adminNavItems'
import type { NavItem } from '@/components/admin/adminNavItems'

describe('isNavItemActive', () => {
  it('exact 항목은 정확히 같은 경로에서만 활성', () => {
    const item: NavItem = { href: '/admin', label: '대시보드', icon: IconLayoutDashboard, exact: true }
    expect(isNavItemActive('/admin', item)).toBe(true)
    expect(isNavItemActive('/admin/badges', item)).toBe(false)
  })

  it('일반 항목은 정확히 같거나 하위 경로면 활성', () => {
    const item: NavItem = { href: '/admin/badges', label: '배지 관리', icon: IconAward }
    expect(isNavItemActive('/admin/badges', item)).toBe(true)
    expect(isNavItemActive('/admin/badges/1', item)).toBe(true)
  })

  it('/admin/poi가 /admin/points에 오매칭되지 않는다 (티켓 20260827_003 회귀)', () => {
    const poi: NavItem = { href: '/admin/poi', label: 'POI 관리', icon: IconMapPin }
    expect(isNavItemActive('/admin/points', poi)).toBe(false)
    expect(isNavItemActive('/admin/points/1', poi)).toBe(false)
  })

  it('무관한 경로는 비활성', () => {
    const item: NavItem = { href: '/admin/badges', label: '배지 관리', icon: IconAward }
    expect(isNavItemActive('/admin/poi', item)).toBe(false)
  })
})

describe('mostSpecificActiveItem', () => {
  it('한 nav 항목의 href가 다른 항목 href의 하위 경로면(티켓 20260830_0104: 아이템배지 발급 ' +
    '현황 vs 소유자 없음 아이템배지) 더 구체적인(긴) href 쪽만 활성으로 고른다', () => {
    expect(mostSpecificActiveItem('/admin/item-badges/orphaned')?.href).toBe('/admin/item-badges/orphaned')
  })

  it('하위 배지 상세 경로는 여전히 부모(아이템배지 발급 현황) 항목이 활성', () => {
    expect(mostSpecificActiveItem('/admin/item-badges/abc-123')?.href).toBe('/admin/item-badges')
  })
})
