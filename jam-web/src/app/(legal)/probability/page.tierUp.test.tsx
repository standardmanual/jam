/**
 * /probability — 등급 올리기 섹션 (티켓 20261022_2119 4회, 20261023_1648 2회, 운영 로직 8.4·18.3절, 채원 사전 판정 2026-10-23)
 *
 * `page.test.tsx`와 같은 방식이다: 읽기 모듈(`disclosure.ts`)은 mock하지 않고 `createServiceClient`만 가짜 클라이언트로 바꿔서
 * 설정 행 → 표 행 → 화면까지 한 줄로 시험한다. 공용 DB는 부르지 않는다. 기존 시험 파일은 어쩔 수 없이 바뀌는 숫자와 목록만 고쳤고
 * 이 섹션의 시험은 이 파일에 모았다(병렬 세션과의 충돌을 줄이려는 배치다).
 *
 * 고정하는 것:
 * - 자리와 구성: 시스템 드랍 다음, 확률이 없는 것 앞. h2 → 소개 문단 → 표 3개(h3 «Common 5개를 넣으면»…) → 끝 Note 한 개. h3는 3개다.
 * - 값: 기본 설정(`combine_policy.tier_up_probability` 0.7)에서 재료 등급마다 «넣은 등급 그대로 30%» / «바로 윗등급 70%». 70% 줄을 강조하지 않는다.
 *   설정을 바꾸면 따라 바뀌고(0·1·0.5·0.333), 서버 굴림의 `tierUpProbabilities`와 같다. 0%·100% 줄을 지우지 않는다.
 * - 사라진 문구: 트라이브 표(h3 «받는 아이템 배지»), «캡슐의 등급 확률에서 … 비율을 다시 맞춘 값», 이 섹션의 «처음 뽑는 등급이에요»·«한 등급씩 낮춰서»·«넣은 등급보다 낮아지지는 않아요».
 *   낮춤 문장(`LOWERING_RULE`)은 동기화·캡슐·보정 장치 세 곳에만 남는다.
 * - 서식: 의미 있는 표(caption, th scope="row"), 값 칸은 오른쪽 정렬·tabular-nums·whitespace-nowrap, 한국어 줄바꿈 클래스, 가로 스크롤 래퍼·링크·버튼·아이콘 없음.
 * - 따로 실패한다: `combine_policy`를 못 읽으면 h2 + 소개 문단 + 안내 한 개 + 끝 Note뿐이고 숫자가 하나도 없으며 다른 섹션은 그대로다.
 *   반대로 캡슐·동기화 설정을 못 읽어도 등급 올리기 표는 그대로 보인다.
 * - 기존 «확률이 없는 것» 문단은 «레시피로 하는 믹스»로 좁혀졌고 문단 하나를 유지한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(legal)/probability/page.tierUp.test.tsx"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/probability',
  useSearchParams: () => new URLSearchParams(),
}))

const { createServiceClientMock } = vi.hoisted(() => ({ createServiceClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
  createClient: () => {
    throw new Error('확률 안내는 로그인 확인을 하지 않는다')
  },
}))

import ProbabilityPage from './page'
import { DEFAULT_COMBINE_POLICY } from '@/lib/combine/policy'
import { TIER_UP_MATERIAL_RARITIES, tierUpProbabilities } from '@/lib/combine/tierUpOdds'
import { formatFraction } from '@/lib/probability/disclosure'
import { ALL_OK, CAPSULE_ROW, COMBINE_ROW, failed, fakeClient, ok, type Result } from '@/lib/probability/__tests__/fixtures'

const UNAVAILABLE = '지금 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.'
const TITLE = '등급 올리기'
const LOWERING_RULE = '그 등급에 받을 수 있는 아이템 배지가 없으면 한 등급씩 낮춰서 무작위로 골라요.'
const INTRO =
  '믹스 화면의 등급 올리기에서 같은 등급의 아이템 배지를 넣고 받을 컬렉션을 고르면, 그 컬렉션의 새 아이템 배지를 받아요. 받는 등급은 확률로 정해지고, 넣은 등급의 바로 윗등급이 나오거나 같은 등급이 나와요. Mystic은 넣을 수 없어요.'
const PICK_NOTE = '등급이 정해지면 고른 컬렉션에서 그 등급으로 받을 수 있는 아이템 배지를 모두 같은 확률로 골라요.'

async function render(results: Record<string, Result> = ALL_OK): Promise<string> {
  createServiceClientMock.mockReturnValue(fakeClient(results).client)
  return renderToStaticMarkup(await ProbabilityPage())
}

const withProbability = (tier_up_probability: unknown): Record<string, Result> => ({
  ...ALL_OK,
  combine_policy: ok({ ...COMBINE_ROW, tier_up_probability }),
})

/** 태그를 지운 글. 화면에 보이지 않는 표 caption은 뺀다(소제목과 값 줄이 이어 붙어 읽히도록) */
const textOf = (html: string) => html.replace(/<caption[^>]*>[^<]*<\/caption>/g, '').replace(/<[^>]*>/g, '')
const count = (html: string, needle: string) => html.split(needle).length - 1
/** 제목(h2) 하나가 시작하는 곳부터 다음 h2 앞까지 */
function sectionOf(html: string, title: string): string {
  const start = html.indexOf(`>${title}</h2>`)
  expect(start, `«${title}» 섹션을 찾지 못했다`).toBeGreaterThan(-1)
  const next = html.indexOf('<h2', start)
  return html.slice(start, next === -1 ? undefined : next)
}
/** 표 하나의 값 칸(td)을 순서대로 */
const cellsOf = (html: string) => [...html.matchAll(/<td class="([^"]*)">([^<]*)<\/td>/g)].map((m) => ({ cls: m[1], text: m[2] }))
/** 문단(p) 글을 순서대로 */
const paragraphsOf = (html: string) => [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => textOf(m[1]))

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  createServiceClientMock.mockReset()
})

