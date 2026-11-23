/**
 * 단일 카드 칩 배치 계획과 물러서기 — 티켓 20261122_2228 R4, 상위 20261122_2217 §3·§4·§6
 *
 * 확인하는 것: 결정성, 두 칩 반대 방향·각도 3~12°·같은 줄 금지, 스티커 비율(분류 칩의 절반 안팎)과 값 칩 알약·분류 알약 검정,
 * 물러서기 5단계 순서와 각 단계 도달, 칩 하나뿐이면 그 칩만 작게, 드랍·픽업 스티커 한 개 한도, 어드민 지정 자리·기울기 존중,
 * 칩 없는 카드 빈 계획, 목록형 흐름 줄, 후보 목록·서명 안정성, 7개 유형에서 글자·안전 구역을 가리지 않음.
 *
 * 물러서기 시험은 «전체 폭 추가 금지 띠»(`extraAvoid`)로 위쪽 빈 높이를 정확히 좁혀 단계마다 필요한 높이를 만든다.
 * 히어로(그림 없음)의 카드 높이는 폭 288·343·358 모두 360이라 띠의 높이가 같다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedChipPlan.test.ts
 */
import { describe, it, expect } from 'vitest'
import { CHIP_GEOMETRY_TYPES, PLAN_WIDTHS, cardGeometryOf, overlapWithAll, sameRow, type ChipGeometryType } from '../feedChipGeometry'
import {
  MAX_STICKERS_PER_CARD,
  backoffLadder,
  chipPlanCandidates,
  chipRectsOf,
  planCardChips,
  signatureOf,
  type ChipPlan,
  type ChipPlanDraft,
  type ChipPlanInput,
  type PlanWork,
} from '../feedChipPlan'
import { STICKER_COLOR_PAIRS } from '@ds/components/cards/CategorySticker'

const label = (text: string, size: 'lg' | 'sm' = 'lg', fixed?: ChipPlanDraft['fixed']): ChipPlanDraft => ({ kind: 'label', text, size, fixed })
const value = (text: string, size: 'lg' | 'sm' = 'lg', fixed?: ChipPlanDraft['fixed']): ChipPlanDraft => ({ kind: 'value', text, size, fixed })

function inputOf(feedType: ChipPlanInput['feedType'], seed: number | string, chips: ChipPlanDraft[], extra: Partial<ChipPlanInput> = {}): ChipPlanInput {
  return { feedType, seed, chips, titleLines: [8], descriptionLength: 30, descriptionVisible: true, hasImage: true, ...extra }
}

/** 히어로(그림 없음): 위쪽 `top`px 아래부터 카드 80% 높이까지 전체 폭 금지 띠. 카드 높이는 두 폭 모두 360이다. */
function bandInput(seed: number | string, chips: ChipPlanDraft[], top: number): ChipPlanInput {
  return inputOf('hero_box', seed, chips, { hasImage: false, extraAvoid: [{ l: 0, t: top / 360, r: 1, b: 0.8 }] })
}

const signOf = (n: number) => (n < 0 ? -1 : 1)

describe('결정성', () => {
  it('같은 입력(시드 포함)이면 항상 같은 결과다', () => {
    for (const type of CHIP_GEOMETRY_TYPES) {
      const input = inputOf(type, 'seed-a', [value('2일 남음'), label('MISSION', 'sm')])
      expect(chipPlanCandidates(input)).toEqual(chipPlanCandidates({ ...input }))
    }
  })

  it('시드가 다르면 결과가 갈린다', () => {
    const signatures = new Set<string>()
    for (let seed = 0; seed < 60; seed += 1) signatures.add(signatureOf(planCardChips(inputOf('hero_box', seed, [value('Lv.1'), label('ITEM', 'sm')]))))
    expect(signatures.size).toBeGreaterThan(8)
  })

  it('후보 목록의 서명은 같은 입력에서 안정적이고 형식이 일정하다', () => {
    const input = inputOf('hero_box', 77, [value('2일 남음'), label('ACTIVITY', 'sm')])
    const first = chipPlanCandidates(input).map(signatureOf)
    const second = chipPlanCandidates(input).map(signatureOf)
    expect(first).toEqual(second)
    for (const signature of first) expect(signature).toMatch(/^[LV][ps][pw]?:[a-z-]+~?:[+-][abc](\|[LV][ps][pw]?:[a-z-]+~?:[+-][abc])?$/)
  })
})

