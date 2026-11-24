/**
 * 운영 묶음 이미지 색 시스템 배정 (티켓 20261124_1052)
 * - 쌍 표: 통합 팔레트 키만 쓰고 흰색 없음, 여섯 계열이 고르게 들어 있음
 * - 균형: 대상 4개 이상 묶음에서 한 계열이 색 칸의 25%(올림)를 넘지 않음, 49주차 입력 재현
 * - 고정: 같은 입력은 같은 결과, 순서를 섞어도 항목마다 같은 쌍, 한 바퀴 안에서는 같은 쌍을 다시 쓰지 않음
 * - 대상 판정과 묶음 적용: 트라이브·미션 소개 카드·preset_id 없음·다른 종류는 건드리지 않음
 */
import { describe, it, expect } from 'vitest'
import type { Json } from '@/types/database.generated'
import { FEED_COLOR_KEYS, FEED_COLORS } from '@/lib/today/feedConstants'
import {
  COLOR_FAMILY_OF,
  IMAGE_COLOR_FAMILIES,
  IMAGE_COLOR_PAIRS,
  applyImageColors,
  assignImageColors,
  imageColorFamilyCap,
  isImageColorTarget,
  type ImageColorFamily,
} from '../imageColorAssign'

const familyOfHex = new Map<string, ImageColorFamily>()
for (const key of FEED_COLOR_KEYS) {
  if (key !== 'white') familyOfHex.set(FEED_COLORS[key].hex.toLowerCase(), COLOR_FAMILY_OF[key])
}

function familyCounts(colors: Array<{ bg: string; end: string }>): Record<ImageColorFamily, number> {
  const counts = Object.fromEntries(IMAGE_COLOR_FAMILIES.map((f) => [f, 0])) as Record<ImageColorFamily, number>
  for (const c of colors) {
    counts[familyOfHex.get(c.bg)!] += 1
    counts[familyOfHex.get(c.end)!] += 1
  }
  return counts
}

