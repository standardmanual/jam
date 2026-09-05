/**
 * badgeProgressText.ts 회귀 테스트 — 티켓 20260904_0921(2c) 개선 리뷰 지적 반영.
 *
 * 핵심 리스크: `met`은 원값 기준으로 판정되는데 표시 숫자를 반올림하면 "이미 다 채운 것처럼"
 * 보이는 축이 생긴다(예: duration_minutes 44.6/45 → met:false인데 "45/45분"으로 보임).
 * 이 파일은 그 반올림 방향(내림/올림)이 met와 항상 같은 방향을 가리키는지 고정한다.
 */
import { describe, it, expect } from 'vitest'
import {
  formatFrontierProgressText,
  formatGridProgressLine,
  formatRegretLineText,
  formatDualAxisGaugeProps,
  pickSyncComparisonCandidate,
  formatSyncComparisonText,
  type FamilyProgressAxisSnapshot,
  type SyncComparisonCandidate,
} from '@/lib/badgeProgressText'
import type { BadgeProgress, BadgeProgressAxis, RegretLineData } from '@/lib/badge-engine/badgeProgress'

function axis(overrides: Partial<BadgeProgressAxis>): BadgeProgressAxis {
  return { key: 'distance_km', label: '누적 거리', unit: 'km', current: 0, target: 100, met: false, fraction: 0, remaining: null, ...overrides }
}

function cumulative(a: BadgeProgressAxis, progress = 0.5): BadgeProgress {
  return { kind: 'cumulative', axes: [a], progress, bottleneck: a.key, sameActivity: false, periodEndsAt: null, gate: null, level: null, crossGated: false }
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
      periodEndsAt: '2026-09-07T00:00:00.000Z', gate: null, level: null, crossGated: false,
    }
    const result = formatFrontierProgressText(progress, new Date('2026-09-04T00:00:00.000Z'))
    expect(result?.text).toBe('이번 주 4/5회 · 3일 남음')
  })

  it('2축형·다중카운터형은 null을 반환한다(2d 몫)', () => {
    const dual: BadgeProgress = {
      kind: 'dual', axes: [axis({}), axis({ key: 'elevation_gain_m' })], progress: 0.5,
      bottleneck: 'distance_km', sameActivity: true, periodEndsAt: null, gate: null, level: null, crossGated: false,
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
      sameActivity: false, periodEndsAt: null, gate: null, level: null, crossGated: false,
    }
    expect(formatGridProgressLine(progress).text).toBe('3.0/10.0km')
  })
})

