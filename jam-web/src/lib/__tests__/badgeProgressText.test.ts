/**
 * badgeProgressText.ts 회귀 테스트 — 티켓 20260904_0921(2c) 개선 리뷰 지적 반영.
 *
 * 핵심 리스크: `met`은 원값 기준으로 판정되는데 표시 숫자를 반올림하면 "이미 다 채운 것처럼"
 * 보이는 축이 생긴다(예: duration_minutes 44.6/45 → met:false인데 "45/45분"으로 보임).
 * 이 파일은 그 반올림 방향(내림/올림)이 met와 항상 같은 방향을 가리키는지 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { formatFrontierProgressText, formatGridProgressLine, formatRegretLineText } from '@/lib/badgeProgressText'
import type { BadgeProgress, BadgeProgressAxis, RegretLineData } from '@/lib/badge-engine/badgeProgress'

function axis(overrides: Partial<BadgeProgressAxis>): BadgeProgressAxis {
  return { key: 'distance_km', label: '누적 거리', unit: 'km', current: 0, target: 100, met: false, ...overrides }
}

function cumulative(a: BadgeProgressAxis, progress = 0.5): BadgeProgress {
  return { kind: 'cumulative', axes: [a], progress, bottleneck: a.key, sameActivity: false, periodEndsAt: null, gate: null }
}

describe('formatFrontierProgressText', () => {
  it('higher-is-better 정수 축은 met:false일 때 반올림으로 "다 채운 것처럼" 보이지 않는다 (내림)', () => {
    // 44.6/45 — 반올림하면 "45/45분"으로 보여 met:false와 모순된다.
    const a = axis({ key: 'duration_minutes', unit: '분', current: 44.6, target: 45, met: false })
    const result = formatFrontierProgressText(cumulative(a), new Date('2026-09-04'))
    expect(result?.text).toBe('44/45분')
  })

  it('lower-is-better 축(최고기온)은 met:false일 때 올림으로 "이미 만족"처럼 보이지 않는다', () => {
    // temperature_max_c: 낮을수록 좋음. current=5.2, target=5 — 아직 못 내려간 상태(met:false).
    // 반올림(5)이나 내림(5)은 우연히 5로 같이 나오지만, 5.1 같은 경계값에서 올림이 정확하다.
    const a = axis({ key: 'temperature_max_c', unit: '°C', current: 5.1, target: 5, met: false })
    const result = formatFrontierProgressText(cumulative(a), new Date('2026-09-04'))
    expect(result?.text).toBe('6/5°C')
  })

  it('ONE_DECIMAL_KEYS 축(거리 등)도 같은 방향으로 소수 1자리에서 자른다', () => {
    // 87.36km는 반올림하면 87.4로 올라가 실제(87.36 < 87.4)보다 앞서 보인다.
    const a = axis({ key: 'distance_km', unit: 'km', current: 87.36, target: 100, met: false })
    const result = formatFrontierProgressText(cumulative(a), new Date('2026-09-04'))
    expect(result?.text).toBe('87.3/100.0km')
  })

  it('주기형은 "이번 주 N/M회 · D일 남음" 형식이다', () => {
    const a = axis({ key: 'weekly_count', unit: '회', current: 4, target: 5, met: false })
    const progress: BadgeProgress = {
      kind: 'periodic', axes: [a], progress: 0.8, bottleneck: 'weekly_count', sameActivity: false,
      periodEndsAt: '2026-09-07T00:00:00.000Z', gate: null,
    }
    const result = formatFrontierProgressText(progress, new Date('2026-09-04T00:00:00.000Z'))
    expect(result?.text).toBe('이번 주 4/5회 · 3일 남음')
  })

  it('2축형·다중카운터형은 null을 반환한다(2d 몫)', () => {
    const dual: BadgeProgress = {
      kind: 'dual', axes: [axis({}), axis({ key: 'elevation_gain_m' })], progress: 0.5,
      bottleneck: 'distance_km', sameActivity: true, periodEndsAt: null, gate: null,
    }
    expect(formatFrontierProgressText(dual, new Date())).toBeNull()
    expect(formatFrontierProgressText({ ...dual, kind: 'multi' }, new Date())).toBeNull()
  })

  it('unsupported는 중립색 "진행 표시 준비 중"이다', () => {
    const result = formatFrontierProgressText({ kind: 'unsupported', conditionKeys: ['mission_reward'] }, new Date())
    expect(result).toEqual({ text: '진행 표시 준비 중', fraction: 0, muted: true })
  })
})

describe('formatGridProgressLine', () => {
  it('bottleneck 축을 우선 사용한다', () => {
    const fast = axis({ key: 'elevation_gain_m', unit: 'm', current: 300, target: 300, met: true })
    const slow = axis({ key: 'distance_km', unit: 'km', current: 3, target: 10, met: false })
    const progress: BadgeProgress = {
      kind: 'dual', axes: [fast, slow], progress: 0.3, bottleneck: 'distance_km',
      sameActivity: false, periodEndsAt: null, gate: null,
    }
    expect(formatGridProgressLine(progress).text).toBe('3.0/10.0km')
  })
})

describe('formatRegretLineText', () => {
  it('남은 양은 항상 올림 — 0.4처럼 작아도 "0" 이 아니라 "1"로 표기한다', () => {
    const regret: RegretLineData = { key: 'duration_minutes', current: 44.6, target: 45, unit: '분', label: '이동시간' }
    const text = formatRegretLineText(regret, 'rare')
    // diff = 45 - 44.6 = 0.4 → ceil(0.4) = 1, current는 내림(44)
    expect(text).toBe('지난 활동 이동시간 기록은 44분. Rare까지 1분 모자랐어요.')
  })

  it('regret.label을 문장에 포함한다', () => {
    const regret: RegretLineData = { key: 'temperature_max_c', current: -8, target: -15, unit: '°C', label: '기온' }
    const text = formatRegretLineText(regret, 'epic')
    expect(text).toContain('기온 기록은')
  })

  it('페이스 축은 mm:ss 포맷 + 초 단위 올림 diff를 쓴다', () => {
    // 7:30/km(450초) → target 7:00/km(420초), diff = 30초
    const regret: RegretLineData = { key: 'max_pace_sec_per_km', current: 450, target: 420, unit: null, label: '페이스' }
    const text = formatRegretLineText(regret, 'common')
    expect(text).toBe('지난 활동 페이스는 7:30/km. Common까지 30초 모자랐어요.')
  })
})