describe('후보 목록', () => {
  it('맞는 후보가 앞에 오고, 물러서기 단계가 낮은 것부터 나열된다', () => {
    const plans = chipPlanCandidates(inputOf('hero_box', 5, [value('누적 3일 달성'), label('ACTIVITY', 'sm')]))
    expect(plans.length).toBeGreaterThan(1)
    expect(plans.length).toBeLessThanOrEqual(8)
    const fit = plans.filter((plan) => plan.fit)
    expect(plans.slice(0, fit.length)).toEqual(fit)
    for (let i = 1; i < fit.length; i += 1) expect(fit[i].backoff).toBeGreaterThanOrEqual(fit[i - 1].backoff)
  })

  it('후보는 자리·기울기 방향이 서로 다른 배치를 담는다(서명이 여럿)', () => {
    const plans = chipPlanCandidates(inputOf('hero_box', 5, [value('2일 남음'), label('ITEM', 'sm')], { hasImage: false }))
    expect(new Set(plans.map(signatureOf)).size).toBeGreaterThan(2)
  })

  it('planCardChips는 후보의 첫 계획이다', () => {
    const input = inputOf('badge_intro', 9, [value('Lv.1'), label('ITEM', 'sm')])
    expect(planCardChips(input)).toEqual(chipPlanCandidates(input)[0])
  })
})

describe('칩이 없거나 목록형인 카드', () => {
  it('칩이 없으면 빈 계획이다(서명도 비어 있다)', () => {
    for (const type of CHIP_GEOMETRY_TYPES) {
      const plan = planCardChips(inputOf(type, 1, []))
      expect(plan.chips).toEqual([])
      expect(plan.fit).toBe(true)
      expect(signatureOf(plan)).toBe('')
    }
  })

  it('글자가 빈 칩은 칩으로 세지 않는다', () => {
    expect(planCardChips(inputOf('hero_box', 1, [label('  ')])).chips).toEqual([])
  })

  it('목록형은 이 계산 대상이 아니라 흐름 줄 계획이다(결정 6)', () => {
    const plan = planCardChips(inputOf('gallery_list', 1, [value('3개'), label('COLLECTION', 'sm')]))
    expect(plan.flow).toBe(true)
    expect(plan.chips).toEqual([])
    expect(signatureOf(plan)).toBe('')
  })

  it('칩이 둘을 넘으면 앞의 둘만 쓴다', () => {
    expect(planCardChips(inputOf('hero_box', 1, [value('a'), label('ITEM', 'sm'), value('b')])).chips).toHaveLength(2)
  })
})

