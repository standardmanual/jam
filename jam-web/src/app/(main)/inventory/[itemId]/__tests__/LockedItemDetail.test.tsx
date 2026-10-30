/**
 * 잠긴 아이템 배지 상세 — 포인트로 여는 화면의 마크업 (티켓 20261018_0054 2회, 20261028_1741 1회, 운영 로직 7.2·7.3절)
 *
 * 저장소에 jsdom·testing-library가 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 화면을 고정한다.
 * 클릭으로 일어나는 전환(열기·거절)의 결정은 `lockedItemFill-flow.test.ts`가, 요청 모양은 `lockedItemFill-client.test.ts`가 맡는다.
 * 열린 뒤 화면과 서버 거절 뒤 화면은 클릭 없이는 만들 수 없어서, `useState`의 시작값을 시험이 정해 주는 방식으로 그린다
 * (`LockedItemDetail`이 맨 먼저 부르는 `useState` 네 개의 순서: ① 포인트 값 ② 제출 중 ③ 열린 응답 ④ 크로스페이드 신호).
 *
 * 확인하는 것
 * ① 열기 전: 타일, 등급 칩, «잠김» 칩, 가린 이름, 설명, 얻은 날과 경로, «열기» 버튼 하나가 있다. 게이지·가진 잼·«채우기»·시트는 없다.
 * ② 포인트 블록: 충분(같을 때 포함) / 모자람(안내 + 막힌 버튼) / 0(한 줄) / null(블록 없음, 버튼 활성) / 거절 응답으로 바뀐 값.
 * ③ 열기 전에는 이름·그림·컬렉션·트라이브·일련번호·배지 상세 링크가 없다.
 * ④ 열린 뒤: 낸 포인트와 받은 포인트가 각각 0보다 클 때만 따로 줄로 보이고, 순서는 낸 포인트가 먼저다.
 * ⑤ «획득»·«잠금»이 이 화면의 문구와 소스에 없다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/inventory/[itemId]/__tests__/LockedItemDetail.test.tsx"
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const seed = vi.hoisted(() => ({ calls: 0, values: {} as Record<number, unknown> }))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    // 화면 컴포넌트가 부르는 앞 네 번만 시험이 정한 값으로 바꾼다. 자식 컴포넌트는 그 뒤에 그려지므로 영향이 없다
    useState: (initial: unknown) => {
      const index = seed.calls++
      if (index in seed.values) return [seed.values[index], () => undefined]
      return actual.useState(initial)
    },
  }
})
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/inventory/x',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/ui/TopNav', () => ({ default: () => <div data-stub="topnav" /> }))

import LockedItemDetail, { type LockedItemDetailProps } from '../LockedItemDetail'
import type { LockedItemOpenPayload } from '@/lib/inventory/lockedItemFill-contract'
import { d, t } from '@/lib/i18n'

const BASE: LockedItemDetailProps = {
  itemId: '22222222-2222-4222-8222-222222222222',
  rarity: 'rare',
  pointsRequired: 1200,
  pointBalance: 800,
  obtainedAt: '2026-10-18T01:00:00Z',
  obtainedBy: 'system_event',
}

const OPENED: LockedItemOpenPayload = {
  itemId: BASE.itemId,
  badgeId: 'badge-1',
  serialNumber: 42,
  serialPrefix: 'ABCD',
  pointsAwarded: 300,
  pointsSpent: 1200,
  pointBalance: 100,
  item: {
    name: '새벽의 첫 바퀴',
    imageUrl: null,
    description: '새벽에 달린 기록',
    rarity: 'epic',
    collection: { id: 'c1', name: '새벽 컬렉션' },
    tribe: { id: 't1', name: '이른 새' },
  },
}

const SPENT_LINE = '1,200 포인트를 냈어요'
const AWARDED_LINE = '배지 보상으로 300 포인트를 받았어요'

/** 주석을 뺀 소스 — 주석에 적힌 설명 때문에 검사가 걸리지 않게 한다 */
function sourceCode(): string {
  const source = readFileSync(fileURLToPath(new URL('../LockedItemDetail.tsx', import.meta.url)), 'utf8')
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function render(overrides: Partial<LockedItemDetailProps> = {}, values: Record<number, unknown> = {}): string {
  seed.calls = 0
  seed.values = values
  return renderToStaticMarkup(<LockedItemDetail {...BASE} {...overrides} />)
}

/** 화면에 보이는 글자만 */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
}

