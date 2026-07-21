/**
 * 드랍엔진 v2 순수 함수 레이어 테스트
 * randomFn 주입으로 결정론적 검증. (기존 컨벤션: describe/it/expect — runner 미설치 상태)
 */
import {
  rollRarityV2,
  rollBonusDrop,
  isIntenseActivity,
  isComebackActivity,
  isWeeklyFirstActivity,
  pickFaction,
  pickBook,
  rarityFallbackOrder,
  type RarityContext,
} from '../layers'
import { DEFAULT_DROP_POLICY } from '../policy'

const P = DEFAULT_DROP_POLICY

/** 고정 시퀀스 rand */
const seq = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

const baseCtx: RarityContext = {
  commonStreak: 0,
  isComeback: false,
  isWeeklyFirst: false,
  dailyDropCount: 0,
}

describe('Layer 1 — rollRarityV2', () => {
  it('기본 분포: roll이 common 구간이면 common', () => {
    expect(rollRarityV2(P, baseCtx, seq(0.3))).toBe('common') // 0.3 < 0.6
    expect(rollRarityV2(P, baseCtx, seq(0.7))).toBe('rare') // 0.6~0.88
    expect(rollRarityV2(P, baseCtx, seq(0.9))).toBe('legendary') // 0.88~0.97
    expect(rollRarityV2(P, baseCtx, seq(0.99))).toBe('mythic')
  })

  it('복귀(isComeback)면 common이 절대 나오지 않는다', () => {
    for (const roll of [0.0, 0.3, 0.6, 0.99]) {
      const r = rollRarityV2(P, { ...baseCtx, isComeback: true }, seq(roll))
      expect(r).not.toBe('common')
    }
  })

  it('pity: 연속 common 5회(임계) 도달 시 rare+ 확정', () => {
    const r = rollRarityV2(P, { ...baseCtx, commonStreak: 5 }, seq(0.01))
    expect(r).not.toBe('common')
  })

  it('pity 임계 미만(4회)이면 common 가능', () => {
    expect(rollRarityV2(P, { ...baseCtx, commonStreak: 4 }, seq(0.3))).toBe('common')
  })

  it('일일 하향: 당일 4번째 활동(dailyDropCount=3)부터 common 90%', () => {
    expect(rollRarityV2(P, { ...baseCtx, dailyDropCount: 3 }, seq(0.85))).toBe('common') // 0.85 < 0.9
    expect(rollRarityV2(P, { ...baseCtx, dailyDropCount: 2 }, seq(0.85))).toBe('rare') // 기본 분포
  })

  it('주간 첫 활동: rare+ 확률 2배 (0.4 → 0.8)', () => {
    // common 구간이 1-0.8=0.2로 줄어듦 → roll 0.3이면 rare+
    const r = rollRarityV2(P, { ...baseCtx, isWeeklyFirst: true }, seq(0.3))
    expect(r).not.toBe('common')
  })
})

describe('Layer 1 — 보너스·강도·복귀·주간 판정', () => {
  const act = (movingSec: number, elevM: number) =>
    ({ movingTimeSec: movingSec, elevationGainM: elevM }) as never

  it('60분+ 또는 고도 300m+ 활동은 고강도', () => {
    expect(isIntenseActivity(P, act(3600, 0))).toBe(true)
    expect(isIntenseActivity(P, act(1800, 300))).toBe(true)
    expect(isIntenseActivity(P, act(1800, 100))).toBe(false)
  })

  it('보너스 드랍: 기본 15%, 고강도 30%', () => {
    expect(rollBonusDrop(P, false, seq(0.1))).toBe(true)
    expect(rollBonusDrop(P, false, seq(0.2))).toBe(false)
    expect(rollBonusDrop(P, true, seq(0.2))).toBe(true)
  })

  it('복귀: 직전 활동 7일+ 공백', () => {
    expect(isComebackActivity(P, '2026-07-10T00:00:00Z', '2026-07-17T00:00:00Z')).toBe(true)
    expect(isComebackActivity(P, '2026-07-12T00:00:00Z', '2026-07-17T00:00:00Z')).toBe(false)
    expect(isComebackActivity(P, null, '2026-07-17T00:00:00Z')).toBe(false) // 첫 활동은 복귀 아님
  })

  it('주간 첫 활동: 월요일 시작 주가 바뀌면 true', () => {
    // 2026-07-17(금) → 2026-07-20(월): 주 변경
    expect(isWeeklyFirstActivity('2026-07-17T00:00:00Z', '2026-07-20T00:00:00Z')).toBe(true)
    // 같은 주 (월~일)
    expect(isWeeklyFirstActivity('2026-07-14T00:00:00Z', '2026-07-17T00:00:00Z')).toBe(false)
  })
})