describe('정상 — 자리와 구성', () => {
  it('시스템 드랍 다음, 확률이 없는 것 앞에 있고 h1 → h2 → h3 계층이 유지된다. h3는 세 개다', async () => {
    const html = await render()
    const titles = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])
    expect(titles.indexOf(TITLE)).toBe(titles.indexOf('시스템 드랍') + 1)
    expect(titles.indexOf('확률이 없는 것')).toBe(titles.indexOf(TITLE) + 1)

    const section = sectionOf(html, TITLE)
    expect(count(section, '<h3')).toBe(3)
    expect(section).not.toContain('<h1')
    expect(section).not.toContain('<h4')
  })

  it('소개 문단 → 소제목 세 개 → 끝 Note가 정해진 순서로 나온다', async () => {
    const text = textOf(sectionOf(await render(), TITLE))
    const order = [INTRO, 'Common 5개를 넣으면', 'Rare 5개를 넣으면', 'Epic 5개를 넣으면', PICK_NOTE].map((needle) => text.indexOf(needle))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('소개 문단은 컬렉션을 고른다는 말과 «바로 윗등급이 나오거나 같은 등급이 나와요»를 담은 세 문장이다', async () => {
    const section = sectionOf(await render(), TITLE)
    const [intro] = paragraphsOf(section)
    expect(intro).toBe(INTRO)
    expect(intro).toContain('받을 컬렉션을 고르면')
    expect(intro).toContain('넣은 등급의 바로 윗등급이 나오거나 같은 등급이 나와요')
    expect(intro.split(/(?<=요\.)\s/)).toHaveLength(3)
  })

  it('소제목은 짧아서 320px에서 한 줄에 들어간다 — «아이템 배지»를 소제목에 붙이지 않고 트라이브 소제목이 없다', async () => {
    const section = sectionOf(await render(), TITLE)
    const headings = [...section.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1])
    expect(headings).toEqual(['Common 5개를 넣으면', 'Rare 5개를 넣으면', 'Epic 5개를 넣으면'])
    expect(headings.join()).not.toContain('받는 아이템 배지')
  })

  it('재료 등급마다 두 줄 — 넣은 등급 그대로가 먼저(30%), 바로 윗등급이 아래(70%)다(기본 설정)', async () => {
    const text = textOf(sectionOf(await render(), TITLE))
    expect(text).toContain('Common 5개를 넣으면Common30%Rare70%')
    expect(text).toContain('Rare 5개를 넣으면Rare30%Epic70%')
    expect(text).toContain('Epic 5개를 넣으면Epic30%Mystic70%')
    // Mystic 재료 표는 없다
    expect(text).not.toContain('Mystic 5개를 넣으면')
  })

  it('끝 Note는 섹션 맨 끝에 한 번만 있다 — 표 아래마다 붙지 않고 Note를 쌓지 않는다', async () => {
    const section = sectionOf(await render(), TITLE)
    expect(count(section, 'border-l-2')).toBe(1)
    expect(count(textOf(section), PICK_NOTE)).toBe(1)
    expect(textOf(section).endsWith(PICK_NOTE)).toBe(true)
    // 소개 문단 + Note뿐이다 — 표 칸(th·td)은 p가 아니다
    expect(paragraphsOf(section)).toEqual([INTRO, PICK_NOTE])
    // 마지막 표 뒤에 Note가 바로 이어진다
    expect(section.lastIndexOf('</table>')).toBeLessThan(section.indexOf('border-l-2'))
  })

  it('컬렉션을 고른다는 말은 소개 문단에만, 같은 확률로 고른다는 말은 Note에만 있다(같은 설명을 되풀이하지 않는다)', async () => {
    const [intro, note] = paragraphsOf(sectionOf(await render(), TITLE))
    expect(intro).toContain('컬렉션을 고르면')
    expect(intro).not.toContain('같은 확률')
    expect(note).toContain('같은 확률')
    expect(note).not.toContain('컬렉션을 고르면')
  })

  it('사라진 문구가 없다 — 트라이브 표, 캡슐 확률에서 다시 맞춘 값, 처음 뽑는 등급, 낮춤 문장', async () => {
    const text = textOf(sectionOf(await render(), TITLE))
    for (const gone of [
      '받는 아이템 배지다른 트라이브', // 옛 h3 + 트라이브 표 라벨
      '다른 트라이브',
      '캡슐의 등급 확률에서',
      '비율을 다시 맞춘 값이에요',
      '이 확률은 처음 뽑는 등급이에요',
      '처음 뽑는 등급',
      '한 등급씩 낮춰서',
      '넣은 등급보다 낮아지지는 않아요',
      '받을 수 있는 아이템 배지가 여럿이면',
    ]) {
      expect(text, gone).not.toContain(gone)
    }
  })

  it('낮춤 문장은 동기화·캡슐·보정 장치 세 곳에만 있다(같은 상수 한 곳의 말)', async () => {
    const html = await render()
    expect(count(textOf(html), LOWERING_RULE)).toBe(3)
    expect(count(textOf(sectionOf(html, TITLE)), LOWERING_RULE)).toBe(0)
  })

  it('링크·버튼·아이콘·이미지가 없다(열기를 부추기지 않는다)', async () => {
    const section = sectionOf(await render(), TITLE)
    expect(section).not.toMatch(/<a\b|<button|<svg|<img|<canvas|role="button"|tabindex/i)
  })
})

