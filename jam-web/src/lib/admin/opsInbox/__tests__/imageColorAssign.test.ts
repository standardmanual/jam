/**
 * 운영 묶음 이미지 색 시스템 배정 (티켓 20261124_1052)
 * - 쌍 표: 통합 팔레트 키만 쓰고 흰색 없음, 여섯 계열이 고르게 들어 있음
 * - 균형: 대상 4개 이상 묶음에서 한 계열이 색 칸의 25%(올림)를 넘지 않음, 49주차 입력 재현
 * - 이웃 (티켓 20261124_1517): 공개 순서로 이웃한 항목은 색 계열을 공유하지 않음, 쌍 표에 막다른 길 없음, 49주차 6건 재현
 * - 고정: 같은 입력은 같은 결과, 공개 순서가 같으면 같은 결과
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

function familiesOfColor(color: { bg: string; end: string }): Set<ImageColorFamily> {
  return new Set([familyOfHex.get(color.bg)!, familyOfHex.get(color.end)!])
}

/** 이웃한 두 항목이 계열을 하나라도 공유하는 자리(0부터)를 모은다. */
function neighborClashes(colors: Array<{ bg: string; end: string }>): number[] {
  const clashes: number[] = []
  for (let i = 1; i < colors.length; i += 1) {
    const before = familiesOfColor(colors[i - 1])
    if ([...familiesOfColor(colors[i])].some((f) => before.has(f))) clashes.push(i)
  }
  return clashes
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

  it('같은 입력은 같은 결과다', () => {
    const list = ids(9)
    expect(assignImageColors(list)).toEqual(assignImageColors([...list]))
  })

  it('입력 순서를 그대로 따른다(내부에서 다시 정렬하지 않는다)', () => {
    const list = ids(9)
    const forward = assignImageColors(list)
    const reversed = assignImageColors([...list].reverse())
    expect(reversed).toHaveLength(list.length)
    expect(reversed).not.toEqual([...forward].reverse())
  })

  it('이웃한 항목은 색 계열을 하나도 공유하지 않는다(1~24개, 여러 ID)', () => {
    for (let n = 1; n <= 24; n += 1) {
      for (const prefix of ['item', 'k', '49w']) {
        expect(neighborClashes(assignImageColors(ids(n, prefix))), `n=${n} ${prefix}`).toEqual([])
      }
    }
  })

  it('쌍 표 11개 모두에, 그 쌍과 계열이 겹치지 않는 쌍이 하나 이상 있다(막다른 길 없음)', () => {
    for (const pair of IMAGE_COLOR_PAIRS) {
      const families = new Set([COLOR_FAMILY_OF[pair.bg], COLOR_FAMILY_OF[pair.end]])
      const free = IMAGE_COLOR_PAIRS.filter((other) => !families.has(COLOR_FAMILY_OF[other.bg]) && !families.has(COLOR_FAMILY_OF[other.end]))
      expect(free.length, `${pair.bg}>${pair.end}`).toBeGreaterThan(0)
    }
  })

  it('이웃 규칙이 앞서도 쌍 쓰임이 고르다: 1~24개 묶음에서 가장 많이 쓴 쌍과 가장 적게 쓴 쌍의 차가 2 이하다', () => {
    for (let n = 1; n <= 24; n += 1) {
      for (const prefix of ['item', 'k', '49w']) {
        const uses = IMAGE_COLOR_PAIRS.map(() => 0)
        for (const c of assignImageColors(ids(n, prefix))) uses[c.pairIndex] += 1
        expect(Math.max(...uses) - Math.min(...uses), `n=${n} ${prefix}`).toBeLessThanOrEqual(2)
      }
    }
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
  const mk = (
    position: number,
    item_key: string | null,
    kind: string | null,
    original: Record<string, unknown>,
    starts_at: string | null = '2026-11-30T00:00:00+09:00',
  ) => ({
    position,
    starts_at,
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
  describe('공개 순서와 이웃 규칙', () => {
    const colorOf = (o: { original: Json }) => {
      const spec = (o.original as { image_spec: { bg: string; end: string } }).image_spec
      return { bg: spec.bg, end: spec.end }
    }
    const withPreset = { image_spec: { preset_id: 'p1' } }

    it('49주차 6건을 공개 순서로 배정하면 이웃이 계열을 공유하지 않고 한 계열이 3칸을 넘지 않는다', () => {
      const items = [
        mk(0, 'c-drops-near', 'home_feed_card', withPreset, '2026-11-30T00:00:00+09:00'),
        mk(1, 'm-walk-45', 'mission', withPreset, '2026-11-30T00:00:00+09:00'),
        mk(2, 'm-act-3', 'mission', withPreset, '2026-11-30T00:00:00+09:00'),
        mk(3, 'm-hike-300', 'mission', withPreset, '2026-11-30T00:00:00+09:00'),
        mk(4, 'c-pickup-walk', 'home_feed_card', withPreset, '2026-12-02T00:00:00+09:00'),
        mk(5, 'c-lock-open', 'home_feed_card', withPreset, '2026-12-03T00:00:00+09:00'),
      ]
      const colors = applyImageColors(items).map(colorOf)
      expect(neighborClashes(colors)).toEqual([])
      expect(Math.max(...Object.values(familyCounts(colors)))).toBeLessThanOrEqual(3)
    })

    it('입력 배열 순서가 달라도 공개 순서가 같으면 같은 결과다', () => {
      const items = [
        mk(0, 'a', 'mission', withPreset, '2026-11-30T00:00:00+09:00'),
        mk(1, 'b', 'mission', withPreset, '2026-12-01T00:00:00+09:00'),
        mk(2, 'c', 'mission', withPreset, '2026-12-02T00:00:00+09:00'),
        mk(3, 'd', 'mission', withPreset, '2026-12-03T00:00:00+09:00'),
        mk(4, 'e', 'mission', withPreset, '2026-12-04T00:00:00+09:00'),
      ]
      const forward = applyImageColors(items)
      const shuffled = [items[3], items[0], items[4], items[2], items[1]]
      const second = applyImageColors(shuffled)
      expect(applyImageColors(items)).toEqual(forward)
      shuffled.forEach((it2, i) => expect(colorOf(second[i])).toEqual(colorOf(forward[items.indexOf(it2)])))
    })

    it('이웃은 배열 순서가 아니라 공개 순서로 정해진다(뒤섞인 입력에서도 겹치지 않는다)', () => {
      const items = Array.from({ length: 12 }, (_, i) =>
        mk(i, `k${i}`, 'mission', withPreset, `2026-12-${String(1 + ((i * 5) % 12)).padStart(2, '0')}T00:00:00+09:00`),
      )
      const out = applyImageColors(items)
      const ordered = items
        .map((it2, i) => ({ at: it2.starts_at ?? '', color: colorOf(out[i]) }))
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
        .map((x) => x.color)
      expect(neighborClashes(ordered)).toEqual([])
    })

    it('starts_at이 같은 항목은 position 순, starts_at이 없거나 날짜가 아닌 항목은 맨 뒤다', () => {
      const same = '2026-11-30T00:00:00+09:00'
      const items = [
        mk(5, 'late', 'mission', withPreset, null),
        mk(2, 'p2', 'mission', withPreset, same),
        mk(0, 'p0', 'mission', withPreset, same),
        mk(9, 'bad', 'mission', withPreset, '날짜 아님'),
        mk(1, 'p1', 'mission', withPreset, same),
      ]
      const out = applyImageColors(items)
      // 기대 순서: p0, p1, p2, (late·bad는 position 5, 9 순)
      const expectedSequence = ['p0', 'p1', 'p2', 'late', 'bad']
      const expected = assignImageColors(expectedSequence)
      expectedSequence.forEach((key, i) => {
        const at = items.findIndex((it2) => it2.item_key === key)
        expect(colorOf(out[at])).toEqual({ bg: expected[i].bg, end: expected[i].end })
      })
    })
  })
})
