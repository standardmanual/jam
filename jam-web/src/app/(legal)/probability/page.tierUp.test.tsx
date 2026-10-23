/**
 * /probability — 등급 올리기 섹션 (티켓 20261022_2119 4회, 운영 로직 8.4·18.3절, 채원 사전 판정 2026-10-23)
 *
 * `page.test.tsx`와 같은 방식이다: 읽기 모듈(`disclosure.ts`)은 mock하지 않고 `createServiceClient`만 가짜 클라이언트로 바꿔서
 * 설정 행 → 표 행 → 화면까지 한 줄로 시험한다. 공용 DB는 부르지 않는다. 기존 시험 파일은 어쩔 수 없이 바뀌는 숫자와 목록만 고쳤고
 * 이 섹션의 시험은 이 파일에 모았다(병렬 세션과의 충돌을 줄이려는 배치다).
 *
 * 고정하는 것:
 * - 자리와 구성: 시스템 드랍 다음, 확률이 없는 것 앞. h2 → 소개 문단 → 표 3개(h3 «Common 5개를 넣으면»…) → 등급 Note → h3 «받는 아이템 배지» 표 → 트라이브 Note.
 * - 값: 기본 설정에서 Common 70/22/6/2, Rare 73.33/20/6.67, Epic 75/25, 트라이브 20%. 설정을 바꾸면 따라 바뀌고, 서버 굴림의 `tierUpProbabilities`와 같다.
 * - 서식: 의미 있는 표(caption, th scope="row"), 값 칸은 오른쪽 정렬·tabular-nums·whitespace-nowrap, 한국어 줄바꿈 클래스, 가로 스크롤 래퍼·링크·버튼·아이콘 없음.
 * - 읽기 실패: h2 + 소개 문단 + 안내 한 개뿐이고 숫자가 하나도 없다. «처음 뽑는 등급이에요»·낮춤 문장·트라이브 문장이 표와 함께 빠진다.
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
import { DEFAULT_CAPSULE_POLICY } from '@/lib/capsule/policy'
import { TIER_UP_MATERIAL_RARITIES, tierUpProbabilities } from '@/lib/combine/tierUpOdds'
import { formatFraction } from '@/lib/probability/disclosure'
import { ALL_OK, CAPSULE_ROW, failed, fakeClient, ok, type Result } from '@/lib/probability/__tests__/fixtures'

const UNAVAILABLE = '지금 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.'
const TITLE = '등급 올리기'
const LOWERING_RULE = '그 등급에 받을 수 있는 아이템 배지가 없으면 한 등급씩 낮춰서 무작위로 골라요.'
const TRIBE_NOTE = '다른 트라이브의 것이 나올 때는 받을 수 있는 아이템 배지가 있는 다른 트라이브 가운데 무작위로 골라요.'

async function render(results: Record<string, Result> = ALL_OK): Promise<string> {
  createServiceClientMock.mockReturnValue(fakeClient(results).client)
  return renderToStaticMarkup(await ProbabilityPage())
}

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

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  createServiceClientMock.mockReset()
})

describe('정상 — 자리와 구성', () => {
  it('시스템 드랍 다음, 확률이 없는 것 앞에 있고 h1 → h2 → h3 계층이 유지된다', async () => {
    const html = await render()
    const titles = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])
    expect(titles.indexOf(TITLE)).toBe(titles.indexOf('시스템 드랍') + 1)
    expect(titles.indexOf('확률이 없는 것')).toBe(titles.indexOf(TITLE) + 1)

    const section = sectionOf(html, TITLE)
    expect(count(section, '<h3')).toBe(4)
    expect(section).not.toContain('<h1')
    expect(section).not.toContain('<h4')
  })

  it('소개 문단과 소제목 네 개가 정해진 순서로 나온다', async () => {
    const text = textOf(sectionOf(await render(), TITLE))
    const intro =
      '믹스 화면의 등급 올리기에서 같은 등급의 아이템 배지를 넣으면 새 아이템 배지를 받아요. 받는 등급은 확률로 정해지고, 같은 등급이 나올 수도 있어요. Mystic은 넣을 수 없어요.'
    const order = [intro, 'Common 5개를 넣으면', 'Rare 5개를 넣으면', 'Epic 5개를 넣으면', '받는 아이템 배지'].map((needle) => text.indexOf(needle))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('소제목은 짧아서 320px에서 한 줄에 들어간다 — «아이템 배지»를 소제목에 붙이지 않는다', async () => {
    const section = sectionOf(await render(), TITLE)
    const headings = [...section.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1])
    expect(headings).toEqual(['Common 5개를 넣으면', 'Rare 5개를 넣으면', 'Epic 5개를 넣으면', '받는 아이템 배지'])
  })

  it('넣은 등급마다 «넣은 등급 이상» 줄만 있고 낮은 등급 줄이 없다(기본 설정)', async () => {
    const text = textOf(sectionOf(await render(), TITLE))
    expect(text).toContain('Common 5개를 넣으면Common70%Rare22%Epic6%Mystic2%')
    expect(text).toContain('Rare 5개를 넣으면Rare73.33%Epic20%Mystic6.67%')
    expect(text).toContain('Epic 5개를 넣으면Epic75%Mystic25%')
    // 세 번째 표(Epic) 라벨에 Common·Rare가 없다는 것은 위 연속 문자열이 보장한다. 표마다 Mystic 재료 소제목은 없다.
    expect(text).not.toContain('Mystic 5개를 넣으면')
  })

  it('트라이브 표는 «다른 트라이브의 것일 확률 20%» 한 줄이고 아래에 트라이브 문장과 균등 문장이 이어 붙는다', async () => {
    const text = textOf(sectionOf(await render(), TITLE))
    expect(text).toContain(`받는 아이템 배지다른 트라이브의 것일 확률20%${TRIBE_NOTE} 받을 수 있는 아이템 배지가 여럿이면 모두 같은 확률로 골라요.`)
  })

  it('세 표 아래 문장: 캡슐 등급 확률에서 다시 맞춘 값이고, 처음 뽑는 등급이며, 넣은 등급보다 낮아지지 않는다', async () => {
    const text = textOf(sectionOf(await render(), TITLE))
    const note = `캡슐의 등급 확률에서 넣은 등급보다 낮은 등급을 빼고 남은 등급끼리 비율을 다시 맞춘 값이에요. 이 확률은 처음 뽑는 등급이에요. ${LOWERING_RULE} 넣은 등급보다 낮아지지는 않아요.`
    expect(text).toContain(`Epic75%Mystic25%${note}받는 아이템 배지`)
  })

  it('낮춤 문장은 동기화·캡슐·보정 장치와 같은 상수 한 곳의 말이다', async () => {
    const html = await render()
    expect(count(textOf(html), LOWERING_RULE)).toBe(4) // 동기화, 캡슐, 등급 올리기, 보정 장치
  })

  it('링크·버튼·아이콘·이미지가 없다(열기를 부추기지 않는다)', async () => {
    const section = sectionOf(await render(), TITLE)
    expect(section).not.toMatch(/<a\b|<button|<svg|<img|<canvas|role="button"|tabindex/i)
  })
})

describe('정상 — 표 마크업', () => {
  it('표 네 개마다 sr-only caption이 있고 라벨 칸은 th scope="row"다', async () => {
    const section = sectionOf(await render(), TITLE)
    expect(count(section, '<table')).toBe(4)
    const captions = [...section.matchAll(/<caption class="sr-only">([^<]*)<\/caption>/g)].map((m) => m[1])
    expect(captions).toEqual([
      'Common 아이템 배지 5개를 넣었을 때 받는 등급 확률',
      'Rare 아이템 배지 5개를 넣었을 때 받는 등급 확률',
      'Epic 아이템 배지 5개를 넣었을 때 받는 등급 확률',
      '등급 올리기에서 받는 아이템 배지의 트라이브',
    ])
    // 행: 4 + 3 + 2 + 1 = 10, 행마다 th 하나 + td 하나
    expect(count(section, '<th scope="row"')).toBe(10)
    expect(count(section, '<td ')).toBe(10)
  })

  it('값 칸은 오른쪽 정렬·tabular-nums이고 퍼센트 칸은 줄바꿈하지 않는다. 가로 스크롤 래퍼가 없다', async () => {
    const section = sectionOf(await render(), TITLE)
    const cells = cellsOf(section)
    expect(cells.map((c) => c.text)).toEqual(['70%', '22%', '6%', '2%', '73.33%', '20%', '6.67%', '75%', '25%', '20%'])
    for (const cell of cells) {
      expect(cell.cls, cell.text).toContain('text-right')
      expect(cell.cls, cell.text).toContain('tabular-nums')
      expect(cell.cls, cell.text).toContain('whitespace-nowrap')
    }
    expect(section).not.toContain('overflow-x')
    // 라벨은 왼쪽 정렬이다. 긴 라벨(«다른 트라이브의 것일 확률»)은 접히고 값이 먼저 접히지 않는다
    expect(section).toMatch(/<th scope="row" class="[^"]*text-left[^"]*">다른 트라이브의 것일 확률/)
    expect(section).not.toMatch(/<th[^>]*whitespace-nowrap/)
  })

  it('한국어를 그리는 모든 제목·문단·표 칸에 줄바꿈 클래스가 있다', async () => {
    const section = sectionOf(await render(), TITLE)
    const elements = [...section.matchAll(/<(h2|h3|p|th|td)\b([^>]*)>/g)]
    expect(elements.length).toBeGreaterThan(20)
    for (const [, tag, attrs] of elements) expect(attrs, `<${tag}>`).toContain('break-keep wrap-break-word')
  })

  it('새 섹션을 다시 카드로 감싸지 않는다 — 표 카드 네 개뿐이고 색·그래프·애니메이션이 없다', async () => {
    const section = sectionOf(await render(), TITLE)
    expect(count(section, 'rounded-2xl bg-surface')).toBe(4)
    expect(section).not.toMatch(/gradient|animate-|transition|--link|--accent|rarity|progress|text-center|font-bold|font-semibold/i)
  })

  it('유저 화면에 쓰지 않는 말과 열기를 부추기는 말이 없다', async () => {
    const text = textOf(sectionOf(await render(), TITLE))
    const banned = ['퀘스트', '랜덤', '개체', '후보', '소각', '발급', '재료', 'POI', '한 번만 더', '조금만 더', '남았어요', 'UP', '꽝', '당첨', '대박', '운이 좋']
    for (const word of banned) expect(text, word).not.toContain(word)
    expect(text).not.toMatch(/→|↑|⬆|▲/)
  })
})

describe('값은 읽은 설정에서 만든다', () => {
  const changed = {
    ...ALL_OK,
    capsule_policy: ok({ ...CAPSULE_ROW, rarity_common: 60, rarity_rare: 25, rarity_epic: 10, rarity_mystic: 5, other_tribe_probability: 0.35 }),
  }

  it('캡슐 등급을 60/25/10/5로, 다른 트라이브를 0.35로 바꾸면 표가 따라 바뀐다(Rare 5개는 62.5 / 25 / 12.5)', async () => {
    const section = sectionOf(await render(changed), TITLE)
    const text = textOf(section)
    expect(text).toContain('Common 5개를 넣으면Common60%Rare25%Epic10%Mystic5%')
    expect(text).toContain('Rare 5개를 넣으면Rare62.5%Epic25%Mystic12.5%')
    expect(text).toContain('Epic 5개를 넣으면Epic66.67%Mystic33.33%')
    expect(text).toContain('다른 트라이브의 것일 확률35%')
    // 바뀌기 전 값은 남지 않는다
    expect(cellsOf(section).map((c) => c.text)).not.toContain('73.33%')
    expect(cellsOf(section).map((c) => c.text)).not.toContain('70%')
  })

  it('표의 값이 서버 굴림의 tierUpProbabilities 출력과 같다(페이지와 실제 결과의 함수가 하나다)', async () => {
    const policy = { rarity_common: 60, rarity_rare: 25, rarity_epic: 10, rarity_mystic: 5 }
    const cells = cellsOf(sectionOf(await render(changed), TITLE)).map((c) => c.text)
    const expected = TIER_UP_MATERIAL_RARITIES.flatMap((material) => tierUpProbabilities(material, policy).map(([, p]) => formatFraction(p)))
    expect(cells.slice(0, expected.length)).toEqual(expected)
    // 마지막 칸은 트라이브 표다
    expect(cells).toHaveLength(expected.length + 1)
  })

  it('확률 0인 줄도 지우지 않는다(Epic·Mystic이 0이면 Rare 5개는 Rare 100%, Epic 0%, Mystic 0%이고, Epic 5개는 자기 등급 100% 한 줄이다)', async () => {
    const results = { ...ALL_OK, capsule_policy: ok({ ...CAPSULE_ROW, rarity_common: 80, rarity_rare: 20, rarity_epic: 0, rarity_mystic: 0 }) }
    const text = textOf(sectionOf(await render(results), TITLE))
    expect(text).toContain('Rare 5개를 넣으면Rare100%Epic0%Mystic0%')
    // 넣은 등급 이상의 설정 확률이 모두 0이면 서버 굴림이 돌려주는 «자기 등급 100%» 한 줄을 가공 없이 보인다
    expect(text).toContain('Epic 5개를 넣으면Epic100%캡슐의 등급 확률에서')
  })
})

describe('읽기 실패 — 소개 문단과 안내 한 개뿐이고 숫자가 없다', () => {
  const numbers = /\d/

  it.each([
    ['capsule_policy', { ...ALL_OK, capsule_policy: failed }],
    ['jam_policy', { ...ALL_OK, jam_policy: failed }],
    ['capsule_policy 예외', { ...ALL_OK, capsule_policy: 'throw' as const }],
  ])('%s를 못 읽으면 h2 + 소개 + 안내 한 개만 남는다', async (_name, results) => {
    const html = await render(results)
    const section = sectionOf(html, TITLE)
    const text = textOf(section)
    expect(count(section, 'role="status"')).toBe(1)
    expect(text).toContain(UNAVAILABLE)
    expect(text).toContain('믹스 화면의 등급 올리기에서 같은 등급의 아이템 배지를 넣으면')
    expect(count(section, '<p')).toBe(2) // 소개 문단 + 안내 문장
    expect(section).not.toContain('<table')
    expect(section).not.toContain('<h3')
    expect(text).not.toMatch(numbers)
    expect(text).not.toContain('%')
    // 표와 함께 빠지는 문장
    expect(text).not.toContain('처음 뽑는 등급')
    expect(text).not.toContain('한 등급씩 낮춰서')
    expect(text).not.toContain('넣은 등급보다 낮아지지는 않아요')
    expect(text).not.toContain('다른 트라이브')
    // 정책 실패 때 안내 개수는 동기화·캡슐·등급 올리기·보정 장치 네 개다
    expect(count(html, 'role="status"')).toBe(4)
  })

  it('코드 상수 사본(DEFAULT_CAPSULE_POLICY 70/22/6/2)이 이 섹션에 새지 않는다', async () => {
    const text = textOf(sectionOf(await render({ ...ALL_OK, capsule_policy: failed }), TITLE))
    for (const leak of [DEFAULT_CAPSULE_POLICY.rarity_common, DEFAULT_CAPSULE_POLICY.rarity_rare, DEFAULT_CAPSULE_POLICY.rarity_epic, DEFAULT_CAPSULE_POLICY.rarity_mystic]) {
      expect(text, `${leak}`).not.toContain(`${leak}`)
    }
    // 서버 굴림이 읽기 실패 때 쓰는 기본값으로 대신 그리지 않는다
    expect(text).not.toContain(formatFraction(DEFAULT_CAPSULE_POLICY.other_tribe_probability))
  })

  it('셋 다 못 읽어도 %·÷·날짜 외 숫자가 없고 안내는 다섯 개다', async () => {
    const html = await render({ capsule_policy: failed, jam_policy: 'throw', ambient_drop_config: { data: null, error: null } })
    const text = textOf(html).replace('2026년 10월 21일', '')
    expect(count(html, 'role="status"')).toBe(5)
    expect(text).not.toContain('%')
    expect(text).not.toContain('÷')
    expect(text).not.toMatch(numbers)
  })

  it('시스템 드랍만 못 읽으면 등급 올리기는 그대로다', async () => {
    const html = await render({ ...ALL_OK, ambient_drop_config: failed })
    const section = sectionOf(html, TITLE)
    expect(count(html, 'role="status"')).toBe(1)
    expect(count(section, '<table')).toBe(4)
    expect(textOf(section)).toContain('Rare73.33%Epic20%Mystic6.67%')
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
