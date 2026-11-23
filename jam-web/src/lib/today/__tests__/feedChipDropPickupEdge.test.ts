/**
 * 드랍·픽업 «제목 옆 가장자리» 칩 자리 — 티켓 20261122_2229 재작업, 시안 `docs/assets/prototypes/drop-pickup-a5/board-a5.jpg`
 *
 * 확인하는 것: 배지 1~5개 × 카드 폭 320·358·430에서 두 칩이 함께 놓이는 비율(폭 358은 5개 모두), 두 칩이 배지 가운데 구역·제목·설명을 가리지 않음,
 * 가장자리 칩의 자리(오른쪽 위 모서리 기준, 가운데가 카드 높이의 62~78%, 바깥으로 6px 이하), 제목이 카드 폭의 60%를 넘으면 이 자리를 빼는 것,
 * 다른 유형의 칩 계획·후보 수가 달라지지 않음(변경 전 코드에서 뽑은 서명과 대조).
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedChipDropPickupEdge.test.ts
 */
import { describe, it, expect } from 'vitest'
import { CHIP_GAP, TITLE_EDGE, cardGeometryOf, overlapArea, overlapWithAll, type ChipGeometryType } from '../feedChipGeometry'
import { chipPlanCandidates, chipRectsOf, planCardChips, signatureOf, type ChipPlanInput } from '../feedChipPlan'
import { FEED_CORNER_OVERHANG } from '../feedConstants'

const COUNTS = [1, 2, 3, 4, 5] as const
const WIDTHS = [320, 358, 430] as const
const SEEDS = 60

function dropInput(seed: number, count: number, width: number, extra: Partial<ChipPlanInput> = {}): ChipPlanInput {
  return {
    feedType: 'drop_pickup',
    seed,
    chips: [
      { kind: 'label', text: 'DROP', size: 'lg' },
      { kind: 'label', text: 'PICKUP', size: 'sm' },
    ],
    // 제목은 2줄 이하(줄마다 6자 이하), 설명은 1~2줄
    titleLines: [5, 6],
    descriptionLength: 40,
    descriptionVisible: true,
    hasImage: true,
    imageCount: count,
    widths: [width],
    ...extra,
  }
}

const twoChips = (input: ChipPlanInput) => {
  const plan = planCardChips(input)
  return plan.fit && plan.chips.length === 2
}

describe('두 칩이 함께 놓이는 비율', () => {
  it('카드 폭 358에서는 배지 1~5개 모두 두 칩이 함께 놓인다', () => {
    for (const count of COUNTS) {
      for (let seed = 0; seed < SEEDS; seed += 1) expect(twoChips(dropInput(seed, count, 358)), `배지 ${count}개 시드 ${seed}`).toBe(true)
    }
  })

  it('카드 폭 320·430에서도 제목이 2줄 이하이면 배지 수와 상관없이 95% 이상 함께 놓인다', () => {
    for (const width of [320, 430]) {
      for (const count of COUNTS) {
        let placed = 0
        for (let seed = 0; seed < SEEDS; seed += 1) if (twoChips(dropInput(seed, count, width))) placed += 1
        expect(placed / SEEDS, `폭 ${width} 배지 ${count}개`).toBeGreaterThanOrEqual(0.95)
      }
    }
  })

  it('설명이 2줄이어도 폭 358에서 5개 모두 두 칩이 놓인다', () => {
    for (const count of COUNTS) {
      for (let seed = 0; seed < SEEDS; seed += 1) expect(twoChips(dropInput(seed, count, 358, { descriptionLength: 90 })), `배지 ${count}개 시드 ${seed}`).toBe(true)
    }
  })
})