const ids = (n: number, prefix = 'item') => Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(2, '0')}`)

describe('IMAGE_COLOR_PAIRS', () => {
  it('통합 팔레트 키만 쓰고 흰색은 쓰지 않으며 같은 쌍이 두 번 없다', () => {
    const seen = new Set<string>()
    for (const pair of IMAGE_COLOR_PAIRS) {
      expect(FEED_COLOR_KEYS).toContain(pair.bg)
      expect(FEED_COLOR_KEYS).toContain(pair.end)
      expect(pair.bg).not.toBe('white')
      expect(pair.end).not.toBe('white')
      expect(pair.bg).not.toBe(pair.end)
      seen.add(`${pair.bg}>${pair.end}`)
    }
    expect(seen.size).toBe(IMAGE_COLOR_PAIRS.length)
  })

  it('여섯 계열이 모두 들어 있고 계열별 칸 수 차이가 1 이하다', () => {
    const counts = Object.values(
      familyCounts(IMAGE_COLOR_PAIRS.map((p) => ({ bg: FEED_COLORS[p.bg].hex.toLowerCase(), end: FEED_COLORS[p.end].hex.toLowerCase() }))),
    )
    expect(Math.min(...counts)).toBeGreaterThan(0)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })
})

describe('assignImageColors', () => {
  it('49주차 입력(대상 6개, 색 칸 12개)에서 한 계열이 3칸을 넘지 않고 초록+파랑이 6칸을 넘지 않는다', () => {
    const colors = assignImageColors(['mission_1', 'mission_2', 'mission_3', 'hero_1', 'hero_2', 'hero_3'])
    const counts = familyCounts(colors)
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(3)
    expect(counts.green + counts.blue).toBeLessThanOrEqual(6)
  })

  it('대상 4~24개 묶음에서 한 계열이 색 칸의 25%(올림)를 넘지 않는다', () => {
    for (let n = 4; n <= 24; n += 1) {
      for (const prefix of ['item', 'k', '49w']) {
        const counts = familyCounts(assignImageColors(ids(n, prefix)))
        expect(Math.max(...Object.values(counts)), `n=${n} ${prefix}`).toBeLessThanOrEqual(imageColorFamilyCap(n))
      }
    }
  })

  it('같은 입력은 같은 결과이고 순서를 섞어도 항목마다 같은 쌍이 나온다', () => {
    const list = ids(9)
    const first = assignImageColors(list)
    expect(assignImageColors(list)).toEqual(first)
    const shuffled = [list[5], list[0], list[8], list[2], list[7], list[1], list[4], list[3], list[6]]
    const second = assignImageColors(shuffled)
    shuffled.forEach((id, i) => expect(second[i]).toEqual(first[list.indexOf(id)]))
  })

  it('한 바퀴를 다 돌기 전에는 같은 쌍을 다시 쓰지 않는다', () => {
    const n = IMAGE_COLOR_PAIRS.length
    const used = assignImageColors(ids(n)).map((c) => c.pairIndex)
    expect(new Set(used).size).toBe(n)
    const twice = assignImageColors(ids(n * 2)).map((c) => c.pairIndex)
    const tally = new Map<number, number>()
    for (const p of twice) tally.set(p, (tally.get(p) ?? 0) + 1)
    expect([...tally.values()].every((v) => v === 2)).toBe(true)
  })

  it('색은 소문자 #rrggbb이고 비어 있으면 빈 배열이다', () => {
    expect(assignImageColors([])).toEqual([])
    for (const c of assignImageColors(ids(5))) expect(c.bg).toMatch(/^#[0-9a-f]{6}$/)
  })
})

const UUID = '73f0f601-2382-900c-8ca2-5cc7c93ed95d'
function item(kind: string | null, original: Record<string, unknown>) {
  return { kind, original: original as Json, edited: null }
}

describe('isImageColorTarget', () => {
  const spec = { preset_id: 'p1', bg: '#111111', end: '#222222' }
  it('preset_id가 있는 홈피드 카드와 미션이 대상이다', () => {
    expect(isImageColorTarget(item('home_feed_card', { image_spec: spec, resource: { template_type: 'content_intro' } }))).toBe(true)
    expect(isImageColorTarget(item('mission', { image_spec: { preset_id: 'p1' } }))).toBe(true)
  })
  it('트라이브 카드·미션 소개 카드·preset_id 없음·다른 종류는 대상이 아니다', () => {
    expect(isImageColorTarget(item('home_feed_card', { image_spec: spec, tribe_id: UUID }))).toBe(false)
    expect(isImageColorTarget(item('home_feed_card', { image_spec: spec, resource: { template_type: 'mission_spotlight' } }))).toBe(false)
    expect(isImageColorTarget(item('home_feed_card', { image_spec: { bg: '#111111', end: '#222222' } }))).toBe(false)
    expect(isImageColorTarget(item('home_feed_card', { image_spec: { preset_id: '  ' } }))).toBe(false)
    expect(isImageColorTarget(item('home_feed_card', {}))).toBe(false)
    expect(isImageColorTarget(item('jam_badge', { image_spec: spec }))).toBe(false)
    expect(isImageColorTarget(item('collection_launch', { image_spec: spec }))).toBe(false)
    expect(isImageColorTarget(item('badge_intro', { image_spec: spec }))).toBe(false)
    expect(isImageColorTarget(item(null, { image_spec: spec }))).toBe(false)
  })
  it('tribe_id가 null이면 없는 것으로 본다', () => {
    expect(isImageColorTarget(item('mission', { image_spec: { preset_id: 'p1' }, tribe_id: null }))).toBe(true)
  })
})

describe('applyImageColors', () => {
  const mk = (position: number, item_key: string | null, kind: string | null, original: Record<string, unknown>) => ({
    position,
    item_key,
    kind,
    original: original as Json,
  })

  it('에이전트가 낸 색을 쌍 표 색으로 덮어쓰고 다른 칸은 그대로 둔다', () => {
    const items = [mk(0, 'm1', 'mission', { title: '걷기', image_spec: { preset_id: 'p1', bg: '#00ff00', end: '#0000ff', values: { a: 'b' } } })]
    const [out] = applyImageColors(items)
    const spec = (out.original as { image_spec: Record<string, unknown> }).image_spec
    expect(spec.bg).toMatch(/^#[0-9a-f]{6}$/)
    expect(spec.end).toMatch(/^#[0-9a-f]{6}$/)
    expect([spec.bg, spec.end]).not.toEqual(['#00ff00', '#0000ff'])
    expect(spec.preset_id).toBe('p1')
    expect(spec.values).toEqual({ a: 'b' })
    expect((out.original as { title: string }).title).toBe('걷기')
    expect((items[0].original as { image_spec: { bg: string } }).image_spec.bg).toBe('#00ff00')
  })

  it('색이 없던 대상에도 채우고, 대상이 아닌 항목은 같은 객체 그대로다', () => {
    const target = mk(0, 'a', 'home_feed_card', { image_spec: { preset_id: 'p1' } })
    const tribe = mk(1, 'b', 'home_feed_card', { image_spec: { preset_id: 'p1', bg: '#111111', end: '#222222' }, tribe_id: UUID })
    const spotlight = mk(2, 'c', 'home_feed_card', { image_spec: { preset_id: 'p1' }, resource: { template_type: 'mission_spotlight' } })
    const noPreset = mk(3, 'd', 'mission', { image_spec: { bg: '#111111', end: '#222222' } })
    const badge = mk(4, 'e', 'jam_badge', { image_spec: { preset_id: 'p1' } })
    const rest = [tribe, spotlight, noPreset, badge]
    const out = applyImageColors([target, ...rest])
    expect((out[0].original as { image_spec: { bg?: string } }).image_spec.bg).toMatch(/^#[0-9a-f]{6}$/)
    out.slice(1).forEach((o, i) => expect(o).toBe(rest[i]))
  })

  it('item_key가 없거나 겹쳐도 위치로 구분해 모두 배정한다', () => {
    const items = [
      mk(0, null, 'mission', { image_spec: { preset_id: 'p1' } }),
      mk(1, 'same', 'mission', { image_spec: { preset_id: 'p1' } }),
      mk(2, 'same', 'mission', { image_spec: { preset_id: 'p1' } }),
      mk(3, null, 'mission', { image_spec: { preset_id: 'p1' } }),
    ]
    const out = applyImageColors(items)
    const pairs = out.map((o) => JSON.stringify((o.original as { image_spec: unknown }).image_spec))
    expect(new Set(pairs).size).toBe(4)
  })
})
