/**
 * 피드 순서 칩 배치 연쇄 — 티켓 20261122_2228 R5, 상위 20261122_2217 §3·§4
 *
 * 확인하는 것: 결정성, 접두 안정성(앞부분이 같으면 뒤가 달라도 앞 결과는 같다), 같은 값(자리·기울기 방향·모양·분류 문구·스티커 글자·색 짝) 연속 3장 금지,
 * 앞 카드와 같은 서명 금지, 같은 꼴 3연속 금지, 스티커 글자·색 짝 규칙, 칩 없는 카드·목록형 건너뛰기, 모두 실패했을 때 위반 최소 후보, 120장 연쇄 표본.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedChipChain.test.ts
 */
import { describe, it, expect } from 'vitest'
import { STICKER_COLOR_PAIRS } from '@/components/ui/CategorySticker'
import {
  EMPTY_CHAIN_STATE,
  featuresOf,
  pickCandidate,
  planFeedChips,
  planFeedChipsDetailed,
  stepChain,
  violationsOf,
  type ChainCardInput,
  type ChainFeatures,
  type ChainState,
} from '../feedChipChain'
import { chipPlanCandidates, signatureOf, type ChipPlan, type ChipPlanDraft } from '../feedChipPlan'
import { CHIP_GEOMETRY_TYPES } from '../feedChipGeometry'
import type { FeedColorKey } from '../feedConstants'

const label = (text: string, size: 'lg' | 'sm' = 'lg'): ChipPlanDraft => ({ kind: 'label', text, size })
const value = (text: string, size: 'lg' | 'sm' = 'lg'): ChipPlanDraft => ({ kind: 'value', text, size })

const TYPES = CHIP_GEOMETRY_TYPES.filter((type) => type !== 'gallery_list')
const LABELS = ['ACTIVITY', 'ITEM', 'MISSION', 'CHECK IN', 'COLLECTION']
const VALUES = ['2일 남음', 'Lv.1', '누적 3일']
const COLORS: FeedColorKey[] = ['yellow', 'green', 'pink', 'sky', 'red', 'purple', 'blue', 'white']

/** 결정적 난수(시험 표본용). */
function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

/**
 * 시험 표본 카드. 분류 문구는 입력이 정하는 값이라 후보를 바꿔도 못 고친다 — 표본은 앞 카드와 같은 문구를 두 번 연달아 쓰지 않게 만들어
 * «연쇄가 풀 수 있는 위반»만 남긴다(`previousLabel`).
 */
let previousLabel = ''
function cardOf(index: number, rng: () => number): ChainCardInput {
  const type = TYPES[Math.floor(rng() * TYPES.length)]
  const kind = Math.floor(rng() * 3)
  const labelChoices = LABELS.filter((text) => text !== previousLabel)
  const labelText = labelChoices[Math.floor(rng() * labelChoices.length)]
  previousLabel = labelText
  const valueText = VALUES[Math.floor(rng() * VALUES.length)]
  const chips = kind === 0 ? [label(labelText)] : kind === 1 ? [value(valueText), label(labelText, 'sm')] : [label(labelText), value(valueText, 'sm')]
  return {
    plan: { feedType: type, seed: 1000 + index * 7919, chips, titleLines: [8], descriptionLength: 30, descriptionVisible: true, hasImage: true },
    bg: COLORS[Math.floor(rng() * COLORS.length)],
    box: COLORS[Math.floor(rng() * COLORS.length)],
  }
}

function feedOf(count: number, seed = 1): ChainCardInput[] {
  previousLabel = ''
  const rng = lcg(seed)
  return Array.from({ length: count }, (_, index) => cardOf(index, rng))
}

const stickerChip = (plan: ChipPlan) => plan.chips.find((chip) => chip.presentation === 'sticker' && chip.sticker) ?? null

/** 칩 있는 카드만 모아 값 배열로 만든다. */
function chipped(plans: readonly ChipPlan[]): Array<{ plan: ChipPlan; features: ChainFeatures }> {
  return plans.flatMap((plan) => {
    const features = featuresOf(plan)
    return features ? [{ plan, features }] : []
  })
}

