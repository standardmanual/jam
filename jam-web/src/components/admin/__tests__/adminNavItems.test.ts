/**
 * 어드민 사이드바 활성 메뉴 판정 회귀 테스트 (20260827_007).
 *
 * `isNavItemActive`가 `isPathActive` 공용 유틸로 리팩터링됐다. `/admin/points`가
 * `/admin/poi`에 오매칭되던 사고(티켓 20260827_003)가 재발하지 않는지 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { IconLayoutDashboard, IconAward, IconMapPin } from '@tabler/icons-react'
import { activeNavGroupId, DASHBOARD_ITEM, isNavItemActive, mostSpecificActiveItem, NAV_GROUPS } from '@/components/admin/adminNavItems'
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
    '현황 vs 미소유 아이템배지) 더 구체적인(긴) href 쪽만 활성으로 고른다', () => {
    expect(mostSpecificActiveItem('/admin/item-badges/orphaned')?.href).toBe('/admin/item-badges/orphaned')
  })

  it('하위 배지 상세 경로는 여전히 부모(아이템배지 발급현황) 항목이 활성', () => {
    expect(mostSpecificActiveItem('/admin/item-badges/abc-123')?.href).toBe('/admin/item-badges')
  })
})

describe('NAV_GROUPS (티켓 20261022_2035: 그룹 단순화 6종 및 메뉴명 간결화)', () => {
  it('그룹 레이블·순서가 목표 구조와 일치한다', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['live', 'users', 'content', 'balance', 'design', 'system'])
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(['라이브', '유저', '콘텐츠', '밸런스', '디자인', '시스템'])
  })

  it('라이브 그룹은 맨 위에 있고 운영플랜·일정표·투데이·트렌드 레이더·패턴 사전을 담는다', () => {
    expect(NAV_GROUPS[0].id).toBe('live')
    expect(NAV_GROUPS[0].items.map((i) => [i.href, i.label])).toEqual([
      ['/admin/ops-inbox', '운영플랜'],
      ['/admin/ops-schedule', '일정표'],
      ['/admin/today', '투데이'],
      ['/admin/ops-trends', '트렌드 레이더'],
      ['/admin/ops-patterns', '패턴 사전'],
    ])
  })

  it('기획 상세 경로에서도 운영플랜이 활성이다', () => {
    expect(mostSpecificActiveItem('/admin/ops-inbox')?.href).toBe('/admin/ops-inbox')
    expect(mostSpecificActiveItem('/admin/ops-inbox')?.label).toBe('운영플랜')
    expect(mostSpecificActiveItem('/admin/ops-inbox/4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee')?.href).toBe('/admin/ops-inbox')
  })

  it('일정표 경로에서는 일정표만 활성이다(운영플랜·운영 설정은 아니다)', () => {
    expect(mostSpecificActiveItem('/admin/ops-schedule')?.href).toBe('/admin/ops-schedule')
    expect(mostSpecificActiveItem('/admin/ops-schedule')?.label).toBe('일정표')
    expect(mostSpecificActiveItem('/admin/ops-patterns')?.label).toBe('패턴 사전')
    expect(mostSpecificActiveItem('/admin/ops-trends')?.label).toBe('트렌드 레이더')
  })

  it('운영 설정 경로에서는 운영 설정만 활성이고 헤더 제목이 「운영 설정」이다', () => {
    expect(mostSpecificActiveItem('/admin/ops-settings')?.href).toBe('/admin/ops-settings')
    expect(mostSpecificActiveItem('/admin/ops-settings')?.label).toBe('운영 설정')
    expect(mostSpecificActiveItem('/admin/ops-settings')?.href).not.toBe('/admin/ops-inbox')
  })

  it('디자인 그룹은 배지 이미지 생성 2종 + 에셋을 포함하고 테마 컬러·쉐이더 랩·에셋 제너레이터 항목은 ' +
    '제거됐다(쉐이더 텍스트 생성은 티켓 20260913_0413, 쉐이더 랩은 티켓 20260925_1416에서 제거, ' +
    '에셋은 티켓 20261022_1318에서 에셋 제너레이터 기능을 통합)', () => {
    const design = NAV_GROUPS.find((g) => g.id === 'design')
    expect(design?.items.map((i) => i.href)).toEqual([
      '/admin/badge-image',
      '/admin/activity-badge-image',
      '/admin/assets',
    ])
    expect(NAV_GROUPS.flatMap((g) => g.items).some((i) => i.href === '/admin/theme')).toBe(false)
    expect(NAV_GROUPS.flatMap((g) => g.items).some((i) => i.href === '/admin/shader-lab')).toBe(false)
    expect(NAV_GROUPS.flatMap((g) => g.items).some((i) => i.href === '/admin/asset-generator')).toBe(false)
  })

  it('챕터는 숫자로만 표기하므로 챕터 이름 메뉴가 없다(티켓 20261021_1539)', () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.href)
    expect(hrefs).not.toContain('/admin/chapter-names')
    expect(mostSpecificActiveItem('/admin/tribes')?.href).toBe('/admin/tribes')
  })

  it('«드랍 정책» 메뉴는 없고 «드랍 제외»는 남는다(티켓 20261022_0938, 20261022_2035 간결화)', () => {
    const items = NAV_GROUPS.flatMap((g) => g.items)
    expect(items.map((i) => i.href)).not.toContain('/admin/drop-policy')
    expect(items.map((i) => i.label)).not.toContain('드랍 정책')
    expect(items.find((i) => i.href === '/admin/drop-policy/exclusions')?.label).toBe('드랍 제외')
    // 드랍 제외 관리 하위 경로에서 자기 자신만 활성이다
    expect(mostSpecificActiveItem('/admin/drop-policy/exclusions')?.href).toBe('/admin/drop-policy/exclusions')
  })

  it('«인벤토리» 메뉴는 없다 — 옛 화면은 «밸런스» 구역으로 옮겼다(티켓 20261022_1134)', () => {
    const items = NAV_GROUPS.flatMap((g) => g.items)
    expect(items.map((i) => i.href)).not.toContain('/admin/inventory-policy')
    expect(items.map((i) => i.label)).not.toContain('인벤토리')
    // 옛 주소는 어느 메뉴도 활성으로 만들지 않는다
    expect(mostSpecificActiveItem('/admin/inventory-policy')).toBeUndefined()
    // 같은 값은 «밸런스» 메뉴(/admin/balance)의 인벤토리 구역에서 바꾼다
    expect(items.find((i) => i.href === '/admin/balance')?.label).toBe('밸런스')
  })

  it('«생태계 상황판»은 «밸런스» 그룹 맨 위에 있고 그 경로에서 자기 자신만 활성이다(티켓 20261026_2027 3-1)', () => {
    const balance = NAV_GROUPS.find((g) => g.id === 'balance')
    expect(balance?.items[0]).toMatchObject({ href: '/admin/ecosystem', label: '생태계 상황판' })
    expect(NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.href === '/admin/ecosystem')).toHaveLength(1)
    expect(mostSpecificActiveItem('/admin/ecosystem')?.label).toBe('생태계 상황판')
    expect(activeNavGroupId('/admin/ecosystem')).toBe('balance')
  })

  it('«정책 대시보드»는 «밸런스» 그룹에서 생태계 상황판 다음에 있고 그 경로에서 자기 자신만 활성이다(티켓 20261022_1631, 20261022_2035 간결화)', () => {
    const balance = NAV_GROUPS.find((g) => g.id === 'balance')
    expect(balance?.items[1]).toMatchObject({ href: '/admin/policy-dashboard', label: '정책 대시보드' })
    expect(balance?.items[2]).toMatchObject({ href: '/admin/balance', label: '밸런스' })
    expect(mostSpecificActiveItem('/admin/policy-dashboard')?.label).toBe('정책 대시보드')
    expect(mostSpecificActiveItem('/admin/balance')?.label).toBe('밸런스')
    expect(NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.href === '/admin/policy-dashboard')).toHaveLength(1)
  })

  it('«밸런스 지표»는 «밸런스» 바로 아래 같은 그룹에 한 번 있고, 그 경로에서는 자기 자신만 활성이다(티켓 20261022_1136 1회 b)', () => {
    const balance = NAV_GROUPS.find((g) => g.id === 'balance')
    expect(balance?.items[3]).toMatchObject({ href: '/admin/balance/dashboard', label: '밸런스 지표' })
    expect(NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.href === '/admin/balance/dashboard')).toHaveLength(1)
    // 하위 경로라 «밸런스»도 접두어로 맞지만 더 구체적인 «밸런스 지표»만 고른다
    expect(mostSpecificActiveItem('/admin/balance/dashboard')?.label).toBe('밸런스 지표')
    expect(mostSpecificActiveItem('/admin/balance')?.label).toBe('밸런스')
    expect(activeNavGroupId('/admin/balance/dashboard')).toBe('balance')
  })

  it('«개발·배포 상황판»은 «시스템» 그룹 맨 위에 한 번 있고 그 경로에서 자기 자신만 활성이다(티켓 20261026_2028 3회차)', () => {
    const system = NAV_GROUPS.find((g) => g.id === 'system')
    expect(system?.items[0]).toMatchObject({ href: '/admin/dev-board', label: '개발·배포 상황판' })
    expect(system?.items[1]).toMatchObject({ href: '/admin/ops-settings', label: '운영 설정' })
    expect(NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.href === '/admin/dev-board')).toHaveLength(1)
    expect(mostSpecificActiveItem('/admin/dev-board')?.label).toBe('개발·배포 상황판')
    expect(activeNavGroupId('/admin/dev-board')).toBe('system')
  })

  it('미션과 게이트 미션은 콘텐츠 그룹에, 랭킹은 밸런스 그룹에, 어뷰징과 유저는 유저 그룹에 있다', () => {
    const content = NAV_GROUPS.find((g) => g.id === 'content')
    expect(content?.items.map((i) => i.href)).toContain('/admin/missions')
    expect(content?.items.map((i) => i.href)).toContain('/admin/gate-missions')

    const balance = NAV_GROUPS.find((g) => g.id === 'balance')
    expect(balance?.items.map((i) => i.href)).toContain('/admin/ranking-modes')

    const users = NAV_GROUPS.find((g) => g.id === 'users')
    expect(users?.items.map((i) => i.href)).toContain('/admin/abusing')
    expect(users?.items.map((i) => i.href)).toContain('/admin/users')
  })
})

describe('DASHBOARD_ITEM (티켓 20261006_1341 ②-c, 승인 #12: 「대시보드」 → 「운영 홈」)', () => {
  it('사이드바와 상단 바가 함께 쓰는 라벨이 「운영 홈」이고 경로는 /admin 그대로다', () => {
    expect(DASHBOARD_ITEM.label).toBe('운영 홈')
    expect(DASHBOARD_ITEM.href).toBe('/admin')
    expect(DASHBOARD_ITEM.exact).toBe(true)
  })
})