describe('정상 — 표 마크업', () => {
  it('표 세 개마다 sr-only caption이 있고 라벨 칸은 th scope="row"다', async () => {
    const section = sectionOf(await render(), TITLE)
    expect(count(section, '<table')).toBe(3)
    const captions = [...section.matchAll(/<caption class="sr-only">([^<]*)<\/caption>/g)].map((m) => m[1])
    expect(captions).toEqual([
      'Common 아이템 배지 5개를 넣었을 때 받는 등급 확률',
      'Rare 아이템 배지 5개를 넣었을 때 받는 등급 확률',
      'Epic 아이템 배지 5개를 넣었을 때 받는 등급 확률',
    ])
    // 행: 표마다 정확히 두 줄 — 2 + 2 + 2 = 6, 행마다 th 하나 + td 하나
    expect(count(section, '<tr')).toBe(6)
    expect(count(section, '<th scope="row"')).toBe(6)
    expect(count(section, '<td ')).toBe(6)
  })

  it('값 칸은 오른쪽 정렬·tabular-nums이고 줄바꿈하지 않는다. 가로 스크롤 래퍼가 없다', async () => {
    const section = sectionOf(await render(), TITLE)
    const cells = cellsOf(section)
    expect(cells.map((c) => c.text)).toEqual(['30%', '70%', '30%', '70%', '30%', '70%'])
    for (const cell of cells) {
      expect(cell.cls, cell.text).toContain('text-right')
      expect(cell.cls, cell.text).toContain('tabular-nums')
      expect(cell.cls, cell.text).toContain('whitespace-nowrap')
    }
    expect(section).not.toContain('overflow-x')
    // 라벨은 왼쪽 정렬이고 줄바꿈 금지가 없다(값 칸만 줄바꿈하지 않는다)
    expect(section).toMatch(/<th scope="row" class="[^"]*text-left[^"]*">Common/)
    expect(section).not.toMatch(/<th[^>]*whitespace-nowrap/)
  })

  it('70% 줄을 굵게·색·테두리로 띄우지 않는다 — 30% 칸과 70% 칸의 클래스가 같다', async () => {
    const section = sectionOf(await render(), TITLE)
    const cells = cellsOf(section)
    const classes = new Set(cells.map((c) => c.cls))
    expect(classes.size).toBe(1)
    const rows = [...section.matchAll(/<tr class="([^"]*)">/g)].map((m) => m[1])
    expect(new Set(rows).size).toBe(1)
    const labels = [...section.matchAll(/<th scope="row" class="([^"]*)">/g)].map((m) => m[1])
    expect(new Set(labels).size).toBe(1)
  })

  it('한국어를 그리는 모든 제목·문단·표 칸에 줄바꿈 클래스가 있다', async () => {
    const section = sectionOf(await render(), TITLE)
    const elements = [...section.matchAll(/<(h2|h3|p|th|td)\b([^>]*)>/g)]
    // 섹션 조각은 h2 닫는 태그부터 시작하므로 h2 여는 태그는 세지 않는다: p 2 + h3 3 + th 6 + td 6
    expect(elements).toHaveLength(17)
    for (const [, tag, attrs] of elements) expect(attrs, `<${tag}>`).toContain('break-keep wrap-break-word')
  })

  it('새 섹션을 다시 카드로 감싸지 않는다 — 표 카드 세 개뿐이고 색·그래프·애니메이션이 없다', async () => {
    const section = sectionOf(await render(), TITLE)
    expect(count(section, 'rounded-2xl bg-surface')).toBe(3)
    expect(section).not.toMatch(/gradient|animate-|transition|--link|--accent|rarity|progress|text-center|font-bold|font-semibold/i)
  })

  it('유저 화면에 쓰지 않는 말과 열기를 부추기는 말이 없다', async () => {
    const text = textOf(sectionOf(await render(), TITLE))
    const banned = [
      '퀘스트', '랜덤', '개체', '후보', '소각', '발급', '재료', 'POI',
      '아이템북', '승급', '업그레이드', '강화', '합성', '레벨업',
      '한 번만 더', '조금만 더', '남았어요', 'UP', '꽝', '당첨', '대박', '운이 좋', '천장',
    ]
    for (const word of banned) expect(text, word).not.toContain(word)
    expect(text).not.toMatch(/→|↑|⬆|▲/)
  })

  it('문구에 «70%», «30%», «5개» 같은 숫자를 직접 쓰지 않는다 — 숫자는 표와 소제목에만 있다', async () => {
    const [intro, note] = paragraphsOf(sectionOf(await render(), TITLE))
    expect(intro).not.toMatch(/\d/)
    expect(note).not.toMatch(/\d/)
  })
})