describe('결정성과 접두 안정성', () => {
  it('같은 입력이면 같은 결과다', () => {
    expect(planFeedChips(feedOf(40))).toEqual(planFeedChips(feedOf(40)))
  })

  it('입력과 같은 길이·같은 순서다', () => {
    const feed = feedOf(25)
    const plans = planFeedChips(feed)
    expect(plans).toHaveLength(25)
    plans.forEach((plan, index) => expect(plan.feedType).toBe(feed[index].plan.feedType))
  })

  it('배열 앞부분이 같으면 뒤가 달라도 앞 결과는 같다', () => {
    const base = feedOf(60, 3)
    const other = [...base.slice(0, 30), ...feedOf(30, 99)]
    expect(planFeedChips(other).slice(0, 30)).toEqual(planFeedChips(base).slice(0, 30))
  })

  it('입력 상태 객체를 바꾸지 않는다', () => {
    const card = feedOf(1)[0]
    const state: ChainState = { recent: [], signature: 'x', sticker: null }
    stepChain(state, card)
    expect(state).toEqual({ recent: [], signature: 'x', sticker: null })
  })

  it('빈 배열은 빈 배열이다', () => {
    expect(planFeedChips([])).toEqual([])
  })
})

describe('이웃 규칙(120장 연쇄)', () => {
  const feed = feedOf(120, 7)
  const detailed = planFeedChipsDetailed(feed)
  const plans = detailed.map((step) => step.plan)
  const rows = chipped(plans)

  it('칩 있는 카드가 충분히 섞여 있다(표본 점검)', () => {
    expect(rows.length).toBeGreaterThan(100)
    expect(rows.some((row) => stickerChip(row.plan))).toBe(true)
    expect(rows.some((row) => !stickerChip(row.plan))).toBe(true)
  })

  /**
   * 후보로 풀 수 없는 위반: 드랍·픽업처럼 폭 343에서 칩 둘이 함께 못 들어가 «분류 칩 빼기»(물러서기 5단계)까지 간 카드는 맞는 후보가 알약 하나뿐이라
   * 알약이 이어져도 깰 방법이 없다(가리지 않기가 우선). 스티커가 들어갈 자리가 없어 «검정 알약 분류 칩으로 바꾸기»(3단계)에서 멈춘 카드도 같다.
   * 드랍·픽업 최소 높이를 400에서 380으로 낮추며(티켓 20261124_2227) 표본의 110번째 카드가 이 경우가 됐다. 이 경우만 허용하고 나머지 위반은 0이어야 한다.
   */
  const forced = (index: number) => detailed[index].plan.backoff >= 3 && !detailed[index].plan.chips.some((chip) => chip.presentation === 'sticker')
  const detailedIndexOfRow = detailed.flatMap((step, index) => (featuresOf(step.plan) ? [index] : []))

  for (const key of ['pos', 'dir', 'shape'] as const) {
    it(`같은 ${key} 값은 연속 3장 이어지지 않는다(풀 수 없는 경우 제외)`, () => {
      for (let i = 2; i < rows.length; i += 1) {
        const [a, b, c] = [rows[i - 2].features[key], rows[i - 1].features[key], rows[i].features[key]]
        if (a === b && b === c) expect(forced(detailedIndexOfRow[i]), `${i}번째 칩 카드의 ${key} ${c}`).toBe(true)
      }
    })
  }

  it('같은 분류 문구가 세 장 이어지지 않는다(표본이 문구를 번갈아 쓴다)', () => {
    for (let i = 2; i < rows.length; i += 1) {
      const [a, b, c] = [rows[i - 2].features.label, rows[i - 1].features.label, rows[i].features.label]
      if (c !== null) expect(a === b && b === c, `${i}번째`).toBe(false)
    }
  })

  it('같은 꼴(알약만·스티커 포함)은 연속 3장 이어지지 않는다(풀 수 없는 경우 제외)', () => {
    for (let i = 2; i < rows.length; i += 1) {
      const forms = [rows[i - 2].features.form, rows[i - 1].features.form, rows[i].features.form]
      if (forms[0] === forms[1] && forms[1] === forms[2]) expect(forced(detailedIndexOfRow[i]), `${i}번째`).toBe(true)
    }
  })

  it('바로 앞 칩 카드와 서명이 같지 않다', () => {
    for (let i = 1; i < rows.length; i += 1) expect(signatureOf(rows[i].plan)).not.toBe(signatureOf(rows[i - 1].plan))
  })

  it('스티커 글자는 바로 앞 스티커와 다르다', () => {
    const letters = plans.map(stickerChip).flatMap((chip) => (chip?.sticker ? [chip.sticker.letter] : []))
    expect(letters.length).toBeGreaterThan(5)
    for (let i = 1; i < letters.length; i += 1) expect(letters[i]).not.toBe(letters[i - 1])
    for (let i = 2; i < letters.length; i += 1) expect(letters[i] === letters[i - 1] && letters[i - 1] === letters[i - 2]).toBe(false)
  })

  it('스티커 색 짝은 카드 바탕·박스와 다르고 바로 앞 스티커와 다르다', () => {
    let previous: string | null = null
    plans.forEach((plan, index) => {
      const sticker = stickerChip(plan)?.sticker
      if (!sticker) return
      const base = sticker.pair.split('-')[0]
      expect(base, `${index}번째 바탕`).not.toBe(feed[index].bg)
      expect(base, `${index}번째 박스`).not.toBe(feed[index].box)
      expect(sticker.pair).not.toBe(previous)
      expect(Object.keys(STICKER_COLOR_PAIRS)).toContain(sticker.pair)
      previous = sticker.pair
    })
  })

  it('남은 위반은 풀 수 없는 경우뿐이다', () => {
    const left = detailed.flatMap((step, index) => (step.violations.length > 0 && !forced(index) ? [`${index}:${step.violations.join(',')}`] : []))
    expect(left).toEqual([])
  })

  it('시드를 바꿔 만든 여러 연쇄에서도 위반이 거의 없다(허용 최소)', () => {
    let total = 0
    let cards = 0
    for (let seed = 20; seed < 30; seed += 1) {
      const steps = planFeedChipsDetailed(feedOf(120, seed))
      cards += steps.length
      total += steps.filter((step) => step.violations.length > 0).length
    }
    expect(total / cards).toBeLessThan(0.03)
  })
})

