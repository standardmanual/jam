/**
 * /probability — 확률 안내 페이지 (티켓 20261021_1250 1회, 운영 로직 18.3·18.4절, 채원 사전 판정 2026-10-21)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다. 읽기 모듈(`lib/probability/disclosure.ts`)은 mock하지 않고
 * `createServiceClient`만 가짜 클라이언트로 바꿔서, 설정 행 → 표 행 → 화면까지 한 줄로 시험한다. 공용 DB는 부르지 않는다.
 *
 * 고정하는 것:
 * - 구성: 머리(유료 결제 없음 한 줄), 동기화·캡슐·시스템 드랍 표, 확률이 없는 것 한 문단, 보정 장치 목록(접지 않음), 바뀐 날짜 표.
 * - 바뀐 날짜 표(티켓 20261022_1700): 변경 이력(`balance_setting_changes`)에서 읽은 줄이 위, «처음 열었어요» 상수 줄이 항상 맨 아래다. 이력을 읽지 못해도
 *   페이지는 열리고 첫 줄만 보이며 표 아래에 읽기 실패 안내가 한 줄 붙는다. 유저 ID·변경 메모·내부 칸 이름·방향어는 HTML에 없다.
 * - 값은 읽은 행에서 만든다: 설정을 바꾸면 표가 따라 바뀐다.
 * - 읽기 실패: 해당 섹션만 «지금 불러오지 못했어요»로 바뀌고 숫자가 하나도 없다. 코드 상수 사본(DEFAULT_*)의 값이 새지 않는다. 시스템 드랍만 실패하면 정책 섹션은 그대로다.
 *   정책 표(동기화·캡슐·보정 장치)와 등급 올리기(`combine_policy`)는 따로 실패한다 — 등급 올리기 섹션의 시험은 `page.tierUp.test.tsx`에 있다.
 * - 의미 있는 표(caption, th scope="row"), 한국어 줄바꿈 클래스, 색 강조·그래프·애니메이션 없음, 유저 화면에 쓰지 않는 말·열기를 부추기는 말 없음.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(legal)/probability/page.test.tsx"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/probability',
  useSearchParams: () => new URLSearchParams(),
}))

// 로그인 확인(`createClient`)을 부르면 던지게 둔다 — 이 페이지는 service 클라이언트로 설정 표만 읽는다
const { createServiceClientMock } = vi.hoisted(() => ({ createServiceClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
  createClient: () => {
    throw new Error('확률 안내는 로그인 확인을 하지 않는다')
  },
}))

import ProbabilityPage, { dynamic } from './page'
import { DEFAULT_AMBIENT_DROP_CONFIG } from '@/lib/ambient-drop/config'
import { DEFAULT_CAPSULE_POLICY } from '@/lib/capsule/policy'
import { DEFAULT_COMBINE_POLICY } from '@/lib/combine/policy'
import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import {
  ALL_OK,
  AMBIENT_ROW,
  CAPSULE_ROW,
  CHANGES_TABLE,
  COMBINE_ROW,
  JAM_ROW,
  fakeClient,
  failed,
  ok,
  type Result,
} from '@/lib/probability/__tests__/fixtures'

const UNAVAILABLE = '지금 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.'

async function render(results: Record<string, Result> = ALL_OK): Promise<string> {
  createServiceClientMock.mockReturnValue(fakeClient(results).client)
  return renderToStaticMarkup(await ProbabilityPage())
}

const textOf = (html: string) => html.replace(/<[^>]*>/g, '')
/** 본문(article)만 — 위의 상단 바는 DS TopNav가 그리는 것이라 서식 규칙의 대상이 아니다 */
const articleOf = (html: string) => html.slice(html.indexOf('<article'))
const count = (html: string, needle: string) => html.split(needle).length - 1
/** 제목(h2) 하나가 시작하는 곳부터 다음 h2 앞까지 */
function sectionOf(html: string, title: string): string {
  const start = html.indexOf(`>${title}</h2>`)
  expect(start, `«${title}» 섹션을 찾지 못했다`).toBeGreaterThan(-1)
  const next = html.indexOf('<h2', start)
  return html.slice(start, next === -1 ? undefined : next)
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  createServiceClientMock.mockReset()
})