describe('값은 읽은 설정에서 만든다 (combine_policy.tier_up_probability)', () => {
  it('윗등급 확률을 0.4로 바꾸면 표가 따라 바뀌고 바뀌기 전 값은 남지 않는다', async () => {
    const section = sectionOf(await render(withProbability(0.4)), TITLE)
    const text = textOf(section)
    expect(text).toContain('Common 5개를 넣으면Common60%Rare40%')
    expect(text).toContain('Rare 5개를 넣으면Rare60%Epic40%')
    expect(text).toContain('Epic 5개를 넣으면Epic60%Mystic40%')
    const cells = cellsOf(section).map((c) => c.text)
    expect(cells).not.toContain('70%')
    expect(cells).not.toContain('30%')
  })

  it('0이면 같은 등급 100% / 윗등급 0%이고 0% 줄을 지우지 않는다', async () => {
    const section = sectionOf(await render(withProbability(0)), TITLE)
    const text = textOf(section)
    expect(text).toContain('Common 5개를 넣으면Common100%Rare0%')
    expect(text).toContain('Rare 5개를 넣으면Rare100%Epic0%')
    expect(text).toContain('Epic 5개를 넣으면Epic100%Mystic0%')
    expect(count(section, '<tr')).toBe(6)
  })

  it('1이면 같은 등급 0% / 윗등급 100%이고 0% 줄을 지우지 않는다', async () => {
    const section = sectionOf(await render(withProbability(1)), TITLE)
    const text = textOf(section)
    expect(text).toContain('Common 5개를 넣으면Common0%Rare100%')
    expect(text).toContain('Rare 5개를 넣으면Rare0%Epic100%')
    expect(text).toContain('Epic 5개를 넣으면Epic0%Mystic100%')
    expect(count(section, '<tr')).toBe(6)
  })

  it('0.5이면 50% / 50%다', async () => {
    const cells = cellsOf(sectionOf(await render(withProbability(0.5)), TITLE)).map((c) => c.text)
    expect(cells).toEqual(['50%', '50%', '50%', '50%', '50%', '50%'])
  })

  it('0.333이면 «66.7% / 33.3%»로 소수 둘째 자리까지 정리된다(부동소수 꼬리가 없다)', async () => {
    const section = sectionOf(await render(withProbability(0.333)), TITLE)
    expect(textOf(section)).toContain('Common 5개를 넣으면Common66.7%Rare33.3%')
    for (const cell of cellsOf(section)) expect(cell.text).toMatch(/^\d+(\.\d{1,2})?%$/)
  })

  it('1 - 0.7의 부동소수 오차(0.30000000000000004)가 «30%»로 나온다', async () => {
    const cells = cellsOf(sectionOf(await render(), TITLE)).map((c) => c.text)
    expect(1 - 0.7).not.toBe(0.3)
    expect(cells[0]).toBe('30%')
    expect(cells.join()).not.toContain('0000')
  })

  it('표의 값이 서버 굴림의 tierUpProbabilities 출력과 같다(페이지와 실제 결과의 함수가 하나다)', async () => {
    for (const p of [0, 0.2, 0.333, 0.5, 0.7, 1]) {
      const cells = cellsOf(sectionOf(await render(withProbability(p)), TITLE)).map((c) => c.text)
      const expected = TIER_UP_MATERIAL_RARITIES.flatMap((material) => tierUpProbabilities(material, p).map(([, prob]) => formatFraction(prob)))
      expect(cells, `p=${p}`).toEqual(expected)
    }
  })

  it('캡슐 등급·다른 트라이브 확률을 바꿔도 등급 올리기 표는 그대로다(더는 캡슐 설정에서 만들지 않는다)', async () => {
    const changed = {
      ...ALL_OK,
      capsule_policy: ok({ ...CAPSULE_ROW, rarity_common: 60, rarity_rare: 25, rarity_epic: 10, rarity_mystic: 5, other_tribe_probability: 0.35 }),
    }
    expect(sectionOf(await render(changed), TITLE)).toBe(sectionOf(await render(), TITLE))
  })
})