describe('칩이 가릴 영역을 가리지 않는다', () => {
  it('두 칩은 배지 가운데 구역·제목·설명과 겹치지 않고 서로 간격을 둔다', () => {
    for (const width of WIDTHS) {
      for (const count of COUNTS) {
        for (let seed = 0; seed < SEEDS; seed += 1) {
          const input = dropInput(seed, count, width, { descriptionLength: seed % 2 === 0 ? 40 : 90 })
          const plan = planCardChips(input)
          if (!plan.fit) continue
          const avoid = cardGeometryOf({ ...input, feedType: 'drop_pickup' as ChipGeometryType, width }).avoid
          const rects = chipRectsOf(plan, input, width)
          for (const rect of rects) expect(overlapWithAll(rect, avoid), `폭 ${width} 배지 ${count}개 시드 ${seed}`).toBe(0)
          if (rects.length === 2) {
            const [a, b] = rects
            expect(overlapArea({ l: a.l - CHIP_GAP, t: a.t - CHIP_GAP, r: a.r + CHIP_GAP, b: a.b + CHIP_GAP }, b)).toBe(0)
          }
        }
      }
    }
  })

  it('제목과 설명을 따로 피한다: 설명이 카드 폭을 채워도 제목 오른쪽은 비어 있다', () => {
    const g = cardGeometryOf({ feedType: 'drop_pickup', width: 358, titleLines: [5, 6], descriptionLength: 90, descriptionVisible: true, hasImage: true, imageCount: 0 })
    expect(g.avoid).toHaveLength(2)
    const [title, description] = g.avoid
    expect(title.r).toBeLessThan(358 * 0.6)
    expect(description.r).toBeGreaterThan(title.r)
    expect(description.t).toBeGreaterThanOrEqual(title.b - 8)
    expect(g.textRects).toHaveLength(1)
  })
})

