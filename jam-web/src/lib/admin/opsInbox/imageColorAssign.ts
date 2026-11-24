/**
 * 운영 묶음 이미지 색(`image_spec.bg`·`end`)의 시스템 배정 (티켓 20261124_1052). 규칙 정본은 `docs/service/prd/ops-tool/PRD.md` §8.9다.
 *
 * 배경: 49주차 묶음에서 에이전트가 고른 이미지 색이 초록·파랑 계열에 67% 몰렸다. 색을 고르는 일을 에이전트에게서 거두고,
 * 제출을 받는 서버가 통합 팔레트(`FEED_COLORS`)에서 만든 쌍 표로 묶음 안에서 쏠리지 않게 배정한다.
 *
 * 공개 순서로 이웃한 두 항목은 색 계열을 하나도 공유하지 않는다(티켓 20261124_1517).
 *
 * 순수 모듈이다(`server-only`를 두지 않는다). 난수·현재 시각을 쓰지 않아 같은 입력(같은 항목, 같은 공개 순서)은 언제나 같은 출력이다.
 */
import type { Json } from '@/types/database.generated'
import { FEED_COLORS, type FeedColorKey } from '@/lib/today/feedConstants'
import { asRecord, itemField, type ViewableItem } from './itemView'
import { readImageSpec, stableImageSeed, usesMissionImage } from './imageSpec'

/** 쏠림을 세는 계열 여섯. 초록·짙은 초록은 초록 계열, 하늘·파랑은 파랑 계열이다. 흰색은 이미지 바탕으로 쓰지 않아 계열이 없다. */
export type ImageColorFamily = 'yellow' | 'green' | 'pink' | 'blue' | 'purple' | 'red'

export const IMAGE_COLOR_FAMILIES = ['yellow', 'green', 'pink', 'blue', 'purple', 'red'] as const satisfies readonly ImageColorFamily[]

type PaletteKey = Exclude<FeedColorKey, 'white'>

export const COLOR_FAMILY_OF: Readonly<Record<PaletteKey, ImageColorFamily>> = {
  yellow: 'yellow',
  green: 'green',
  'green-deep': 'green',
  pink: 'pink',
  sky: 'blue',
  blue: 'blue',
  purple: 'purple',
  red: 'red',
}

export interface ImageColorPair {
  /** 시작색 키(`image_spec.bg`가 되는 색) */
  readonly bg: PaletteKey
  /** 끝색 키(`image_spec.end`가 되는 색) */
  readonly end: PaletteKey
}

/**
 * 시작색→끝색 쌍 11개. 여섯 계열이 색 칸 22개에 3~4칸씩 고르게 들어간다(노랑 4·초록 4·파랑 4·보라 4·분홍 3·빨강 3).
 * 값은 hex가 아니라 `FEED_COLORS` 키다. 표를 바꿀 때는 PRD §8.9의 표도 함께 고친다.
 */
export const IMAGE_COLOR_PAIRS: readonly ImageColorPair[] = [
  { bg: 'yellow', end: 'pink' },
  { bg: 'yellow', end: 'sky' },
  { bg: 'green', end: 'yellow' },
  { bg: 'green-deep', end: 'sky' },
  { bg: 'sky', end: 'purple' },
  { bg: 'blue', end: 'green' },
  { bg: 'purple', end: 'green-deep' },
  { bg: 'red', end: 'purple' },
  { bg: 'red', end: 'yellow' },
  { bg: 'pink', end: 'purple' },
  { bg: 'red', end: 'pink' },
]

/** 한 계열이 색 칸에서 차지할 수 있는 비율 상한(대상이 4개 이상인 묶음에서 지킨다). */
export const IMAGE_COLOR_FAMILY_MAX_SHARE = 0.25

/** 이 묶음에서 한 계열이 가질 수 있는 색 칸 수의 상한(올림). 대상 `count`개면 색 칸은 `2 * count`다. */
export function imageColorFamilyCap(count: number): number {
  return Math.ceil(2 * count * IMAGE_COLOR_FAMILY_MAX_SHARE)
}

export interface AssignedImageColor {
  /** `#rrggbb` 소문자 */
  bg: string
  end: string
  /** 쌍 표의 몇 번째 쌍인가 */
  pairIndex: number
}

function hexOf(key: PaletteKey): string {
  return FEED_COLORS[key].hex.toLowerCase()
}

/** 이 항목이 시스템 배정 대상인가. 종류가 홈피드 카드·미션이고, `preset_id`가 있고, `tribe_id`가 없고, 미션 소개 카드가 아니다. */
export function isImageColorTarget(item: ViewableItem & { kind: string | null }): boolean {
  if (item.kind !== 'home_feed_card' && item.kind !== 'mission') return false
  const presetId = readImageSpec(item)?.preset_id
  if (typeof presetId !== 'string' || presetId.trim() === '') return false
  const tribeId = itemField(item, 'tribe_id')
  if (tribeId !== undefined && tribeId !== null && tribeId !== '') return false
  return !usesMissionImage(item)
}

function familiesOf(pair: ImageColorPair): Set<ImageColorFamily> {
  return new Set([COLOR_FAMILY_OF[pair.bg], COLOR_FAMILY_OF[pair.end]])
}

/** 두 쌍이 공유하는 계열 수. 0이면 이웃으로 놓을 수 있다. */
function sharedFamilyCount(pair: ImageColorPair, previous: ReadonlySet<ImageColorFamily>): number {
  let shared = 0
  for (const family of familiesOf(pair)) if (previous.has(family)) shared += 1
  return shared
}