describe('렌더 방식', () => {
  it('요청마다 설정 표를 다시 읽는다(force-dynamic)', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('로그인 확인 없이 service 클라이언트로만 읽고, 상단 바는 뒤로 가기와 제목뿐이다', async () => {
    const html = await render()
    // 설정 표 읽기와 변경 이력 읽기가 각자 service 클라이언트를 만든다(로그인 확인은 없다)
    expect(createServiceClientMock).toHaveBeenCalledTimes(2)
    // LegalTopNav: 뒤로 가기 버튼 하나뿐(동기화·알림·아바타 없음)
    expect(count(html, '<button')).toBe(1)
    expect(html).not.toContain('<img')
    expect(html).toContain('<h1')
  })
})

describe('정상 — 구성과 값', () => {
  it('머리: 제목, 안내 문장, 유료 결제 없음 한 줄', async () => {
    const text = textOf(await render())
    expect(text).toContain('확률 안내')
    expect(text).toContain('JAM!에서 확률로 정해지는 것과 그 확률을 모두 적었어요.')
    expect(text).toContain('JAM!에는 유료 결제가 없어요. 잼과 포인트는 돈으로 팔지 않아요.')
  })

  it('섹션이 동기화 → 캡슐 → 시스템 드랍 → 등급 올리기 → 확률이 없는 것 → 보정 장치 → 바뀐 날짜 순이다', async () => {
    const html = await render()
    const titles = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])
    expect(titles).toEqual(['동기화로 받는 아이템 배지', '캡슐', '시스템 드랍', '등급 올리기', '확률이 없는 것', '보정 장치', '바뀐 날짜'])
  })

  it('동기화: 개수와 잠김 표, 등급 표(서열 순 영문), 처음 뽑는 등급 문장이 등급 표 바로 아래에 있다', async () => {
    const section = sectionOf(await render(), '동기화로 받는 아이템 배지')
    const text = textOf(section)
    expect(text).toContain('개수와 잠김')
    expect(text).toContain('확정으로 받는 개수1개, 등산은 2개')
    expect(text).toContain('보너스 기회2번')
    expect(text).toContain('보너스 한 번의 확률활동의 잼 ÷ 600, 최대 25%')
    expect(text).toContain('잠긴 채 받을 확률25%')
    expect(text).toMatch(/Common84%Rare13%Epic2\.5%Mystic0\.5%/)
    const lowering = '이 확률은 처음 뽑는 등급이에요. 그 등급에 받을 수 있는 아이템 배지가 없으면 한 등급씩 낮춰서 무작위로 골라요.'
    expect(text).toContain(lowering)
    expect(text.indexOf('Mystic0.5%')).toBeLessThan(text.indexOf(lowering))
    expect(text.indexOf(lowering) - (text.indexOf('Mystic0.5%') + 'Mystic0.5%'.length)).toBe(0)
  })

  it('캡슐: 개수·소속·잠김 표 아래에 트라이브 문장, 등급 표 아래에 처음 뽑는 등급 문장', async () => {
    const section = sectionOf(await render(), '캡슐')
    const text = textOf(section)
    expect(text).toContain('개수, 소속, 잠김')
    expect(text).toContain('확정으로 나오는 개수1개')
    expect(text).toContain('1개 더 나올 확률20%')
    expect(text).toContain('다른 트라이브의 것일 확률아이템 배지마다 20%')
    expect(text).toContain('잠긴 채 나올 확률25%')
    expect(text).toContain('JAM! 시작하기에서 여는 첫 캡슐잠긴 아이템 배지 1개가 반드시 나와요')
    const tribe = '다른 트라이브의 것이 나올 때는 받을 수 있는 아이템 배지가 있는 다른 트라이브 가운데 무작위로 골라요.'
    expect(text).toContain(`나와요${tribe}`)
    expect(text).toMatch(/Common70%Rare22%Epic6%Mystic2%이 확률은 처음 뽑는 등급이에요/)
  })

  it('시스템 드랍 explicit: 등급 표에 0%인 줄도 있고, 낮추는 규칙은 Common부터 찾는 방식으로 쓴다', async () => {
    const section = sectionOf(await render(), '시스템 드랍')
    const text = textOf(section)
    expect(text).toContain('JAM!이 장소에 놓는 아이템 배지의 등급 확률이에요.')
    expect(text).toMatch(/Common100%Rare0%Epic0%Mystic0%/)
    expect(text).toContain('Common부터 Rare, Epic, Mystic 순서로 찾아서 아이템 배지가 있는 첫 등급에서 무작위로 골라요.')
    // 동기화·캡슐의 «한 등급씩 낮춰서» 문장을 그대로 붙이지 않는다
    expect(text).not.toContain('한 등급씩 낮춰서')
  })

  it('시스템 드랍 random: 표 없이 설명 문장이 나온다', async () => {
    const html = await render({ ...ALL_OK, ambient_drop_config: ok({ rarity_mode: 'random' }) })
    const section = sectionOf(html, '시스템 드랍')
    expect(section).not.toContain('<table')
    expect(textOf(section)).toContain('지금은 놓을 때마다 등급 비율을 무작위로 정해요. 그래서 고정된 확률 표가 없어요.')
    expect(textOf(section)).not.toContain('%')
    // category_mode·all_random·auto_enabled 같은 설정은 나오지 않는다
    expect(html).not.toMatch(/all_random|category_mode|auto_enabled/)
  })

  it('확률이 없는 것은 한 문단이다', async () => {
    const section = sectionOf(await render(), '확률이 없는 것')
    expect(count(section, '<p')).toBe(1)
    expect(section).not.toContain('<table')
    expect(textOf(section)).toContain(
      '레시피로 하는 믹스, 잠긴 아이템 배지 열기, 액티비티 배지, 체크인 배지, 미션 보상, 유저가 직접 놓은 드랍에는 확률이 없어요.'
    )
  })

  it('보정 장치 두 가지가 접힌 곳 없이 목록으로 보인다', async () => {
    const section = sectionOf(await render(), '보정 장치')
    expect(count(section, '<li')).toBe(2)
    expect(section).toContain('list-disc')
    expect(section).not.toMatch(/<details|aria-expanded|hidden/)
    const text = textOf(section)
    expect(text).toContain('내가 캡슐을 15번 여는 동안 Epic 이상이 나오지 않으면, 그다음 캡슐의 첫 아이템 배지는 Epic 이상으로 나와요.')
    expect(text).toContain('Common 아이템 배지가 10번 이어서 나오면, 그다음 아이템 배지는 Rare 이상으로 나와요.')
    expect(text).toContain('동기화와 캡슐에서 나온 것을 합쳐서 세어요.')
    // 보정으로 정해진 등급도 후보가 없으면 낮춰 뽑는다 — 목록 아래에 같은 규칙을 적는다(목록 항목은 그대로 둘)
    expect(text).toContain('그 등급에 받을 수 있는 아이템 배지가 없으면 한 등급씩 낮춰서 무작위로 골라요.')
    expect(text).not.toContain('처음 뽑는 등급')
  })

  it('이력이 없으면 바뀐 날짜 표에 «처음 열었어요» 한 줄만 있고 안내 문구는 없다(임시값: 출시 전에 사용자가 확정)', async () => {
    const section = sectionOf(await render(), '바뀐 날짜')
    const text = textOf(section)
    expect(text).toContain('확률 안내에 적힌 값을 바꾸면 바뀐 날짜와 내용을 여기에 적어요.')
    expect(text).toContain('2026년 10월 21일확률 안내를 처음 열었어요')
    // 날짜가 띄어쓰기에서 «10월 / 21일»로 갈라지지 않게 라벨 칸의 줄바꿈을 막는다
    expect(section).toMatch(/<th[^>]*whitespace-nowrap[^>]*>2026년 10월 21일/)
    expect(count(section, '<tr')).toBe(1)
    expect(section).not.toContain('role="status"')
  })
})