describe('두 칩의 규칙', () => {
  const seeds = Array.from({ length: 300 }, (_, i) => i)

  it('각도는 3~12°이고 두 칩은 반대 방향이다', () => {
    for (const type of ['hero_box', 'badge_intro', 'text_box', 'drop_pickup', 'collection_intro', 'badge_only'] as const) {
      for (const seed of seeds) {
        const plan = planCardChips(inputOf(type, seed, [value('2일 남음'), label('MISSION', 'sm')], { hasImage: false }))
        expect(plan.chips).toHaveLength(2)
        for (const chip of plan.chips) {
          expect(Math.abs(chip.tilt)).toBeGreaterThanOrEqual(3)
          expect(Math.abs(chip.tilt)).toBeLessThanOrEqual(12)
        }
        expect(signOf(plan.chips[0].tilt)).toBe(-signOf(plan.chips[1].tilt))
      }
    }
  })

  it('두 칩은 같은 줄에 서지 않는다(폭 343)', () => {
    for (const type of CHIP_GEOMETRY_TYPES) {
      if (type === 'gallery_list') continue
      for (const seed of seeds) {
        const input = inputOf(type, seed, [value('2일 남음'), label('MISSION', 'sm')])
        const plan = planCardChips(input)
        if (!plan.fit || plan.chips.length < 2) continue
        for (const width of PLAN_WIDTHS) {
          const [a, b] = chipRectsOf(plan, input, width)
          expect(sameRow(a, b)).toBe(false)
        }
      }
    }
  })

  it('텍스트형의 두 칩은 대각선 모서리다', () => {
    const diagonal: Record<string, string> = { 'top-left': 'bottom-right', 'bottom-right': 'top-left', 'top-right': 'bottom-left', 'bottom-left': 'top-right' }
    for (const seed of seeds) {
      const plan = planCardChips(inputOf('text_box', seed, [value('Lv.1'), label('ITEM', 'sm')]))
      if (plan.chips.length === 2) expect(plan.chips[1].corner).toBe(diagonal[plan.chips[0].corner])
    }
  })

  it('글자가 아래에 있는 카드는 위쪽 두 모서리만 쓰고 둘째 칩은 카드 높이 12~22%로 내려 앉는다', () => {
    for (const type of ['hero_box', 'badge_intro', 'drop_pickup', 'collection_intro'] as const) {
      for (const seed of seeds) {
        const plan = planCardChips(inputOf(type, seed, [value('Lv.1'), label('ITEM', 'sm')], { hasImage: false }))
        if (plan.chips.length < 2) continue
        const [a, b] = plan.chips
        expect(a.corner.startsWith('top')).toBe(true)
        expect(b.corner.startsWith('top')).toBe(true)
        expect(a.corner).not.toBe(b.corner)
        const lowered = plan.chips.filter((chip) => chip.lowered)
        expect(lowered).toHaveLength(1)
        expect(lowered[0].inset.y).toBeGreaterThanOrEqual(12)
        expect(lowered[0].inset.y).toBeLessThanOrEqual(22)
      }
    }
  })

  it('배지만은 아래쪽 두 모서리를 쓴다', () => {
    for (const seed of seeds) {
      const plan = planCardChips(inputOf('badge_only', seed, [value('Lv.1'), label('ITEM', 'sm')]))
      for (const chip of plan.chips) expect(chip.corner.startsWith('bottom')).toBe(true)
    }
  })

  it('모서리 오프셋은 안쪽 가로 6%·세로 5%를 넘지 않고 바깥은 6px 안이다', () => {
    for (const seed of seeds) {
      const plan = planCardChips(inputOf('hero_box', seed, [value('Lv.1'), label('ITEM', 'sm')]))
      for (const chip of plan.chips) {
        expect(chip.inset.x).toBeLessThanOrEqual(6)
        expect(chip.inset.x * 343 / 100).toBeGreaterThanOrEqual(-6)
        if (!chip.lowered) {
          expect(chip.inset.y).toBeLessThanOrEqual(5)
          expect(chip.inset.y * 360 / 100).toBeGreaterThanOrEqual(-6)
        }
      }
    }
  })
})

