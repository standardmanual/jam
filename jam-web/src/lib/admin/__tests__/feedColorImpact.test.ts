/**
 * 홈피드 컬러셋 영향 계산 (티켓 20261121_2146).
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/feedColorImpact.test.ts
 */
import { describe, expect, it } from 'vitest'
import {
  IMPACT_CARD_LIMIT,
  buildEditedPalette,
  changedColorKeys,
  comparePalettes,
  findNewlyViolatedCards,
  type FeedColorCardInput,
} from '../feedColorImpact'
import { DEFAULT_FEED_PALETTE } from '@/lib/today/feedAssign'
import { buildFeedPalette } from '@/lib/today/feedColorOverrides'
import { firstViolatedRule } from '@/lib/today/feedColorRules'

const card = (overrides: Partial<FeedColorCardInput> = {}): FeedColorCardInput => ({
  id: 'c1',
  title: '카드',
  feedType: 'hero_box',
  bgColorKey: 'yellow',
  chipColorKey: 'red',
  boxColorKey: 'green',
  ...overrides,
})

/** 옐로(#f9fd69)와 거의 같은 값으로 바꾼 레드 → 배경 옐로·칩 레드 조합이 새로 걸린다 */
const NEAR_YELLOW_RED = '#f9fc6a'
const edited = buildFeedPalette({ red: NEAR_YELLOW_RED })

describe('전제: 시험 값이 실제로 «지금은 통과, 편집하면 걸림»이다', () => {
  it('기본 팔레트에서 배경 옐로·칩 레드는 통과하고 편집 팔레트에서는 걸린다', () => {
    expect(firstViolatedRule(DEFAULT_FEED_PALETTE.yellow, DEFAULT_FEED_PALETTE.red, { involvesChip: true })).toBeNull()
    expect(firstViolatedRule(edited.yellow, edited.red, { involvesChip: true })).not.toBeNull()
  })
})

describe('buildEditedPalette · changedColorKeys', () => {
  it('쓸 수 있는 hex만 얹고(소문자로) 잘못된 글자는 현재 값을 남긴다', () => {
    const current = buildFeedPalette({})
    const palette = buildEditedPalette(current, { red: '#AABBCC', blue: '#12', yellow: '' })
    expect(palette.red).toBe('#aabbcc')
    expect(palette.blue).toBe(current.blue)
    expect(palette.yellow).toBe(current.yellow)
  })

  it('hex가 다른 키만 9색 순서로 돌려주고 대소문자만 다르면 같은 값으로 본다', () => {
    const current = buildFeedPalette({})
    const next = buildEditedPalette(current, { blue: '#000000', red: current.red.toLowerCase() })
    expect(changedColorKeys(current, next)).toEqual(['blue'])
  })
})

describe('comparePalettes', () => {
  it('같은 팔레트면 통과 조합 수가 같고 줄지 않았다', () => {
    const current = buildFeedPalette({})
    const result = comparePalettes(current, current)
    expect(result.delta).toBe(0)
    expect(result.decreased).toBe(false)
    expect(result.edited.remaining).toBe(result.current.remaining)
  })

  it('통과 조합이 줄어드는 편집은 decreased이고 delta는 음수다', () => {
    const current = buildFeedPalette({})
    // 여러 색을 한 값 근처로 몰아 통과 조합을 줄인다
    const palette = buildEditedPalette(current, { red: '#ff9b9b', yellow: '#ff9c9c', purple: '#ff9a9a' })
    const result = comparePalettes(current, palette)
    expect(result.edited.remaining).toBeLessThan(result.current.remaining)
    expect(result.decreased).toBe(true)
    expect(result.delta).toBeLessThan(0)
  })
})

describe('findNewlyViolatedCards', () => {
  const current = buildFeedPalette({})

  it('지금은 통과하는데 편집하면 걸리는 카드를 걸린 규칙·바뀐 색과 함께 돌려준다', () => {
    const result = findNewlyViolatedCards(current, edited, [card()])
    expect(result.total).toBe(1)
    expect(result.hidden).toBe(0)
    const [impacted] = result.cards
    expect(impacted.id).toBe('c1')
    expect(impacted.violations[0]).toMatchObject({ slots: ['bg', 'chip'], keys: ['yellow', 'red'] })
    expect(impacted.changedColors).toEqual([{ slot: 'chip', key: 'red', before: current.red.toLowerCase(), after: NEAR_YELLOW_RED }])
  })

  it('원래 걸리던 조합은 이번 변경 탓이 아니라서 제외한다', () => {
    // 같은 색을 배경과 칩에 쓴 카드는 지금도 '같은 색'으로 걸린다
    const alreadyBad = card({ id: 'bad', bgColorKey: 'red', chipColorKey: 'red', boxColorKey: null })
    expect(findNewlyViolatedCards(current, edited, [alreadyBad]).total).toBe(0)
  })

  it('색이 바뀌지 않으면 아무 카드도 걸리지 않는다', () => {
    expect(findNewlyViolatedCards(current, current, [card()]).total).toBe(0)
  })

  it('자동 배정으로 저장된 키 조합도 같은 방식으로 본다(저장된 키를 그대로 읽는다)', () => {
    const auto = card({ id: 'auto', title: '자동 배정 카드', bgColorKey: 'yellow', chipColorKey: 'red', boxColorKey: null })
    expect(findNewlyViolatedCards(current, edited, [auto]).cards.map((c) => c.id)).toEqual(['auto'])
  })

  it('새 모양 유형이 아니거나 모르는 색 키인 카드는 건너뛴다', () => {
    const old = card({ id: 'old', feedType: null })
    const unknownKey = card({ id: 'unknown', bgColorKey: 'not-a-color', chipColorKey: 'red', boxColorKey: null })
    expect(findNewlyViolatedCards(current, edited, [old, unknownKey]).total).toBe(0)
  })

  it('박스 칸이 없는 유형은 저장된 박스 키가 남아 있어도 박스가 낀 짝을 보지 않는다', () => {
    const noBox = card({ id: 'nb', feedType: 'badge_intro', bgColorKey: 'yellow', chipColorKey: 'red', boxColorKey: 'red' })
    const result = findNewlyViolatedCards(current, edited, [noBox])
    expect(result.total).toBe(1)
    expect(result.cards[0].violations.every((v) => !v.slots.includes('box'))).toBe(true)
  })

  it(`${IMPACT_CARD_LIMIT}장까지만 담고 나머지는 hidden으로 센다`, () => {
    const many = Array.from({ length: IMPACT_CARD_LIMIT + 5 }, (_, i) => card({ id: `c${i}`, title: `카드 ${i}` }))
    const result = findNewlyViolatedCards(current, edited, many)
    expect(result.total).toBe(IMPACT_CARD_LIMIT + 5)
    expect(result.cards).toHaveLength(IMPACT_CARD_LIMIT)
    expect(result.hidden).toBe(5)
    expect(result.cards[0].id).toBe('c0')
  })
})