describe('formatDualAxisGaugeProps', () => {
  it('sameActivity:false는 "각각 다른 활동" 규칙 문장을 쓴다', () => {
    const dual: BadgeProgress = {
      kind: 'dual',
      axes: [axis({ key: 'min_speed_kmh', label: '속도', unit: 'km/h', current: 15, target: 15, met: true, fraction: 1 }),
        axis({ key: 'elevation_gain_m', label: '고도', unit: 'm', current: 1180, target: 1500, met: false, fraction: 1180 / 1500 })],
      progress: 1180 / 1500, bottleneck: 'elevation_gain_m', sameActivity: false, periodEndsAt: null, gate: null, level: null, crossGated: false,
    }
    const result = formatDualAxisGaugeProps(dual)
    expect(result?.ruleText).toBe('두 조건은 각각 다른 활동에서 채워도 돼요.')
  })

  it('met인 축이 정확히 하나면 그 축을 지목하는 병목 안내를 만든다', () => {
    const dual: BadgeProgress = {
      kind: 'dual',
      axes: [axis({ key: 'min_speed_kmh', label: '속도', current: 21.4, target: 20, met: true, fraction: 1 }),
        axis({ key: 'elevation_gain_m', label: '고도', current: 1180, target: 1500, met: false, fraction: 1180 / 1500 })],
      progress: 1180 / 1500, bottleneck: 'elevation_gain_m', sameActivity: false, periodEndsAt: null, gate: null, level: null, crossGated: false,
    }
    const result = formatDualAxisGaugeProps(dual)
    expect(result?.bottleneckNote).toBe('속도 조건은 이미 채웠어요.')
  })

  it('met인 축이 0개면 병목 안내가 없다', () => {
    const dual: BadgeProgress = {
      kind: 'dual',
      axes: [axis({ key: 'a', label: 'A', met: false, fraction: 0.3 }), axis({ key: 'b', label: 'B', met: false, fraction: 0.5 })],
      progress: 0.3, bottleneck: 'a', sameActivity: false, periodEndsAt: null, gate: null, level: null, crossGated: false,
    }
    expect(formatDualAxisGaugeProps(dual)?.bottleneckNote).toBeNull()
  })

  it('met인 축이 2개(둘 다 충족, 게이트만 대기)면 병목 안내가 없다', () => {
    const dual: BadgeProgress = {
      kind: 'dual',
      axes: [axis({ key: 'a', label: 'A', met: true, fraction: 1 }), axis({ key: 'b', label: 'B', met: true, fraction: 1 })],
      progress: 1, bottleneck: 'a', sameActivity: false, periodEndsAt: null, gate: null, level: null, crossGated: false,
    }
    expect(formatDualAxisGaugeProps(dual)?.bottleneckNote).toBeNull()
  })

  it('sameActivity:true는 "한 번의 활동" 규칙 문장을 쓴다', () => {
    const dual: BadgeProgress = {
      kind: 'dual',
      axes: [axis({ key: 'distance_km', label: '거리', unit: 'km', current: 12.4, target: 15, met: false, fraction: 12.4 / 15 }),
        axis({ key: 'elevation_gain_m', label: '고도', unit: 'm', current: 260, target: 300, met: false, fraction: 260 / 300 })],
      progress: 12.4 / 15, bottleneck: 'distance_km', sameActivity: true, periodEndsAt: null, gate: null, level: null, crossGated: false,
    }
    const result = formatDualAxisGaugeProps(dual)
    expect(result?.ruleText).toBe('한 번의 활동에서 두 조건을 동시에 채워야 해요.')
    expect(result?.axes[0].rangeText).toBe('12.4/15.0km')
  })

  it('dual이 아니면 null(방어적)', () => {
    const cumulativeProgress: BadgeProgress = {
      kind: 'cumulative', axes: [axis({})], progress: 0.5, bottleneck: 'distance_km',
      sameActivity: false, periodEndsAt: null, gate: null, level: null, crossGated: false,
    }
    expect(formatDualAxisGaugeProps(cumulativeProgress)).toBeNull()
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

describe('pickSyncComparisonCandidate (티켓 20260904_1425)', () => {
  it('rows가 비어 있으면 null', () => {
    expect(pickSyncComparisonCandidate([])).toBeNull()
  })

  it('prev가 없는(최초 싱크 전) 계열은 후보에서 제외한다', () => {
    const rows: FamilyProgressAxisSnapshot[] = [
      { current: [axis({ key: 'distance_km', current: 5, fraction: 0.5 })], prev: null },
    ]
    expect(pickSyncComparisonCandidate(rows)).toBeNull()
  })

  it('fraction이 그대로거나 줄어든(주기 리셋 등) 축은 후보에서 제외한다', () => {
    const rows: FamilyProgressAxisSnapshot[] = [
      {
        current: [axis({ key: 'distance_km', current: 5, fraction: 0.5 })],
        prev: [axis({ key: 'distance_km', current: 5, fraction: 0.5 })], // 변화 없음
      },
      {
        current: [axis({ key: 'weekly_count', current: 1, fraction: 0.2 })],
        prev: [axis({ key: 'weekly_count', current: 3, fraction: 0.6 })], // 감소(주간 리셋)
      },
    ]
    expect(pickSyncComparisonCandidate(rows)).toBeNull()
  })

  it('여러 계열·축 중 fraction 증가폭이 가장 큰 축 하나만 고른다', () => {
    const rows: FamilyProgressAxisSnapshot[] = [
      {
        current: [axis({ key: 'distance_km', current: 6, fraction: 0.6 })],
        prev: [axis({ key: 'distance_km', current: 5, fraction: 0.5 })], // +0.1
      },
      {
        current: [axis({ key: 'total_count', current: 5, fraction: 0.8 })],
        prev: [axis({ key: 'total_count', current: 2, fraction: 0.3 })], // +0.5(최댓값)
      },
    ]
    expect(pickSyncComparisonCandidate(rows)).toEqual({ axisKey: 'total_count', prevValue: 2, currentValue: 5 })
  })

  it('current 축에 대응하는 prev 축이 없으면(정합성 예외 상황) 방어적으로 스킵한다', () => {
    const rows: FamilyProgressAxisSnapshot[] = [
      {
        current: [axis({ key: 'elevation_gain_m', current: 100, fraction: 0.5 })],
        prev: [axis({ key: 'distance_km', current: 5, fraction: 0.3 })], // key 불일치
      },
    ]
    expect(pickSyncComparisonCandidate(rows)).toBeNull()
  })
})

describe('formatSyncComparisonText (티켓 20260904_1425)', () => {
  it('higher-is-better 축은 소수 1자리에서 내림한 델타를 보여준다', () => {
    const candidate: SyncComparisonCandidate = { axisKey: 'distance_km', prevValue: 3.24, currentValue: 4.58 }
    const labelMap = new Map([['distance_km', { label: '누적 거리', unit: 'km' }]])
    // delta = 1.3399999999999999(부동소수점) → floor 1자리 = 1.3
    expect(formatSyncComparisonText(candidate, labelMap)).toBe('직전 동기화보다 누적 거리 1.3km 가까워졌어요')
  })

  it('lower-is-better 축(페이스)은 mm:ss가 아니라 정수 초 단위 델타를 쓴다', () => {
    const candidate: SyncComparisonCandidate = { axisKey: 'max_pace_sec_per_km', prevValue: 450, currentValue: 410 }
    const labelMap = new Map([['max_pace_sec_per_km', { label: '페이스', unit: null }]])
    expect(formatSyncComparisonText(candidate, labelMap)).toBe('직전 동기화보다 페이스 40초 가까워졌어요')
  })

  it('정수 축(횟수)은 라벨 단위를 그대로 붙인다', () => {
    const candidate: SyncComparisonCandidate = { axisKey: 'total_count', prevValue: 2, currentValue: 5 }
    const labelMap = new Map([['total_count', { label: '횟수', unit: '회' }]])
    expect(formatSyncComparisonText(candidate, labelMap)).toBe('직전 동기화보다 횟수 3회 가까워졌어요')
  })

  it('내림 결과가 0 이하면(미세 변화) 빈 비교문 대신 null을 반환한다', () => {
    const candidate: SyncComparisonCandidate = { axisKey: 'distance_km', prevValue: 3.21, currentValue: 3.24 }
    const labelMap = new Map([['distance_km', { label: '누적 거리', unit: 'km' }]])
    expect(formatSyncComparisonText(candidate, labelMap)).toBeNull()
  })

  it('labelMap에 없으면 레지스트리 라벨로 폴백한다 — 내부 키가 유저 문장에 새지 않는다', () => {
    // sync.ts가 빈 labelMap으로 저장하고 표시 시점에 다시 조회하는 구조라, badge_metric_labels
    // 시드가 아직 없는 신규 축은 이 경로만 폴백을 못 받아 내부 키가 그대로 나갔다(0031 개선 리뷰).
    const candidate: SyncComparisonCandidate = { axisKey: 'streak_days', prevValue: 1, currentValue: 3 }
    const labelMap = new Map<string, { label: string; unit: string | null }>()
    const text = formatSyncComparisonText(candidate, labelMap)
    expect(text).not.toContain('streak_days')
    expect(text).toBe('직전 동기화보다 연속 일수 2일 가까워졌어요')
  })

  it('레지스트리에도 없는 키만 원문으로 떨어진다 (최후 폴백)', () => {
    const candidate: SyncComparisonCandidate = { axisKey: 'not_a_real_key', prevValue: 1, currentValue: 3 }
    const labelMap = new Map<string, { label: string; unit: string | null }>()
    expect(formatSyncComparisonText(candidate, labelMap)).toBe('직전 동기화보다 not_a_real_key 2 가까워졌어요')
  })

  it('휴식 축은 이 배너의 후보가 되지 않는다 — 「휴식 재촉」 금지', () => {
    // 「복귀 전 휴식일 2일 가까워졌어요」는 서비스가 휴식을 재촉하는 모양이 된다.
    const rows = [{
      prev: [{ key: 'return_gap_days', label: '복귀 전 휴식일', unit: '일', current: 1, target: 5, met: false, fraction: 0.2, remaining: 4 }],
      current: [{ key: 'return_gap_days', label: '복귀 전 휴식일', unit: '일', current: 4, target: 5, met: false, fraction: 0.8, remaining: 1 }],
    }] as never
    expect(pickSyncComparisonCandidate(rows)).toBeNull()
  })
})

// ── 신규 kind 문구 — leveled · repeat · rest (티켓 20260905_0031) ─────────────

/** 단일 축 진행 결과 하나를 만든다 — kind만 바꿔가며 문구를 비교하기 위한 최소 픽스처 */
function single(kind: BadgeProgress['kind'], a: BadgeProgressAxis, extra: Partial<Extract<BadgeProgress, { axes: BadgeProgressAxis[] }>> = {}): BadgeProgress {
  return {
    kind, axes: [a], progress: a.fraction, bottleneck: a.key, sameActivity: false,
    periodEndsAt: null, gate: null, level: null, crossGated: false, ...extra,
  } as BadgeProgress
}

describe('휴식(rest) 문구 — 중립적 상태 표기 (2026-09-05 확정)', () => {
  const restAxis = axis({ key: 'rest_after_streak', label: '연속 활동 후 휴식일', unit: '일', current: 2, target: 5, met: false, fraction: 0.4, remaining: 3 })

  it('상태만 표기한다 — 「휴식 2/5일」', () => {
    expect(formatFrontierProgressText(single('rest', restAxis), new Date())?.text).toBe('휴식 2/5일')
    expect(formatGridProgressLine(single('rest', restAxis)).text).toBe('휴식 2/5일')
  })

  it('권유형 표현을 쓰지 않는다 — 운동을 권하는 서비스가 휴식을 재촉하는 모양이 되면 안 된다', () => {
    const texts = [
      formatFrontierProgressText(single('rest', restAxis), new Date())?.text ?? '',
      formatGridProgressLine(single('rest', restAxis)).text,
      // 이미 다 쉰 경우에도 권유가 새어나오면 안 된다
      formatGridProgressLine(single('rest', axis({ key: 'return_gap_days', unit: '일', current: 90, target: 90, met: true, fraction: 1, remaining: 0 }))).text,
    ]
    for (const text of texts) {
      for (const banned of ['더 쉬', '쉬면', '쉬어', '남았어요', '남음', '채우', '채웠', '해보', '어때']) {
        expect(text, `${text} — 금지 표현 "${banned}"`).not.toContain(banned)
      }
    }
  })
})

describe('반복(repeat) 문구', () => {
  it('「3/5회」 — 접두어 없이 카운터만 적는다', () => {
    const a = axis({ key: 'repeat_count', label: '충족 횟수', unit: '회', current: 3, target: 5, met: false, fraction: 0.6, remaining: 2 })
    expect(formatFrontierProgressText(single('repeat', a), new Date())?.text).toBe('3/5회')
    expect(formatGridProgressLine(single('repeat', a)).text).toBe('3/5회')
  })
})

describe('무한레벨(leveled) 문구', () => {
  const a = axis({ key: 'distance_km', unit: 'km', current: 200, target: 500, met: false, fraction: 0.4, remaining: 300 })

  it('레벨을 앞에 붙인다 — 「Lv.7 · 200.0/500.0km」', () => {
    expect(formatFrontierProgressText(single('leveled', a, { level: 7 }), new Date())?.text).toBe('Lv.7 · 200.0/500.0km')
  })

  it('레벨을 모르면 축만 적는다 — 「Lv.null」 같은 문자열이 새어나가지 않는다', () => {
    const text = formatFrontierProgressText(single('leveled', a), new Date())?.text ?? ''
    expect(text).toBe('200.0/500.0km')
    expect(text).not.toContain('null')
  })
})
