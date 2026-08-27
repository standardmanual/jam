/**
 * 경로 접두어 매칭 공용 유틸 회귀 테스트 (20260827_007).
 *
 * `pathname.startsWith(href)` 단순 접두어 매칭은 `/admin/points`가 `/admin/poi`에
 * 오매칭되는 등 문자열 접두어 사고를 일으킨다(티켓 20260827_003, 20260827_006).
 * 이 함수가 세 호출부(adminNavItems, TabBar, imageSrc)에 공용으로 쓰이므로
 * 정확 일치·하위 경로·오매칭 방지 케이스를 여기서 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { isPathActive } from '@/lib/isPathActive'

describe('isPathActive', () => {
  it('정확히 같은 경로는 true', () => {
    expect(isPathActive('/admin/points', '/admin/points')).toBe(true)
  })

  it('href 하위 경로는 true', () => {
    expect(isPathActive('/inventory/abc123', '/inventory')).toBe(true)
  })

  it('href로 시작하지만 하위 경로가 아닌 문자열 접두어는 false (오매칭 방지)', () => {
    expect(isPathActive('/admin/points', '/admin/poi')).toBe(false)
    expect(isPathActive('/badge', '/badges')).toBe(false)
  })

  it('완전히 다른 경로는 false', () => {
    expect(isPathActive('/inventory', '/badges')).toBe(false)
  })
})