describe('바뀐 날짜 — 변경 이력에서 읽는다', () => {
  const historyRow = (createdAt: string, section: string, changes: unknown, extra: Record<string, unknown> = {}) => ({
    section_key: section,
    changes,
    created_at: createdAt,
    affects_disclosure: true,
    ...extra,
  })
  const change = (field: string, from: number, to: number) => ({ field, from, to })

  // 채원 판정의 배치도: 이력 두 줄 + 맨 아래 상수 줄
  const HISTORY = [
    historyRow('2026-10-22T05:00:00Z', 'capsule', [change('pity_epic_threshold', 15, 12)], {
      note: '내부 메모: 공지는 슬랙에 올림',
      changed_by: '0b8a3f2e-aaaa-bbbb-cccc-111122223333',
    }),
    historyRow('2026-10-23T05:00:00Z', 'sync', [change('sync_rarity_common', 84, 83), change('sync_rarity_rare', 12, 13)], {
      changed_by: '0b8a3f2e-aaaa-bbbb-cccc-111122223333',
    }),
    historyRow('2026-10-22T06:00:00Z', 'sync', [change('sync_rarity_common', 90, 80)], { affects_disclosure: false }),
  ]

  it('최신이 맨 위, «처음 열었어요»가 항상 맨 아래이고 칸이 여럿이어도 저장 한 번은 한 줄이다', async () => {
    const html = await render({ ...ALL_OK, [CHANGES_TABLE]: ok(HISTORY) })
    const section = sectionOf(html, '바뀐 날짜')
    const text = textOf(section)
    expect(text).toContain(
      '2026년 10월 23일동기화 Common 확률을 84%에서 83%로, 동기화 Rare 확률을 12%에서 13%로 바꿨어요' +
        '2026년 10월 22일캡슐 Epic 보정 횟수를 15번에서 12번으로 바꿨어요' +
        '2026년 10월 21일확률 안내를 처음 열었어요'
    )
    expect(count(section, '<tr')).toBe(3)
    // 읽기에 성공했으므로 실패 안내가 없다
    expect(section).not.toContain('role="status"')
  })

  it('날짜 칸은 줄바꿈이 없고, 문장 칸은 줄바꿈을 허용한다(표 모양은 그대로)', async () => {
    const section = sectionOf(await render({ ...ALL_OK, [CHANGES_TABLE]: ok(HISTORY) }), '바뀐 날짜')
    const heads = [...section.matchAll(/<th[^>]*>([^<]*)<\/th>/g)]
    expect(heads.map((m) => m[1])).toEqual(['2026년 10월 23일', '2026년 10월 22일', '2026년 10월 21일'])
    for (const head of section.match(/<th[^>]*>/g) ?? []) expect(head).toContain('whitespace-nowrap')
    for (const cell of section.match(/<td[^>]*>/g) ?? []) {
      expect(cell).not.toContain('whitespace-nowrap')
      expect(cell).toContain('break-keep wrap-break-word')
    }
  })

  it('확률 안내에 반영되지 않는 변경(affects_disclosure = false)은 나오지 않는다', async () => {
    const html = await render({ ...ALL_OK, [CHANGES_TABLE]: ok(HISTORY) })
    expect(textOf(html)).not.toContain('90%에서 80%')
    expect(textOf(sectionOf(html, '바뀐 날짜'))).not.toContain('동기화 Common 확률을 90%')
  })

  it('같은 날 저장이 여러 번이면 날짜가 반복된다', async () => {
    const html = await render({
      ...ALL_OK,
      [CHANGES_TABLE]: ok([
        historyRow('2026-10-23T05:00:00Z', 'capsule', [change('rarity_common', 70, 69)]),
        historyRow('2026-10-23T01:00:00Z', 'capsule', [change('rarity_common', 71, 70)]),
      ]),
    })
    const text = textOf(sectionOf(html, '바뀐 날짜'))
    expect(text).toContain('2026년 10월 23일캡슐 Common 확률을 70%에서 69%로 바꿨어요2026년 10월 23일캡슐 Common 확률을 71%에서 70%로 바꿨어요')
  })

  it('값 0을 지우지 않고, 표에 없는 칸은 내부 이름 없이 일반 문장이다', async () => {
    const html = await render({
      ...ALL_OK,
      [CHANGES_TABLE]: ok([
        historyRow('2026-10-23T05:00:00Z', 'capsule', [change('pre_quest_fill_amount', 3, 4)]),
        historyRow('2026-10-22T05:00:00Z', 'capsule', [change('bonus_probability', 0.2, 0), change('chapter:3', 100, 120)]),
      ]),
    })
    const section = sectionOf(html, '바뀐 날짜')
    const text = textOf(section)
    expect(text).toContain('2026년 10월 23일확률 안내의 값을 바꿨어요')
    expect(text).toContain('캡슐 보너스 확률을 20%에서 0%로, 그 밖의 값도 바꿨어요')
    expect(section).not.toMatch(/pre_quest|chapter|bonus_probability/)
  })

  it('유저 ID, 변경 메모, 내부 칸 이름, 방향어가 HTML 어디에도 없다', async () => {
    const html = await render({ ...ALL_OK, [CHANGES_TABLE]: ok(HISTORY) })
    expect(html).not.toContain('0b8a3f2e')
    expect(html).not.toContain('내부 메모')
    expect(html).not.toMatch(/changed_by|section_key|affects_disclosure|balance_setting_changes/)
    expect(html).not.toMatch(/sync_rarity|pity_epic_threshold|rarity_common|common_streak_threshold/)
    const text = textOf(sectionOf(html, '바뀐 날짜'))
    expect(text).not.toMatch(/올렸|낮췄|높였|높아|낮아|늘렸|줄였|UP|→|—|NEW/)
  })

  it('이력 줄에도 색·아이콘·강조가 없다(최신 줄도 다른 줄과 같은 모양이다)', async () => {
    const section = sectionOf(await render({ ...ALL_OK, [CHANGES_TABLE]: ok(HISTORY) }), '바뀐 날짜')
    expect(section).not.toMatch(/<svg|<img|<mark|<strong|<b>|animate-|transition|--link|--accent/)
    const rowClasses = new Set([...section.matchAll(/<tr class="([^"]*)"/g)].map((m) => m[1]))
    expect(rowClasses.size).toBe(1)
  })
})

describe('표 마크업 — 의미 있는 표, 가로 스크롤 없음', () => {
  it('표 아홉 개마다 sr-only caption이 있고 라벨 칸은 th scope="row"다', async () => {
    const html = await render()
    // 동기화 2 + 캡슐 2 + 시스템 드랍 1 + 등급 올리기 3 + 바뀐 날짜 1
    expect(count(html, '<table')).toBe(9)
    expect(count(html, '<caption class="sr-only">')).toBe(9)
    // 행마다 th 하나 + td 하나
    expect(count(html, '<th scope="row"')).toBe(count(html, '<td '))
    expect(count(html, '<th scope="row"')).toBeGreaterThanOrEqual(9)
  })

  it('표 카드는 흰 면 + 테두리 둥근 카드이고, 값 칸은 오른쪽 정렬 tabular-nums다. 가로 스크롤 래퍼가 없다', async () => {
    const html = await render()
    expect(html).toContain('rounded-2xl bg-surface border border-border px-4')
    expect(html).toContain('border-b border-border last:border-b-0')
    expect(html).toMatch(/<td class="[^"]*text-right[^"]*font-medium[^"]*tabular-nums/)
    expect(html).not.toContain('overflow-x')
  })

  it('짧은 값 칸(등급 %)에만 whitespace-nowrap을 쓴다. 문장 값은 줄바꿈을 허용한다', async () => {
    const html = await render()
    const cells = [...html.matchAll(/<td class="([^"]*)">([^<]*)<\/td>/g)].map((m) => ({ cls: m[1], text: m[2] }))
    const rarityCells = cells.filter((c) => /^(84|13|2\.5|0\.5|70|22|6|2|100|0)%$/.test(c.text))
    expect(rarityCells.length).toBeGreaterThanOrEqual(12)
    for (const cell of rarityCells) expect(cell.cls, cell.text).toContain('whitespace-nowrap')
    const sentence = cells.find((c) => c.text.includes('활동의 잼 ÷ 600'))
    expect(sentence?.cls).not.toContain('whitespace-nowrap')
    const firstCapsule = cells.find((c) => c.text.includes('잠긴 아이템 배지 1개가 반드시 나와요'))
    expect(firstCapsule?.cls).not.toContain('whitespace-nowrap')
  })
})