describe('Layer 2 — pickFaction', () => {
  const MYSTERY = 'mystery-id'
  const base = {
    candidateFactionIds: ['a', 'b', 'c', MYSTERY],
    lastDropFactionId: 'a',
    adjacentFactionIds: ['b'],
    mysteryFactionId: MYSTERY,
    rarity: 'common' as const,
    contextFactionIds: [],
  }

  it('모멘텀: roll < 0.5이면 직전 세계관', () => {
    expect(pickFaction(P, base, seq(0.3))).toBe('a')
  })

  it('인접: 0.5 ≤ roll < 0.75이면 인접 세계관', () => {
    expect(pickFaction(P, base, seq(0.6, 0.0))).toBe('b')
  })

  it('탐험: roll ≥ 0.75이면 전체(미스터리 제외)에서 랜덤', () => {
    const picked = pickFaction(P, base, seq(0.8, 0.0))
    expect(['a', 'b', 'c']).toContain(picked)
  })

  it('common 드랍에서 미스터리 헌터는 절대 선택되지 않는다', () => {
    for (const roll of [0.0, 0.5, 0.9]) {
      expect(pickFaction(P, base, seq(roll, 0.99))).not.toBe(MYSTERY)
    }
  })

  it('legendary 드랍은 mystery_spice_rate(15%) 확률로 미스터리 헌터', () => {
    expect(pickFaction(P, { ...base, rarity: 'legendary' }, seq(0.1))).toBe(MYSTERY)
    expect(pickFaction(P, { ...base, rarity: 'legendary' }, seq(0.2, 0.3))).toBe('a') // 스파이스 미발동 → 모멘텀
  })

  it('맥락 오버라이드 후보가 있으면 최우선', () => {
    expect(pickFaction(P, { ...base, contextFactionIds: ['c'] }, seq(0.9, 0.0))).toBe('c')
  })

  it('직전 드랍 없으면(신규) 모멘텀 없이 탐험으로', () => {
    const picked = pickFaction(P, { ...base, lastDropFactionId: null, adjacentFactionIds: [] }, seq(0.5, 0.0))
    expect(['a', 'b', 'c']).toContain(picked)
  })
})

describe('Layer 3 — pickBook', () => {
  it('완성도가 높을수록 가중치 감쇠 (0% > 50% > 89%)', () => {
    const books = [
      { bookId: 'fresh', baseWeight: 1, completion: 0 },
      { bookId: 'half', baseWeight: 1, completion: 0.5 },
    ]
    // fresh=1.0, half=0.65 → 총 1.65. roll 0.7 → fresh 구간(0~1.0)
    expect(pickBook(P, books, null, seq(0.55))).toBe('fresh')
    // roll 0.99 → half 구간
    expect(pickBook(P, books, null, seq(0.99))).toBe('half')
  })

  it('완성(100%) 북은 0.3 배율로 잔류 — 선택 가능', () => {
    const books = [{ bookId: 'done', baseWeight: 1, completion: 1 }]
    expect(pickBook(P, books, null, seq(0.5))).toBe('done')
  })

  it('직전 드랍 북은 same_book_penalty(0.5) 배율', () => {
    const books = [
      { bookId: 'last', baseWeight: 1, completion: 0 },
      { bookId: 'other', baseWeight: 1, completion: 0 },
    ]
    // last=0.5, other=1.0 → 총 1.5. roll 0.4 → last 구간(0~0.5) 하한 근처
    expect(pickBook(P, books, 'last', seq(0.32))).toBe('last')
    expect(pickBook(P, books, 'last', seq(0.5))).toBe('other')
  })

  it('후보 없으면 null', () => {
    expect(pickBook(P, [], null, seq(0.5))).toBeNull()
  })
})

describe('rarityFallbackOrder', () => {
  it('추첨 rarity → 낮은 쪽 → 높은 쪽 순', () => {
    expect(rarityFallbackOrder('rare')).toEqual(['rare', 'common', 'legendary', 'mythic'])
    expect(rarityFallbackOrder('mythic')).toEqual(['mythic', 'legendary', 'rare', 'common'])
    expect(rarityFallbackOrder('common')).toEqual(['common', 'rare', 'legendary', 'mythic'])
  })
})