describe('건너뛰기', () => {
  it('칩 없는 카드는 상태를 바꾸지 않고 «앞 카드»는 직전의 칩 있는 카드다', () => {
    const [first] = feedOf(1, 5)
    const empty: ChainCardInput = { ...first, plan: { ...first.plan, chips: [] } }
    const withEmpty = planFeedChips([first, empty, empty, first])
    const without = planFeedChips([first, first])
    expect(withEmpty[1].chips).toEqual([])
    expect(withEmpty[2].chips).toEqual([])
    expect(withEmpty[3]).toEqual(without[1])
    // 같은 카드가 이어져도 앞 칩 카드와 서명이 다르다
    expect(signatureOf(withEmpty[3])).not.toBe(signatureOf(withEmpty[0]))
  })

  it('목록형(흐름 줄)도 건너뛴다', () => {
    const [first] = feedOf(1, 5)
    const list: ChainCardInput = { ...first, plan: { ...first.plan, feedType: 'gallery_list' } }
    const steps = planFeedChipsDetailed([first, list, first])
    expect(steps[1].plan.flow).toBe(true)
    expect(steps[1].plan.chips).toEqual([])
    expect(steps[1].violations).toEqual([])
    expect(signatureOf(steps[2].plan)).not.toBe(signatureOf(steps[0].plan))
  })

  it('칩 없는 카드만 있으면 상태는 처음 그대로다', () => {
    const [first] = feedOf(1, 5)
    const empty: ChainCardInput = { ...first, plan: { ...first.plan, chips: [] } }
    expect(stepChain(EMPTY_CHAIN_STATE, empty).state).toBe(EMPTY_CHAIN_STATE)
  })
})