/**
 * 대상 항목들의 색 쌍을 한 번에 정한다. 입력은 **공개 순서로 이미 늘어놓은** 항목 ID 배열이고, 결과는 같은 순서의 배열이다(내부에서 다시 정렬하지 않는다).
 *
 * 앞에서부터 하나씩 보며, 0) 바로 앞 항목과 색 계열을 하나도 공유하지 않는 쌍만 후보로 삼고(필수 조건),
 * 그 후보 안에서 ① 지금까지 가장 적게 쓰인 쌍(한 바퀴를 다 돌기 전에는 같은 쌍을 다시 쓰지 않는다) ② 고른 뒤 계열별 칸 수의 최댓값이 가장 낮고
 * ③ 제곱합이 가장 낮은 쌍을 고른다. ④ 그래도 같으면 항목 ID의 고정 시드로 정한다.
 * 쌍 표의 모든 쌍에 계열이 겹치지 않는 쌍이 있어 후보가 비지 않는다. 그래도 비면 겹침이 가장 적은 쌍들을 후보로 삼는다(던지지 않는다).
 */
export function assignImageColors(sequence: readonly string[]): AssignedImageColor[] {
  const familyCells: Record<ImageColorFamily, number> = { yellow: 0, green: 0, pink: 0, blue: 0, purple: 0, red: 0 }
  const pairUses = IMAGE_COLOR_PAIRS.map(() => 0)
  const result: AssignedImageColor[] = []
  let previous: ReadonlySet<ImageColorFamily> = new Set()

  for (const id of sequence) {
    const overlaps = IMAGE_COLOR_PAIRS.map((pair) => sharedFamilyCount(pair, previous))
    const fewestOverlap = Math.min(...overlaps)
    const allowed = IMAGE_COLOR_PAIRS.map((_, pairIndex) => pairIndex).filter((pairIndex) => overlaps[pairIndex] === fewestOverlap)
    const minUse = Math.min(...allowed.map((pairIndex) => pairUses[pairIndex]))
    let best: number[] = []
    let bestScore: [number, number] | null = null
    for (const pairIndex of allowed) {
      if (pairUses[pairIndex] !== minUse) continue
      const pair = IMAGE_COLOR_PAIRS[pairIndex]
      const next = { ...familyCells }
      next[COLOR_FAMILY_OF[pair.bg]] += 1
      next[COLOR_FAMILY_OF[pair.end]] += 1
      const counts = IMAGE_COLOR_FAMILIES.map((family) => next[family])
      const score: [number, number] = [Math.max(...counts), counts.reduce((sum, n) => sum + n * n, 0)]
      if (bestScore === null || score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
        bestScore = score
        best = [pairIndex]
      } else if (score[0] === bestScore[0] && score[1] === bestScore[1]) {
        best.push(pairIndex)
      }
    }
    const chosen = best[stableImageSeed(id) % best.length]
    const pair = IMAGE_COLOR_PAIRS[chosen]
    pairUses[chosen] += 1
    familyCells[COLOR_FAMILY_OF[pair.bg]] += 1
    familyCells[COLOR_FAMILY_OF[pair.end]] += 1
    previous = familiesOf(pair)
    result.push({ bg: hexOf(pair.bg), end: hexOf(pair.end), pairIndex: chosen })
  }
  return result
}

interface ColorAssignableItem {
  position: number
  starts_at: string | null
  item_key: string | null
  kind: string | null
  original: Json
}

/**
 * 묶음의 항목들 가운데 대상에 색을 배정해 `original.image_spec.bg`·`end`를 덮어쓴 새 항목 배열을 돌려준다(입력은 바꾸지 않는다).
 * 대상이 아닌 항목은 같은 객체 그대로다. 항목 ID는 `item_key`(없거나 묶음 안에서 겹치면 `#위치`)다.
 * 대상을 공개 순서(`starts_at` 오름차순, 날짜로 읽히지 않거나 없으면 맨 뒤, 같으면 `position`, 그래도 같으면 항목 ID)로 늘어놓아 `assignImageColors`에 넘긴다.
 */
export function applyImageColors<T extends ColorAssignableItem>(items: readonly T[]): T[] {
  const targets = items.filter((item) => isImageColorTarget({ kind: item.kind, original: item.original, edited: null }))
  if (targets.length === 0) return [...items]
  const keyCounts = new Map<string, number>()
  for (const item of targets) if (item.item_key) keyCounts.set(item.item_key, (keyCounts.get(item.item_key) ?? 0) + 1)
  const idOf = (item: T) => (item.item_key && keyCounts.get(item.item_key) === 1 ? item.item_key : `#${item.position}`)
  const startsAtMs = (item: T) => {
    const ms = item.starts_at ? Date.parse(item.starts_at) : Number.NaN
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms
  }
  const sequence = [...targets].sort((a, b) => {
    const byTime = startsAtMs(a) === startsAtMs(b) ? 0 : startsAtMs(a) < startsAtMs(b) ? -1 : 1
    if (byTime !== 0) return byTime
    if (a.position !== b.position) return a.position - b.position
    const idA = idOf(a)
    const idB = idOf(b)
    return idA < idB ? -1 : idA > idB ? 1 : 0
  })
  const assigned = new Map<T, AssignedImageColor>()
  const colors = assignImageColors(sequence.map(idOf))
  sequence.forEach((item, i) => assigned.set(item, colors[i]))
  return items.map((item) => {
    const color = assigned.get(item)
    if (!color) return item
    const original = asRecord(item.original)
    const spec = asRecord(original?.image_spec)
    if (!original || !spec) return item
    return { ...item, original: { ...original, image_spec: { ...spec, bg: color.bg, end: color.end } } as Json }
  })
}