describe('값은 읽은 설정에서 만든다', () => {
  it('설정을 바꾼 행으로 렌더하면 표와 문장이 따라 바뀐다', async () => {
    const html = await render({
      capsule_policy: ok({
        ...CAPSULE_ROW,
        bonus_count: 2,
        bonus_probability: 0.35,
        rarity_common: 50,
        rarity_rare: 30,
        rarity_epic: 15,
        rarity_mystic: 5,
        pity_epic_threshold: 20,
      }),
      jam_policy: ok({
        ...JAM_ROW,
        sync_item_guaranteed: 3,
        sync_item_guaranteed_hiking: 3,
        sync_rarity_common: 60,
        sync_rarity_rare: 25,
        sync_rarity_epic: 10,
        sync_rarity_mystic: 5,
        common_streak_threshold: 7,
      }),
      ambient_drop_config: ok({ rarity_mode: 'explicit', rarity_common: 0.6, rarity_rare: 0.3, rarity_epic: 0.07, rarity_mystic: 0.03 }),
    })
    const text = textOf(html)
    expect(text).toContain('확정으로 받는 개수3개')
    expect(text).toMatch(/Common60%Rare25%Epic10%Mystic5%/)
    expect(text).toContain('2개 더 나올 확률35%')
    expect(text).toMatch(/Common50%Rare30%Epic15%Mystic5%/)
    expect(text).toMatch(/Common60%Rare30%Epic7%Mystic3%/)
    expect(text).toContain('내가 캡슐을 20번 여는 동안')
    expect(text).toContain('Common 아이템 배지가 7번 이어서')
    // 바뀌기 전 값은 남지 않는다
    expect(text).not.toContain('84%')
    expect(text).not.toContain('1개 더 나올 확률')
    expect(text).not.toContain('15번 여는 동안')
  })
})