describe('스티커와 알약', () => {
  it('분류 칩 중 스티커 비율은 절반 안팎이다(시드 4000개)', () => {
    let stickers = 0
    const total = 4000
    for (let seed = 0; seed < total; seed += 1) {
      const plan = planCardChips(inputOf('hero_box', seed, [label('ITEM')], { hasImage: false, widths: [358] }))
      if (plan.chips[0].presentation === 'sticker') stickers += 1
    }
    expect(stickers / total).toBeGreaterThan(0.45)
    expect(stickers / total).toBeLessThan(0.55)
  })

  it('값 칩은 항상 알약이고, 알약 분류 칩은 검정이다', () => {
    for (let seed = 0; seed < 1000; seed += 1) {
      const plan = planCardChips(inputOf('hero_box', seed, [value('Lv.1'), label('ITEM', 'sm')]))
      for (const chip of plan.chips) {
        if (chip.kind === 'value') {
          expect(chip.presentation).toBe('pill')
          expect(chip.black).toBe(false)
          expect(chip.sticker).toBeNull()
        } else if (chip.presentation === 'pill') {
          expect(chip.black).toBe(true)
        } else {
          expect(chip.black).toBe(false)
        }
      }
    }
  })

  it('스티커 인자는 부품이 받는 값이다(모양·보색 짝·J/a/m 글자·시드·분류 문구)', () => {
    const seen = { shapes: new Set<string>(), pairs: new Set<string>(), letters: new Set<string>() }
    for (let seed = 0; seed < 600; seed += 1) {
      const plan = planCardChips(inputOf('hero_box', seed, [label('CHECK IN')], { hasImage: false, widths: [358] }))
      const sticker = plan.chips[0].sticker
      if (!sticker) continue
      expect(['pebble', 'wave']).toContain(sticker.shape)
      expect(Object.keys(STICKER_COLOR_PAIRS)).toContain(sticker.pair)
      expect(['J', 'a', 'm']).toContain(sticker.letter)
      expect(sticker.label).toBe('CHECK IN')
      expect(sticker.seed).toContain(String(seed))
      seen.shapes.add(sticker.shape)
      seen.pairs.add(sticker.pair)
      seen.letters.add(sticker.letter)
    }
    expect(seen.shapes.size).toBe(2)
    expect(seen.pairs.size).toBe(8)
    expect(seen.letters.size).toBe(3)
  })

  it('자리·기울기 방향·모양을 서로 묶지 않는다(모든 조합이 나온다)', () => {
    const combos = new Set<string>()
    for (let seed = 0; seed < 800; seed += 1) {
      const chip = planCardChips(inputOf('text_box', seed, [label('ITEM')], { hasImage: false, widths: [358] })).chips[0]
      if (chip.sticker) combos.add(`${chip.corner}/${chip.tilt < 0 ? '-' : '+'}/${chip.sticker.shape}`)
    }
    expect(combos.size).toBe(4 * 2 * 2)
  })

  it('드랍·픽업은 두 칩이 모두 분류 칩이지만 스티커는 한 카드에 한 개 이하이고 나머지는 검정 알약이다', () => {
    let withSticker = 0
    for (let seed = 0; seed < 1500; seed += 1) {
      // 그림을 빼 자리가 넉넉하게 한다(그림이 있으면 물러서기에서 스티커가 알약으로 바뀌는 일이 잦다)
      const plan = planCardChips(inputOf('drop_pickup', seed, [label('DROP'), label('PICKUP', 'sm')], { hasImage: false }))
      const stickers = plan.chips.filter((chip) => chip.presentation === 'sticker')
      expect(stickers.length).toBeLessThanOrEqual(MAX_STICKERS_PER_CARD)
      for (const chip of plan.chips) if (chip.presentation === 'pill') expect(chip.black).toBe(true)
      withSticker += stickers.length
    }
    expect(withSticker).toBeGreaterThan(300)
    expect(withSticker).toBeLessThan(1500 * 0.8)
  })
})

