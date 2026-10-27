/**
 * 가상 유저 — 노출 태그 조합과 트라이브 제한 (티켓 20261026_2025 1회차).
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/virtualViewer.test.ts
 */
import { describe, it, expect } from 'vitest'
import { isClosedToViewerTribe, virtualExposureTags, type VirtualViewer } from '../virtualViewer'

const BASE: VirtualViewer = { tribeId: null, timeOfDay: 'time_morning', weather: null, specialDays: [], newUser: false }

describe('virtualExposureTags — 태그 조합', () => {
  it('아무 조건이 없어도 all과 시간대 태그가 있다', () => {
    expect(virtualExposureTags(BASE)).toEqual(['all', 'time_morning'])
  })

  it('날씨는 weather_ 접두사로 붙는다', () => {
    expect(virtualExposureTags({ ...BASE, weather: 'rain' })).toEqual(['all', 'time_morning', 'weather_rain'])
  })

  it('특일 태그와 신규 유저 태그가 순서대로 붙는다', () => {
    expect(virtualExposureTags({ ...BASE, timeOfDay: 'time_night', weather: 'clear', specialDays: ['holiday_today', 'anniversary_today'], newUser: true })).toEqual([
      'all',
      'time_night',
      'weather_clear',
      'holiday_today',
      'anniversary_today',
      'new_user',
    ])
  })

  it('유저 개인 상태 태그는 넣지 않는다', () => {
    const tags = virtualExposureTags({ ...BASE, weather: 'mild', specialDays: ['seasonal_today'], newUser: true })
    expect(tags.filter((t) => t.startsWith('has_'))).toEqual([])
  })
})

describe('isClosedToViewerTribe — 트라이브 제한', () => {
  const T1 = '11111111-1111-4111-8111-111111111111'
  const T2 = '22222222-2222-4222-8222-222222222222'

  it('허용 목록이 없거나 비면 공통 미션이라 닫히지 않는다', () => {
    expect(isClosedToViewerTribe(undefined, { ...BASE, tribeId: T1 })).toBe(false)
    expect(isClosedToViewerTribe([], { ...BASE, tribeId: null })).toBe(false)
  })

  it('허용 트라이브에 들어 있으면 열려 있고, 아니면 닫힌다', () => {
    expect(isClosedToViewerTribe([T1], { ...BASE, tribeId: T1 })).toBe(false)
    expect(isClosedToViewerTribe([T1], { ...BASE, tribeId: T2 })).toBe(true)
  })

  it('트라이브가 없는 유저(온보딩 전)에게는 제한 미션이 닫힌다', () => {
    expect(isClosedToViewerTribe([T1], BASE)).toBe(true)
  })
})