describe('읽기 실패 — 해당 섹션만 안내로 바뀌고 숫자가 없다', () => {
  const sectionNumbers = /\d/

  it('정책을 못 읽으면 동기화·캡슐·보정 장치가 안내로 바뀌고 숫자가 하나도 없다', async () => {
    const html = await render({ ...ALL_OK, capsule_policy: failed })
    // 등급 올리기는 combine_policy만 읽으므로 안내가 아니다 — 동기화·캡슐·보정 장치 세 곳이다
    expect(count(html, 'role="status"')).toBe(3)
    for (const title of ['동기화로 받는 아이템 배지', '캡슐', '보정 장치']) {
      const section = sectionOf(html, title)
      expect(textOf(section), title).toContain(UNAVAILABLE)
      expect(textOf(section), title).not.toMatch(sectionNumbers)
      expect(section, title).not.toContain('<table')
      // 가리킬 등급 표가 없으니 «이 확률은 처음 뽑는 등급이에요»도 남기지 않는다
      expect(textOf(section), title).not.toContain('처음 뽑는 등급')
    }
    // 시스템 드랍 표, 등급 올리기 표 셋, 바뀐 날짜 표는 그대로다
    expect(count(html, '<table')).toBe(5)
    expect(textOf(sectionOf(html, '시스템 드랍'))).toMatch(/Common100%/)
    expect(textOf(sectionOf(html, '등급 올리기'))).toContain('Rare30%Epic70%')
  })

  it('jam_policy만 못 읽어도 세 섹션이 함께 안내로 바뀐다(두 표가 한 묶음이다)', async () => {
    const html = await render({ ...ALL_OK, jam_policy: failed })
    expect(count(html, 'role="status"')).toBe(3)
    expect(textOf(sectionOf(html, '캡슐'))).not.toMatch(sectionNumbers)
  })

  it('스스로 뜻이 닫히는 문장은 읽기가 실패해도 남는다(시스템 드랍 낮춤 규칙, 트라이브 문장, 확률이 없는 것, 변경 이력 머리 문장)', async () => {
    const text = textOf(await render({ ...ALL_OK, capsule_policy: 'throw', ambient_drop_config: failed }))
    // 동기화·캡슐·보정 장치의 낮춤 문장은 표 없이 남기지 않는다(시스템 드랍 쪽만 남는다)
    expect(text).not.toContain('한 등급씩 낮춰서 무작위로 골라요.')
    expect(text).not.toContain('처음 뽑는 등급')
    expect(text).toContain('받을 수 있는 아이템 배지가 있는 다른 트라이브 가운데 무작위로 골라요.')
    expect(text).toContain('Common부터 Rare, Epic, Mystic 순서로 찾아서')
    expect(text).toContain('에는 확률이 없어요.')
    expect(text).toContain('확률 안내에 적힌 값을 바꾸면 바뀐 날짜와 내용을 여기에 적어요.')
  })

  it('시스템 드랍만 못 읽으면 그 섹션만 안내로 바뀌고 다른 섹션은 그대로다', async () => {
    const html = await render({ ...ALL_OK, ambient_drop_config: failed })
    expect(count(html, 'role="status"')).toBe(1)
    const ambient = sectionOf(html, '시스템 드랍')
    expect(textOf(ambient)).toContain(UNAVAILABLE)
    expect(ambient).not.toContain('<table')
    expect(textOf(ambient)).not.toMatch(/\d/)
    expect(textOf(sectionOf(html, '동기화로 받는 아이템 배지'))).toMatch(/Common84%/)
    expect(textOf(sectionOf(html, '캡슐'))).toMatch(/Common70%/)
    expect(count(sectionOf(html, '보정 장치'), '<li')).toBe(2)
  })

  it('변경 이력만 못 읽으면 페이지는 열리고 «처음 열었어요» 줄만 보이며, 표 아래에 안내가 한 줄 붙는다', async () => {
    for (const failure of [failed, 'throw' as const, ok({ not: 'a list' })]) {
      const html = await render({ ...ALL_OK, [CHANGES_TABLE]: failure })
      const section = sectionOf(html, '바뀐 날짜')
      expect(count(html, 'role="status"')).toBe(1)
      expect(count(section, '<tr')).toBe(1)
      expect(textOf(section)).toContain('2026년 10월 21일확률 안내를 처음 열었어요')
      // 안내는 표 아래에 있고, 머리 문장은 그대로다
      expect(section.indexOf('<div role="status"')).toBeGreaterThan(section.indexOf('</table>'))
      expect(textOf(section.slice(section.indexOf('<div role="status"')))).toBe(UNAVAILABLE)
      expect(textOf(section)).toContain('확률 안내에 적힌 값을 바꾸면 바뀐 날짜와 내용을 여기에 적어요.')
      // 다른 섹션은 그대로다
      expect(textOf(sectionOf(html, '동기화로 받는 아이템 배지'))).toMatch(/Common84%/)
      expect(textOf(sectionOf(html, '캡슐'))).toMatch(/Common70%/)
      expect(count(sectionOf(html, '보정 장치'), '<li')).toBe(2)
    }
  })

  it('정책과 변경 이력이 함께 실패해도 각자 안내를 보인다(이력 쪽은 표 아래에 한 줄)', async () => {
    const html = await render({ ...ALL_OK, capsule_policy: failed, [CHANGES_TABLE]: failed })
    // 정책 쪽 3곳(동기화·캡슐·보정 장치)에 변경 이력 1곳을 더한 4곳이다
    expect(count(html, 'role="status"')).toBe(4)
    expect(count(sectionOf(html, '바뀐 날짜'), 'role="status"')).toBe(1)
    expect(textOf(sectionOf(html, '바뀐 날짜'))).toContain('2026년 10월 21일확률 안내를 처음 열었어요')
  })

  it('설정 표를 모두 못 읽으면 값 칸이 하나도 없다(퍼센트·나눗셈 기호 없음, 날짜 외 숫자 없음)', async () => {
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
    expect(text).not.toMatch(/\d/)
  })

  it('읽기가 실패해도 코드 상수 사본(DEFAULT_*)의 값이 새지 않는다', async () => {
    const html = await render({ capsule_policy: failed, jam_policy: failed, combine_policy: failed, ambient_drop_config: failed })
    const text = textOf(html)
    const leaks = [
      `${DEFAULT_JAM_POLICY.sync_rarity_common}%`,
      `${DEFAULT_JAM_POLICY.sync_rarity_rare}%`,
      `${DEFAULT_CAPSULE_POLICY.rarity_common}%`,
      `${DEFAULT_CAPSULE_POLICY.rarity_rare}%`,
      `${DEFAULT_CAPSULE_POLICY.pity_epic_threshold}번`,
      `${DEFAULT_JAM_POLICY.common_streak_threshold}번`,
      `÷ ${DEFAULT_JAM_POLICY.sync_item_bonus_jam_divisor}`,
      `${DEFAULT_AMBIENT_DROP_CONFIG.rarity_common * 100}%`,
      `${Math.round(DEFAULT_COMBINE_POLICY.tier_up_probability * 100)}%`,
      `${Math.round((1 - DEFAULT_COMBINE_POLICY.tier_up_probability) * 100)}%`,
    ]
    for (const leak of leaks) expect(text, leak).not.toContain(leak)
    // 이 시험의 전제 — 정상 값(= 기본값과 같다)은 화면에 실제로 나온다
    const normal = textOf(await render({ capsule_policy: ok(CAPSULE_ROW), jam_policy: ok(JAM_ROW), combine_policy: ok(COMBINE_ROW), ambient_drop_config: ok(AMBIENT_ROW) }))
    expect(normal).toContain('84%')
  })
})