describe('읽기 실패 — 소개 문단 + 안내 한 개 + 끝 Note뿐이고 숫자가 없다', () => {
  const numbers = /\d/

  it.each([
    ['조회 오류', { ...ALL_OK, combine_policy: failed }],
    ['행 없음', { ...ALL_OK, combine_policy: { data: null, error: null } }],
    ['조회 예외', { ...ALL_OK, combine_policy: 'throw' as const }],
    ['칸이 아직 없음', { ...ALL_OK, combine_policy: ok({ id: 1, fail_reward_points: 10 }) }],
    ['숫자가 아님', withProbability('abc')],
    ['0보다 작음', withProbability(-0.2)],
    ['1보다 큼', withProbability(1.5)],
  ])('combine_policy %s → 소개 + 안내 한 개 + Note만 남고 표·소제목·숫자가 없다', async (_name, results) => {
    const html = await render(results)
    const section = sectionOf(html, TITLE)
    const text = textOf(section)
    expect(count(section, 'role="status"')).toBe(1)
    expect(paragraphsOf(section).filter((p) => p !== UNAVAILABLE)).toEqual([INTRO, PICK_NOTE])
    expect(text).toContain(UNAVAILABLE)
    // 순서: 소개 문단 → 안내 → Note
    expect([INTRO, UNAVAILABLE, PICK_NOTE].map((needle) => text.indexOf(needle))).toEqual(
      [INTRO, UNAVAILABLE, PICK_NOTE].map((needle) => text.indexOf(needle)).sort((a, b) => a - b)
    )
    expect(text.indexOf(UNAVAILABLE)).toBeGreaterThan(text.indexOf(INTRO))
    expect(text.indexOf(PICK_NOTE)).toBeGreaterThan(text.indexOf(UNAVAILABLE))
    expect(section).not.toContain('<table')
    expect(section).not.toContain('<h3')
    expect(text).not.toMatch(numbers)
    expect(text).not.toContain('%')
    // 이 실패는 다른 섹션에 번지지 않는다 — 안내는 이 섹션 한 곳뿐이고 다른 표는 그대로다
    expect(count(html, 'role="status"')).toBe(1)
    expect(textOf(sectionOf(html, '동기화로 받는 아이템 배지'))).toMatch(/Common84%/)
    expect(textOf(sectionOf(html, '캡슐'))).toMatch(/Common70%/)
    expect(textOf(sectionOf(html, '시스템 드랍'))).toMatch(/Common100%/)
    expect(count(sectionOf(html, '보정 장치'), '<li')).toBe(2)
  })

  it('기본값(0.7 → 30% / 70%)으로 대신 그리지 않는다', async () => {
    expect(DEFAULT_COMBINE_POLICY.tier_up_probability).toBe(0.7)
    const text = textOf(sectionOf(await render({ ...ALL_OK, combine_policy: failed }), TITLE))
    expect(text).not.toContain('70%')
    expect(text).not.toContain('30%')
  })

  it('반대 방향: 캡슐·동기화 설정을 못 읽어도 등급 올리기 표는 그대로 보인다', async () => {
    for (const results of [
      { ...ALL_OK, capsule_policy: failed },
      { ...ALL_OK, jam_policy: failed },
      { ...ALL_OK, capsule_policy: 'throw' as const },
    ]) {
      const html = await render(results)
      const section = sectionOf(html, TITLE)
      expect(count(section, '<table')).toBe(3)
      expect(count(section, 'role="status"')).toBe(0)
      expect(textOf(section)).toContain('Common 5개를 넣으면Common30%Rare70%')
      // 안내는 동기화·캡슐·보정 장치 세 곳뿐이다
      expect(count(html, 'role="status"')).toBe(3)
      for (const title of ['동기화로 받는 아이템 배지', '캡슐', '보정 장치']) {
        expect(count(sectionOf(html, title), 'role="status"'), title).toBe(1)
      }
    }
  })

  it('시스템 드랍만 못 읽으면 등급 올리기는 그대로다', async () => {
    const html = await render({ ...ALL_OK, ambient_drop_config: failed })
    const section = sectionOf(html, TITLE)
    expect(count(html, 'role="status"')).toBe(1)
    expect(count(section, '<table')).toBe(3)
    expect(textOf(section)).toContain('Rare30%Epic70%')
  })

  it('설정 표를 모두 못 읽어도 %·÷·날짜 외 숫자가 없고 안내는 다섯 개다', async () => {
    const html = await render({
      capsule_policy: failed,
      jam_policy: 'throw',
      combine_policy: failed,
      ambient_drop_config: { data: null, error: null },
    })
    const text = textOf(html).replace('2026년 10월 21일', '')
    expect(count(html, 'role="status"')).toBe(5)
    expect(text).not.toContain('%')
    expect(text).not.toContain('÷')
    expect(text).not.toMatch(numbers)
    // 등급 올리기의 끝 Note는 숫자가 없어 남는다
    expect(text).toContain(PICK_NOTE)
  })
})