describe('어드민이 정한 자리·기울기', () => {
  it('정한 자리와 기울기를 존중하고, 다른 칩은 반대 방향 기울기다', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const input = inputOf('hero_box', seed, [value('Lv.1', 'lg', { corner: 'top-right', tilt: -8 }), label('ITEM', 'sm')], { hasImage: false })
      const plans = chipPlanCandidates(input).filter((candidate) => candidate.backoff === 0)
      expect(plans.length).toBeGreaterThan(0)
      for (const plan of plans) {
        const first = plan.chips.find((chip) => chip.index === 0)
        const second = plan.chips.find((chip) => chip.index === 1)
        expect(first?.corner).toBe('top-right')
        expect(first?.tilt).toBe(-8)
        if (second) {
          expect(second.corner).toBe('top-left')
          expect(second.tilt).toBeGreaterThan(0)
        }
      }
    }
  })

  it('둘째 칩이 정했으면 첫 칩이 맞은편에 오고 기울기는 반대다', () => {
    const plan = planCardChips(inputOf('hero_box', 3, [value('Lv.1'), label('ITEM', 'sm', { corner: 'top-left', tilt: 6 })], { hasImage: false }))
    expect(plan.chips[1].corner).toBe('top-left')
    expect(plan.chips[1].tilt).toBe(6)
    expect(plan.chips[0].corner).toBe('top-right')
    expect(plan.chips[0].tilt).toBeLessThan(0)
  })

  it('겹쳐도 자리는 옮기지 않고 나머지 물러서기만 적용한다(기울기 3°)', () => {
    const input = bandInput(1, [value('누적 3일 달성', 'lg', { corner: 'top-left', tilt: 12 })], 70)
    const plan = planCardChips(input)
    expect(plan.chips[0].corner).toBe('top-left')
    expect(plan.backoff).toBe(1)
    expect(Math.abs(plan.chips[0].tilt)).toBe(3)
  })
})

describe('물러서기 사다리', () => {
  const work = (overrides: Partial<PlanWork> & Pick<PlanWork, 'index' | 'kind'>): PlanWork => ({
    text: 'X',
    size: 'lg',
    presentation: 'pill',
    scale: 1,
    black: false,
    mag: 8,
    sign: 1,
    fixedCorner: null,
    sticker: null,
    ...overrides,
  })
  const sticker = { shape: 'pebble', pair: 'yellow-purple', letter: 'J', seed: 's', label: 'ITEM' } as const

  it('스티커가 있는 두 칩은 1~5단계를 이 순서로 밟는다', () => {
    const ladder = backoffLadder([
      work({ index: 0, kind: 'value', size: 'lg' }),
      work({ index: 1, kind: 'label', size: 'sm', presentation: 'sticker', sticker }),
    ])
    expect(ladder.map((step) => step.level)).toEqual([0, 1, 2, 3, 4, 5])
    const byLevel = (level: number) => ladder.find((step) => step.level === level)!.works
    expect(byLevel(1).every((w) => w.mag === 3)).toBe(true)
    expect(byLevel(2)[1].scale).toBe(0.8)
    expect(byLevel(2)[1].presentation).toBe('sticker')
    expect(byLevel(3)[1].presentation).toBe('pill')
    expect(byLevel(3)[1].black).toBe(true)
    expect(byLevel(3)[0].size).toBe('lg')
    expect(byLevel(4).find((w) => w.kind === 'value')?.size).toBe('sm')
    expect(byLevel(5).map((w) => w.kind)).toEqual(['value'])
  })

  it('바꿀 것이 없는 단계는 건너뛴다(스티커 없음 → 2·3단계 없음, 값 칩이 이미 작으면 4단계 없음)', () => {
    const ladder = backoffLadder([work({ index: 0, kind: 'value', size: 'sm', mag: 3 }), work({ index: 1, kind: 'label', size: 'sm', mag: 3 })])
    expect(ladder.map((step) => step.level)).toEqual([0, 5])
  })

  it('분류 칩만 둘(드랍·픽업)이면 5단계에서 둘째 칩을 뺀다', () => {
    const ladder = backoffLadder([work({ index: 0, kind: 'label' }), work({ index: 1, kind: 'label', size: 'sm' })])
    const five = ladder.find((step) => step.level === 5)!
    expect(five.works.map((w) => w.index)).toEqual([0])
  })

  it('칩이 하나뿐이면 1~3단계 뒤에 그 칩만 작게 한다(값 칩 작게·분류 빼기는 없다)', () => {
    const ladder = backoffLadder([work({ index: 0, kind: 'label', presentation: 'sticker', sticker })])
    expect(ladder.map((step) => step.level)).toEqual([0, 1, 2, 3, 6])
    expect(ladder[ladder.length - 1].works[0].size).toBe('sm')
    const small = backoffLadder([work({ index: 0, kind: 'value', size: 'sm', mag: 3 })])
    expect(small.map((step) => step.level)).toEqual([0])
  })

  it('값 칩이 둘이면 분류 칩이 없어 5단계가 없다', () => {
    const ladder = backoffLadder([work({ index: 0, kind: 'value' }), work({ index: 1, kind: 'value' })])
    expect(ladder.some((step) => step.level === 5)).toBe(false)
  })
})