/** 버튼 하나의 여는 태그 — 라벨 글자는 `SwapText` 안에 있어서 버튼 안 어딘가에 라벨이 있는 첫 버튼을 고른다 */
function buttonTagWith(html: string, label: string): string {
  const match = html.match(new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*${label}`))
  expect(match, `«${label}» 버튼이 없다`).not.toBeNull()
  return match![0].slice(0, match![0].indexOf('>') + 1)
}

const SHORTAGE_400 = t(d.lockedItem.detail.points.shortage, { short: '400' })

beforeEach(() => {
  seed.calls = 0
  seed.values = {}
})

describe('LockedItemDetail — 열기 전', () => {
  it('타일·등급·잠김 칩·가린 이름·설명·얻은 날과 경로가 있다', () => {
    const html = render()
    expect(html).toContain(d.lockedItem.card.name)
    expect(html).toContain(d.lockedItem.detail.chip)
    expect(html).toContain(d.lockedItem.detail.description)
    expect(html).toContain(d.lockedItem.detail.obtainedAt)
    expect(html).toContain(d.inventory.obtainBySystem)
    expect(html).toContain('<svg')
  })

  it('게이지·가진 잼 줄·«채우기» 버튼·채우기 시트가 없고 «열기» 버튼 하나만 있다', () => {
    const html = render()
    expect(html).not.toContain('--ds-progress-fill')
    expect(html).not.toContain('role="img"')
    expect(html).not.toContain(d.capsule.sheet.balanceLabel)
    expect(html).not.toContain(d.capsule.sheet.fillCta)
    expect(html).not.toContain('role="dialog"')
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(visibleText(html)).toContain(d.lockedItem.detail.openCta)
  })

  it('이름·그림·컬렉션·트라이브·일련번호·배지 상세 링크가 없다', () => {
    const html = render()
    expect(html).not.toContain('<img')
    expect(html).not.toContain('/badges/')
    expect(html).not.toContain(d.lockedItem.detail.opened.badgeLink)
    expect(html).not.toContain('컬렉션 ')
    expect(html).not.toContain('트라이브 ')
  })

  it('등급이 없는 개체(null)는 등급 칩 없이 그려진다', () => {
    expect(render({ rarity: null })).toContain(d.lockedItem.card.name)
  })
})

describe('LockedItemDetail — 포인트 블록', () => {
  it('충분하면 «필요 포인트»·«가진 포인트» 두 줄과 활성 «열기»가 보이고 안내는 없다', () => {
    const html = render({ pointsRequired: 1200, pointBalance: 5000 })
    expect(html).toContain('<dl')
    const text = visibleText(html)
    expect(text).toContain(`${d.lockedItem.detail.points.required} 1,200`)
    expect(text).toContain(`${d.lockedItem.detail.points.balance} 5,000`)
    expect(html).not.toContain('role="status"')
    expect(buttonTagWith(html, d.lockedItem.detail.openCta)).not.toMatch(/disabled/)
  })

  it('가진 포인트가 필요 포인트와 같아도 막지 않는다', () => {
    const html = render({ pointsRequired: 1200, pointBalance: 1200 })
    expect(html).not.toContain('role="status"')
    expect(buttonTagWith(html, d.lockedItem.detail.openCta)).not.toMatch(/disabled/)
  })

  it('필요 포인트는 큰 숫자(--link), 가진 포인트는 한 단계 낮춘 숫자로 그린다', () => {
    const html = render()
    expect(html).toMatch(/<dd class="[^"]*text-2xl[^"]*text-\[color:var\(--link\)\][^"]*">1,200<\/dd>/)
    expect(html).toMatch(/<dd class="[^"]*text-base[^"]*text-foreground[^"]*">800<\/dd>/)
    expect(html).not.toMatch(/<dd class="[^"]*text-2xl[^"]*">800<\/dd>/)
  })

  it('모자라면 같은 두 줄 아래에 모자란 만큼을 알리는 안내가 있고 «열기»가 막히며 라벨은 그대로다', () => {
    const html = render({ pointsRequired: 1200, pointBalance: 800 })
    expect(html).toContain('role="status"')
    expect(visibleText(html)).toContain(SHORTAGE_400)
    expect(buttonTagWith(html, d.lockedItem.detail.openCta)).toMatch(/disabled/)
    // 안내는 두 줄 바로 아래, 버튼보다 위에 있다
    expect(html.indexOf('</dl>')).toBeLessThan(html.indexOf('role="status"'))
    expect(html.indexOf('role="status"')).toBeLessThan(html.indexOf('<button'))
  })

  it('모자람은 오류색·경고 아이콘 없이 문구로만 알린다', () => {
    const html = render({ pointsRequired: 1200, pointBalance: 800 })
    expect(html).not.toMatch(/text-(red|danger|error|destructive)|bg-(red|danger|error)/)
    expect(html.match(/<svg/g)).toHaveLength(1) // 타일 하나뿐이다
  })

  it('화면에는 진행 숫자·퍼센트·분수가 없고 안내에 감정을 얹는 말도 없다', () => {
    const text = visibleText(render({ pointsRequired: 1200, pointBalance: 800 }))
    expect(text).not.toMatch(/\d+\s*%/)
    expect(text).not.toMatch(/\d+\s*\/\s*\d+/)
    expect(SHORTAGE_400).not.toMatch(/아쉽|조금만|곧|해 주세요/)
  })

  it('필요 포인트가 0이면 «포인트 없이 열 수 있어요» 한 줄만 보이고 가진 포인트가 0이어도 막지 않는다', () => {
    const html = render({ pointsRequired: 0, pointBalance: 0 })
    expect(visibleText(html)).toContain(d.lockedItem.detail.points.free)
    expect(html).not.toContain('<dl')
    expect(html).not.toContain(d.lockedItem.detail.points.balance)
    expect(html).not.toContain('role="status"')
    expect(buttonTagWith(html, d.lockedItem.detail.openCta)).not.toMatch(/disabled/)
  })

  it('필요 포인트를 모르면(null) 포인트 블록 전체를 그리지 않고 버튼은 활성이다', () => {
    const html = render({ pointsRequired: null, pointBalance: 0 })
    const text = visibleText(html)
    expect(html).not.toContain('<dl')
    expect(html).not.toContain('role="status"')
    expect(text).not.toContain(d.lockedItem.detail.points.required)
    expect(text).not.toContain(d.lockedItem.detail.points.balance)
    expect(text).not.toContain(d.lockedItem.detail.points.free)
    expect(text).toContain(d.lockedItem.detail.obtainedAt)
    expect(buttonTagWith(html, d.lockedItem.detail.openCta)).not.toMatch(/disabled/)
  })

  it('서버가 insufficient_points로 거절하면 응답의 값이 화면 상태에 들어가 모자람 상태가 된다(필요 포인트가 비어 있던 개체도)', () => {
    const html = render({ pointsRequired: null, pointBalance: 0 }, { 0: { required: 1200, balance: 800 } })
    expect(visibleText(html)).toContain(SHORTAGE_400)
    expect(buttonTagWith(html, d.lockedItem.detail.openCta)).toMatch(/disabled/)
  })

  it('제출 중에는 «여는 중»이고 비활성이며 aria-busy다', () => {
    const html = render({ pointsRequired: 0, pointBalance: 0 }, { 1: true })
    const tag = buttonTagWith(html, d.lockedItem.detail.opening)
    expect(tag).toMatch(/disabled/)
    expect(tag).toMatch(/aria-busy="true"/)
  })
})

describe('LockedItemDetail — 열린 뒤', () => {
  function openedHtml(overrides: Partial<LockedItemOpenPayload> = {}): string {
    return render({}, { 2: { ...OPENED, ...overrides }, 3: true })
  }

  it('열면 이름·설명·컬렉션·트라이브와 «배지 상세 보기» 링크가 보이고 «잠김» 칩과 «열기» 버튼이 없다', () => {
    const html = openedHtml()
    const text = visibleText(html)
    expect(text).toContain('새벽의 첫 바퀴')
    expect(text).toContain('새벽에 달린 기록')
    expect(text).toContain('컬렉션 새벽 컬렉션')
    expect(text).toContain('트라이브 이른 새')
    expect(html).toContain(`/badges/badge-1?item=${BASE.itemId}&amp;from=inventory`)
    expect(text).not.toContain(d.lockedItem.detail.chip)
    expect(html).not.toContain('<button')
  })

  it('포인트 블록은 접히고 보조기기에서 숨는다', () => {
    const html = openedHtml()
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('grid-rows-[0fr]')
  })

  it('낸 포인트와 받은 포인트를 따로 두 줄로 보이고 낸 포인트가 먼저다', () => {
    const text = visibleText(openedHtml())
    expect(text).toContain(SPENT_LINE)
    expect(text).toContain(AWARDED_LINE)
    // 한 문장으로 합쳐 순이익처럼 읽히게 하지 않는다 — 두 줄은 각자 완결된 문장이다
    expect(text.indexOf(SPENT_LINE) + SPENT_LINE.length).toBeLessThan(text.indexOf(AWARDED_LINE))
  })

  it('두 줄은 컬렉션·트라이브 뒤, «배지 상세 보기» 링크 앞에 놓인다', () => {
    const text = visibleText(openedHtml())
    expect(text.indexOf('트라이브 이른 새')).toBeLessThan(text.indexOf(SPENT_LINE))
    expect(text.indexOf(AWARDED_LINE)).toBeLessThan(text.indexOf(d.lockedItem.detail.opened.badgeLink))
  })

  it('낸 포인트만 있으면 받은 포인트 줄이 없다', () => {
    const text = visibleText(openedHtml({ pointsAwarded: 0 }))
    expect(text).toContain(SPENT_LINE)
    expect(text).not.toContain('포인트를 받았어요')
  })

  it('받은 포인트만 있으면 낸 포인트 줄이 없다(포인트 없이 열린 개체)', () => {
    const text = visibleText(openedHtml({ pointsSpent: 0 }))
    expect(text).toContain(AWARDED_LINE)
    expect(text).not.toContain('포인트를 냈어요')
  })

  it('둘 다 0이면 두 줄 모두 없다', () => {
    const text = visibleText(openedHtml({ pointsSpent: 0, pointsAwarded: 0 }))
    expect(text).not.toContain('포인트를 냈어요')
    expect(text).not.toContain('포인트를 받았어요')
  })

  it('열기 응답의 item이 null이면 전환하지 않고 열기 전 화면 그대로다(서버 페이지에 맡긴다)', () => {
    const html = render({}, { 2: { ...OPENED, item: null } })
    expect(html).toContain(d.lockedItem.card.name)
    expect(html).toContain(d.lockedItem.detail.chip)
  })
})

describe('LockedItemDetail — 문구와 소스', () => {
  it('이 화면의 문구와 소스에 «획득»·«잠금»이 없다', () => {
    expect(JSON.stringify(d.lockedItem.detail)).not.toMatch(/획득|잠금/)
    expect(sourceCode()).not.toMatch(/획득|잠금/)
    expect(visibleText(render())).not.toMatch(/획득|잠금/)
  })

  it('낸 포인트·받은 포인트 문구는 열기를 포인트의 원인으로 읽히게 하지 않는다', () => {
    expect(t(d.lockedItem.detail.opened.spent, { points: '1,200' })).toBe(SPENT_LINE)
    expect(t(d.lockedItem.detail.opened.points, { points: '300' })).toBe(AWARDED_LINE)
    expect(AWARDED_LINE).not.toMatch(/열어서|열면|획득/)
  })

  it('쓰지 않게 된 채우기 문구 키가 없다', () => {
    const detail = d.lockedItem.detail as Record<string, unknown>
    for (const key of ['fillCta', 'fillTitle', 'gaugeAria', 'cancel']) {
      expect(detail[key], key).toBeUndefined()
    }
  })

  it('이력 시트를 쓰지 않는다(잠긴 상태에서는 노출하지 않는다)', () => {
    expect(sourceCode()).not.toMatch(/InventoryItemHistorySheet|\/history/)
  })

  it('채우기 부품(ProgressBar·JamBalance·JamFillPanel·BottomSheet)을 가져오지 않는다', () => {
    expect(sourceCode()).not.toMatch(/ProgressBar|JamBalance|JamFillPanel|BottomSheet|lockedFillPercent|runLockedFill/)
  })

  it('보조 문구에 --muted 글자색을 쓰지 않는다(크림 면 위라 --foreground)', () => {
    // 아이콘 폴백(MedalIcon)의 색은 글자가 아니라 장식이라 제외한다
    expect(sourceCode().replace(/<MedalIcon[^>]*\/>/g, '')).not.toMatch(/text-muted\b/)
  })
})