describe('«확률이 없는 것» 문단 — 레시피로 하는 믹스로 좁혔다', () => {
  it('문단은 하나이고 두 곳 모두 «레시피로 하는 믹스»다', async () => {
    const section = sectionOf(await render(), '확률이 없는 것')
    const text = textOf(section)
    expect(count(section, '<p')).toBe(1)
    expect(section).not.toContain('<table')
    expect(text).toContain('레시피로 하는 믹스, 잠긴 아이템 배지 열기, 액티비티 배지, 체크인 배지, 미션 보상, 유저가 직접 놓은 드랍에는 확률이 없어요.')
    expect(text).toContain('레시피로 하는 믹스는 정해진 결과가 나오고, 잠긴 아이템 배지는 받을 때 이미 무엇인지 정해져 있어요.')
    expect(text).toContain('액티비티 배지와 체크인 배지는 조건을 채우면 받고, 미션 보상은 미션마다 정해져 있어요.')
    // 옛 표현이 남지 않는다: 등급 올리기 표 바로 아래에 «믹스에는 확률이 없어요»가 나오면 안 된다
    expect(text).not.toContain('믹스는 레시피에 정해진 결과가 나오고')
    expect(text).toContain('확률이 없는 것레시피로 하는 믹스, 잠긴')
  })

  it('읽기가 실패해도 남는다(스스로 뜻이 닫히는 문장)', async () => {
    const text = textOf(await render({ ...ALL_OK, capsule_policy: failed }))
    expect(text).toContain('레시피로 하는 믹스는 정해진 결과가 나오고')
  })
})