describe('«제목 옆 가장자리» 칩의 자리', () => {
  it('가장자리 칩은 하나뿐이고 오른쪽 위 모서리 기준이며, 가운데가 카드 높이의 62~78%·바깥은 6px 이하다', () => {
    let seen = 0
    for (const width of WIDTHS) {
      for (const count of COUNTS) {
        for (let seed = 0; seed < SEEDS; seed += 1) {
          const input = dropInput(seed, count, width)
          const geometry = cardGeometryOf({ ...input, feedType: 'drop_pickup' as ChipGeometryType, width })
          for (const plan of chipPlanCandidates(input)) {
            const rects = chipRectsOf(plan, input, width)
            const edges = plan.chips.filter((chip) => chip.edge)
            expect(edges.length).toBeLessThanOrEqual(1)
            plan.chips.forEach((chip, i) => {
              if (!chip.edge) return
              seen += 1
              expect(chip.corner).toBe(TITLE_EDGE.corner)
              expect(chip.lowered).toBe(false)
              const centerRatio = (rects[i].t + rects[i].b) / 2 / geometry.height
              expect(centerRatio).toBeGreaterThanOrEqual(TITLE_EDGE.centerBand.min - 0.01)
              expect(centerRatio).toBeLessThanOrEqual(TITLE_EDGE.centerBand.max + 0.01)
              expect(rects[i].r).toBeLessThanOrEqual(width + FEED_CORNER_OVERHANG + 1e-6)
              expect(signatureOf(plan)).toContain('^')
            })
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(500)
  })

  it('제목 글자(보정한 추정 폭)가 카드 폭의 60%를 넘으면 이 자리를 후보에서 뺀다', () => {
    const wide = dropInput(1, 3, 358, { titleLines: [10, 10] })
    expect(cardGeometryOf({ ...wide, feedType: 'drop_pickup' as ChipGeometryType, width: 358 }).titleEdgeOpen).toBe(false)
    for (const plan of chipPlanCandidates(wide)) expect(plan.chips.some((chip) => chip.edge)).toBe(false)
    const narrow = dropInput(1, 3, 358)
    expect(cardGeometryOf({ ...narrow, feedType: 'drop_pickup' as ChipGeometryType, width: 358 }).titleEdgeOpen).toBe(true)
  })

  it('어드민이 자리를 정한 칩이 있으면 가장자리 자리를 쓰지 않는다(칩 자리 이름·어드민 입력은 그대로다)', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const input = dropInput(seed, 2, 358, {
        chips: [
          { kind: 'label', text: 'DROP', size: 'lg', fixed: { corner: 'top-left', tilt: null } },
          { kind: 'label', text: 'PICKUP', size: 'sm' },
        ],
      })
      for (const plan of chipPlanCandidates(input)) expect(plan.chips.some((chip) => chip.edge)).toBe(false)
    }
  })
})

describe('다른 카드 유형은 달라지지 않는다', () => {
  // 변경 전 코드(`HEAD~`의 feedChipPlan.ts)에서 같은 입력으로 뽑은 서명과 물러서기 단계(`서명#단계`)다.
  const GOLDEN: Record<string, string[]> = {
    hero_box: ['Lp:top-right:+c|Lp:top-left~:-b#0', 'Lp:top-right~:+b|Lp:top-left:-c#0', 'Lsp:top-right~:-c|Lp:top-left:+a#0', 'Lp:top-right:+c|Lsw:top-left~:-c#0', 'Lsp:top-left~:-c|Lp:top-right:+c#0', 'Lp:top-left:+c|Lsw:top-right~:-a#0', 'Lsw:top-left~:-c|Lp:top-right:+b#0', 'Lsp:top-left~:-c|Lp:top-right:+c#0'],
    badge_intro: ['Lp:top-right:+c|Lp:top-left~:-b#0', 'Lp:top-right~:+b|Lp:top-left:-c#0', 'Lsp:top-right~:-c|Lp:top-left:+a#0', 'Lp:top-right:+c|Lsw:top-left~:-c#0', 'Lsp:top-left~:-c|Lp:top-right:+c#0', 'Lp:top-left:+c|Lsw:top-right~:-a#0', 'Lsw:top-left~:-c|Lp:top-right:+b#0', 'Lsp:top-left~:-c|Lp:top-right:+c#0'],
    text_box: ['Lp:bottom-right:+c|Lp:top-left:-b#0', 'Lp:bottom-left:+b|Lp:top-right:-c#0', 'Lsp:top-left:-a|Lp:bottom-right:+c#0', 'Lp:bottom-left:-c|Lsw:top-right:+a#0', 'Lsp:top-left:-c|Lp:bottom-right:+c#0', 'Lp:top-right:+c|Lsw:bottom-left:-a#0', 'Lsw:bottom-right:-a|Lp:top-left:+c#0', 'Lsp:bottom-right:-a|Lp:top-left:+c#0'],
    collection_intro: ['Lp:top-right:+c|Lp:top-left~:-b#0', 'Lp:top-right~:+b|Lp:top-left:-c#0', 'Lsp:top-right~:-c|Lp:top-left:+a#0', 'Lp:top-right:+c|Lsw:top-left~:-c#0', 'Lsp:top-left~:-c|Lp:top-right:+c#0', 'Lp:top-left:+c|Lsw:top-right~:-a#0', 'Lsw:top-left~:-c|Lp:top-right:+b#0', 'Lsp:top-left~:-c|Lp:top-right:+c#0'],
    badge_only: ['Lp:bottom-right:+c|Lp:bottom-left~:-b#0', 'Lp:bottom-right~:+b|Lp:bottom-left:-c#0', 'Lsp:bottom-right~:-c|Lp:bottom-left:+a#0', 'Lp:bottom-right:+c|Lsw:bottom-left~:-c#0', 'Lsp:bottom-left~:-c|Lp:bottom-right:+c#0', 'Lp:bottom-left:+c|Lsw:bottom-right~:-a#0', 'Lsw:bottom-left~:-c|Lp:bottom-right:+b#0', 'Lsp:bottom-left~:-c|Lp:bottom-right:+c#0'],
  }

  it('드랍·픽업을 뺀 유형의 칩 계획 서명·물러서기 단계가 변경 전과 같고 가장자리 칩·가장자리 자리가 없다', () => {
    for (const [type, expected] of Object.entries(GOLDEN)) {
      const actual = expected.map((_, seed) => {
        const input: ChipPlanInput = {
          feedType: type as ChipPlanInput['feedType'],
          seed,
          chips: [
            { kind: 'label', text: 'DROP', size: 'lg' },
            { kind: 'label', text: 'PICKUP', size: 'sm' },
          ],
          titleLines: [5, 6],
          descriptionLength: 40,
          descriptionVisible: true,
          hasImage: true,
          widths: [358],
        }
        const plan = planCardChips(input)
        expect(plan.chips.some((chip) => chip.edge)).toBe(false)
        expect(chipPlanCandidates(input).length).toBeLessThanOrEqual(8)
        expect(cardGeometryOf({ ...input, feedType: type as ChipGeometryType, width: 358 }).titleEdgeOpen).toBe(false)
        return `${signatureOf(plan)}#${plan.backoff}`
      })
      expect(actual, type).toEqual(expected)
    }
  })
})