describe('물러서기 도달(히어로, 위쪽 빈 높이를 좁힌 시험)', () => {
  /** 처음 칩 상태에서 스티커가 되는지 알아내려고 같은 시드의 제약 없는 계획을 본다. */
  function findSeed(chips: ChipPlanDraft[], wanted: (plan: ChipPlan) => boolean): number {
    for (let seed = 0; seed < 2000; seed += 1) {
      if (wanted(planCardChips(inputOf('hero_box', seed, chips, { hasImage: false, widths: [358] })))) return seed
    }
    throw new Error('조건에 맞는 시드가 없다')
  }
  const pebble = (plan: ChipPlan) => plan.chips[0].sticker?.shape === 'pebble'

  it('1단계: 기울기를 3°로 줄이면 들어가는 자리', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const plan = planCardChips(bandInput(seed, [value('누적 3일 달성', 'lg', { tilt: 12 })], 70))
      expect(plan.fit).toBe(true)
      expect(plan.backoff).toBe(1)
      expect(Math.abs(plan.chips[0].tilt)).toBe(3)
    }
  })

  it('2단계: 스티커를 80%로 줄이면 들어가는 자리', () => {
    const seed = findSeed([label('ITEM', 'lg', { tilt: 12 })], pebble)
    const plan = planCardChips(bandInput(seed, [label('ITEM', 'lg', { tilt: 12 })], 70))
    expect(plan.fit).toBe(true)
    expect(plan.backoff).toBe(2)
    expect(plan.chips[0].presentation).toBe('sticker')
    expect(plan.chips[0].scale).toBe(0.8)
    expect(Math.abs(plan.chips[0].tilt)).toBe(3)
  })

  it('3단계: 스티커를 검정 알약 분류 칩으로 바꾸면 들어가는 자리', () => {
    const seed = findSeed([label('ITEM', 'lg', { tilt: 12 })], pebble)
    const plan = planCardChips(bandInput(seed, [label('ITEM', 'lg', { tilt: 12 })], 60))
    expect(plan.fit).toBe(true)
    expect(plan.backoff).toBe(3)
    expect(plan.chips[0].presentation).toBe('pill')
    expect(plan.chips[0].black).toBe(true)
    expect(plan.chips[0].sticker).toBeNull()
  })

  it('4단계: 값 칩을 작게(sm) 하면 들어가는 자리', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const plan = planCardChips(bandInput(seed, [value('Lv.1', 'lg'), label('ITEM', 'sm')], 97))
      if (plan.chips.some((chip) => chip.presentation === 'sticker')) continue
      expect(plan.fit).toBe(true)
      expect(plan.backoff).toBe(4)
      expect(plan.chips).toHaveLength(2)
      expect(plan.chips.find((chip) => chip.kind === 'value')?.size).toBe('sm')
    }
  })

  it('5단계: 분류 칩을 빼고 값 칩만 남긴다', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const plan = planCardChips(bandInput(seed, [value('Lv.1', 'lg'), label('ITEM', 'sm')], 80))
      expect(plan.fit).toBe(true)
      expect(plan.backoff).toBe(5)
      expect(plan.chips.map((chip) => chip.kind)).toEqual(['value'])
      expect(plan.chips[0].size).toBe('sm')
    }
  })

  it('칩이 하나뿐이면 1단계 뒤에 그 칩만 작게 한다(6단계)', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const plan = planCardChips(bandInput(seed, [value('Lv.1', 'lg')], 45))
      expect(plan.fit).toBe(true)
      expect(plan.backoff).toBe(6)
      expect(plan.chips).toHaveLength(1)
      expect(plan.chips[0].size).toBe('sm')
    }
  })

  it('끝까지 물러서도 자리가 없으면 겹침이 가장 작은 자리를 주고 맞지 않음을 알린다', () => {
    const plan = planCardChips(bandInput(1, [value('Lv.1', 'lg'), label('ITEM', 'sm')], 10))
    expect(plan.fit).toBe(false)
    expect(plan.overlap).toBeGreaterThan(0)
    expect(plan.chips.length).toBeGreaterThan(0)
  })

  it('띠가 넉넉하면 물러서지 않는다(0단계)', () => {
    const plan = planCardChips(bandInput(1, [value('Lv.1', 'lg')], 200))
    expect(plan.backoff).toBe(0)
  })
})