describe('문구와 서식 규칙', () => {
  it('유저 화면에 쓰지 않는 말과 열기를 부추기는 말이 없다', async () => {
    const text = textOf(await render())
    const banned = ['퀘스트', '랜덤', '개체', '후보', '발급', '섀도우밴', 'POI', '보정 1', '보정 2', '한 번만 더', '조금만 더', '남았어요', 'UP', '꽝', '당첨', '대박']
    for (const word of banned) expect(text, word).not.toContain(word)
    // 내부 이름 «JAM 2.0»을 유저 문구에 쓰지 않는다
    expect(text).not.toContain('JAM 2.0')
  })

  it('한국어를 그리는 제목·문단·표 칸에 줄바꿈 클래스가 있다', async () => {
    const html = articleOf(await render())
    const elements = [...html.matchAll(/<(h1|h2|h3|p|li|th|td)\b([^>]*)>/g)]
    expect(elements.length).toBeGreaterThan(30)
    for (const [tag, , attrs] of elements) {
      expect(attrs, `<${tag}>`).toContain('break-keep wrap-break-word')
    }
  })

  it('등급 줄에 색·그라데이션·그래프·애니메이션·초록 강조가 없다', async () => {
    const html = articleOf(await render())
    expect(html).not.toMatch(/gradient|animate-|transition|--link|--accent|rarity|<svg|<img|progress|<canvas/i)
    // 크림 단색 바탕 위의 표 카드와 Note만 쓴다 — 카드 안 카드가 없다
    expect(count(html, 'rounded-2xl bg-surface')).toBe(9)
  })

  it('제목 계층이 h1 → h2 → h3다', async () => {
    const html = articleOf(await render())
    expect(count(html, '<h1')).toBe(1)
    const order = [...html.matchAll(/<h([123])\b/g)].map((m) => Number(m[1]))
    expect(order[0]).toBe(1)
    // h3는 반드시 h2 뒤에 온다
    expect(order.indexOf(3)).toBeGreaterThan(order.indexOf(2))
  })
})