describe('위반 판정과 고르기', () => {
  const base = feedOf(1, 11)[0]
  const candidates = chipPlanCandidates(base.plan)

  it('앞 카드가 없으면 위반이 없고 첫 후보를 쓴다', () => {
    const step = pickCandidate(EMPTY_CHAIN_STATE, candidates)
    expect(step.violations).toEqual([])
    expect(step.plan).toBe(candidates.find((plan) => plan.fit) ?? candidates[0])
  })

  it('앞 카드와 같은 서명이면 서명 위반이고 다른 후보를 고른다', () => {
    const state: ChainState = { recent: [], signature: signatureOf(candidates[0]), sticker: null }
    expect(violationsOf(state, candidates[0])).toContain('signature')
    const step = pickCandidate(state, candidates)
    if (candidates.some((plan) => plan.fit && signatureOf(plan) !== state.signature)) {
      expect(signatureOf(step.plan)).not.toBe(state.signature)
      expect(step.violations).toEqual([])
    }
  })

  it('같은 값이 두 번 이어진 뒤 같은 값 후보는 위반이다', () => {
    const features = featuresOf(candidates[0]) as ChainFeatures
    const state: ChainState = { recent: [features, features], signature: null, sticker: null }
    expect(violationsOf(state, candidates[0])).toEqual(expect.arrayContaining(['pos', 'dir', 'shape', 'form']))
  })

  it('모두 실패하면 위반이 가장 적은 후보를 쓰고 동점이면 앞선 후보다', () => {
    const features = featuresOf(candidates[0]) as ChainFeatures
    const clone = (patch: Partial<ChipPlan['chips'][number]>): ChipPlan => ({
      ...candidates[0],
      chips: candidates[0].chips.map((chip, i) => (i === 0 ? { ...chip, ...patch } : chip)),
    })
    const flipped = clone({ tilt: -candidates[0].chips[0].tilt })
    const state: ChainState = { recent: [features, features], signature: null, sticker: null }
    expect(violationsOf(state, flipped).length).toBeLessThan(violationsOf(state, candidates[0]).length)
    expect(pickCandidate(state, [candidates[0], flipped]).plan).toBe(flipped)
    expect(pickCandidate(state, [candidates[0], clone({})]).plan).toBe(candidates[0])
  })

  it('맞는(fit) 후보가 있으면 맞지 않는 후보는 쓰지 않는다', () => {
    const unfit: ChipPlan = { ...candidates[0], fit: false, overlap: 10 }
    const fit: ChipPlan = { ...candidates[0], fit: true, overlap: 0 }
    const state: ChainState = { recent: [], signature: signatureOf(fit), sticker: null }
    expect(pickCandidate(state, [unfit, fit]).plan).toBe(fit)
  })
})

describe('스티커 글자·색 짝', () => {
  it('카드 바탕·박스와 같은 바탕의 짝을 쓰지 않는다', () => {
    for (let i = 0; i < 80; i += 1) {
      const bg = COLORS[i % COLORS.length]
      const box = COLORS[(i * 3 + 1) % COLORS.length]
      const card: ChainCardInput = {
        plan: { feedType: 'text_box', seed: i * 101, chips: [label('ITEM')], titleLines: [8], descriptionLength: 30, descriptionVisible: true, hasImage: false },
        bg,
        box,
      }
      const sticker = stickerChip(planFeedChips([card])[0])?.sticker
      if (!sticker) continue
      const pairBase = sticker.pair.split('-')[0]
      expect(pairBase).not.toBe(bg)
      expect(pairBase).not.toBe(box)
    }
  })

  it('사이에 스티커 없는 카드가 끼어도 앞 스티커와 글자·짝이 다르다', () => {
    const rng = lcg(17)
    const feed: ChainCardInput[] = []
    for (let i = 0; i < 60; i += 1) {
      const card = cardOf(i, rng)
      feed.push(i % 3 === 1 ? { ...card, plan: { ...card.plan, chips: [] } } : card)
    }
    const stickers = planFeedChips(feed).flatMap((plan) => {
      const sticker = stickerChip(plan)?.sticker
      return sticker ? [sticker] : []
    })
    expect(stickers.length).toBeGreaterThan(3)
    for (let i = 1; i < stickers.length; i += 1) {
      expect(stickers[i].letter).not.toBe(stickers[i - 1].letter)
      expect(stickers[i].pair).not.toBe(stickers[i - 1].pair)
    }
  })
})

describe('어드민이 정한 자리', () => {
  it('지정한 모서리는 연쇄에서도 바뀌지 않는다', () => {
    const [card] = feedOf(1, 2)
    const fixedCard: ChainCardInput = {
      ...card,
      plan: { ...card.plan, feedType: 'text_box', chips: [{ kind: 'value', text: '2일 남음', size: 'lg', fixed: { corner: 'bottom-right', tilt: null } }] },
    }
    for (const plan of planFeedChips([fixedCard, fixedCard, fixedCard, fixedCard])) expect(plan.chips[0].corner).toBe('bottom-right')
  })
})