describe('가리지 않기(7개 유형, 시드 표본)', () => {
  it('계획 폭은 아이폰 최소 화면 375의 카드 폭 343 하나다', () => {
    expect([...PLAN_WIDTHS]).toEqual([343])
  })

  const chipSets: Array<(seed: number) => ChipPlanDraft[]> = [
    (seed) => [label(['ACTIVITY', 'ITEM', 'MISSION', 'CHECK IN', 'COLLECTION'][seed % 5])],
    (seed) => [value(['2일 남음', 'Lv.1', '누적 3일'][seed % 3]), label(['ACTIVITY', 'ITEM', 'MISSION'][seed % 3], 'sm')],
  ]

  for (const type of CHIP_GEOMETRY_TYPES) {
    if (type === 'gallery_list') continue
    it(`${type}: 칩·스티커가 글자·안전 구역·도장·퍼진 배지와 겹치지 않는다(폭 343)`, () => {
      const burst = [
        { x: -0.75, y: -0.35, size: 76 },
        { x: 0.72, y: -0.4, size: 72 },
        { x: -0.7, y: 0.5, size: 80 },
        { x: 0.74, y: 0.45, size: 68 },
      ]
      for (let seed = 0; seed < 600; seed += 1) {
        const chips = chipSets[seed % 2](seed)
        const input = inputOf(type as ChipGeometryType, seed, chips, {
          titleLines: [4 + (seed % 12)],
          descriptionLength: seed % 4 === 0 ? 0 : 20 + (seed % 50),
          descriptionVisible: seed % 4 !== 0,
          burst: type === 'collection_intro' ? burst : undefined,
          stampCorner: seed % 5 === 0 ? 'top-left' : null,
          imageCount: type === 'drop_pickup' ? 1 + (seed % 3) : undefined,
        })
        const plan = planCardChips(input)
        expect(plan.fit).toBe(true)
        for (const width of [343]) {
          const geometry = cardGeometryOf({ ...input, feedType: type as ChipGeometryType, width })
          for (const rect of chipRectsOf(plan, input, width)) expect(overlapWithAll(rect, geometry.avoid)).toBe(0)
        }
      }
    })
  }

  it('후보 전부가 맞는 계획이면 같은 규칙을 지킨다(후보 목록의 모든 맞는 계획)', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const input = inputOf('text_box', seed, [value('Lv.1'), label('ITEM', 'sm')], { titleLines: [3, 3] })
      for (const plan of chipPlanCandidates(input).filter((candidate) => candidate.fit)) {
        for (const width of PLAN_WIDTHS) {
          const geometry = cardGeometryOf({ ...input, feedType: 'text_box', width })
          for (const rect of chipRectsOf(plan, input, width)) expect(overlapWithAll(rect, geometry.avoid)).toBe(0)
        }
      }
    }
  })
})
