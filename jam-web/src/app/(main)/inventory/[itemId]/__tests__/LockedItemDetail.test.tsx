/**
 * 잠긴 아이템 배지 상세 — 포인트로 여는 화면의 마크업 (티켓 20261018_0054 2회, 20261028_1741 1회, 운영 로직 7.2·7.3절)
 *
 * 저장소에 jsdom·testing-library가 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 화면을 고정한다.
 * 클릭으로 일어나는 전환(열기·거절)의 결정은 `lockedItemFill-flow.test.ts`가, 요청 모양은 `lockedItemFill-client.test.ts`가 맡는다.
 * 열린 뒤 화면과 서버 거절 뒤 화면은 클릭 없이는 만들 수 없어서, `useState`의 시작값을 시험이 정해 주는 방식으로 그린다
 * (`LockedItemDetail`이 맨 먼저 부르는 `useState` 네 개의 순서: ① 포인트 값 ② 제출 중 ③ 열린 응답 ④ 크로스페이드 신호).
 *
 * 확인하는 것
 * ① 열기 전: 타일, 등급 칩, «잠김» 칩, 가린 이름, 설명, 얻은 날과 경로, «열기» 버튼 하나(필요 포인트 카드 오른쪽)가 있다. 게이지·가진 잼·«채우기»·시트는 없다.
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
import { lockedItemMaskName } from '@/lib/inventory/lockedItemMask'

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

/**
 * `<style>` 요소를 뺀다 — `ListRow`(얻은 날·경로 행)가 자기 CSS를 `<style>`로 함께 그린다. 그 안의 `var(--link)`·`%` 같은 글자는
 * 화면에 보이는 것도, 이 화면의 색 선택도 아니므로 마크업 검사에서 제외한다.
 */
function withoutStyle(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, '')
}

/** 화면에 보이는 글자만 — 문장 속 포인트 조각(`PointText`의 `text-point-text` 칸)은 앞뒤 글자와 붙여 읽는다 */
function visibleText(html: string): string {
  return withoutStyle(html)
    .replace(/<span class="text-point-text"[^>]*>([^<]*)<\/span>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
}

/** 버튼 하나의 여는 태그 — 라벨 글자는 `SwapText` 안에 있어서 버튼 안 어딘가에 라벨이 있는 첫 버튼을 고른다 */
function buttonTagWith(html: string, label: string): string {
  const match = html.match(new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*${label}`))
  expect(match, `«${label}» 버튼이 없다`).not.toBeNull()
  return match![0].slice(0, match![0].indexOf('>') + 1)
}

/** 열기 전 이름 자리에 보이는 특수문자 6글자 — 개체 id에서 정해진다(2026-11-10 사용자 지시) */
const MASK_NAME = lockedItemMaskName(BASE.itemId)

const SHORTAGE_400 = t(d.lockedItem.detail.points.shortage, { short: '400' })

beforeEach(() => {
  seed.calls = 0
  seed.values = {}
})

describe('LockedItemDetail — 열기 전', () => {
  it('타일·등급·잠김 칩·가린 이름·설명·획득 정보(일시·경로)가 있다', () => {
    const html = render()
    expect(html).toContain(MASK_NAME)
    expect(html).toContain(d.lockedItem.detail.chip)
    expect(html).toContain(d.lockedItem.detail.description)
    // 다른 배지 상세와 같은 «획득 정보» 카드(획득 일시·획득 경로)다
    expect(html).toContain(d.badges.earnInfoTitle)
    expect(html).toContain(d.badges.earnedAt)
    expect(html).toContain(d.badges.earnRoute)
    expect(html).toContain(d.inventory.obtainBySystem)
    expect(html).toContain('<svg')
  })

  it('열기 전 이름은 «잠긴 아이템 배지» 글자 대신 개체마다 정해진 특수문자 6글자다', () => {
    const html = render()
    expect(MASK_NAME).toHaveLength(6)
    expect(html).toContain(`>${MASK_NAME}<`)
    expect(visibleText(html)).not.toContain('잠긴 아이템 배지')
    // 다른 개체는 이름이 다르게 보인다(같은 조합이 나와도 되지만 이 두 id에서는 다르다)
    const other = render({ itemId: '33333333-3333-4333-8333-333333333333' })
    expect(other).toContain(`>${lockedItemMaskName('33333333-3333-4333-8333-333333333333')}<`)
  })

  it('열기 전 설명은 세계관 말투로 숨겨진 무언가가 있다는 느낌만 전한다(트라이브·종류·숫자를 말하지 않는다)', () => {
    const text = visibleText(render())
    expect(d.lockedItem.detail.description).toBe('뒷면에 숨은 무언가가 있어요')
    expect(text).toContain(d.lockedItem.detail.description)
    expect(d.lockedItem.detail.description).not.toMatch(/\d|획득|얻었|잠금|트라이브/)
  })

  it('게이지·가진 잼 줄·«채우기» 버튼·채우기 시트가 없고 «열기» 버튼 하나만 있다', () => {
    const html = render()
    expect(html).not.toContain('--ds-progress-fill')
    expect(html).not.toContain('role="img"')
    expect(html).not.toContain('가진 잼')
    expect(html).not.toContain('채우기')
    expect(html).not.toContain('role="dialog"')
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(visibleText(html)).toContain(d.lockedItem.detail.openCta)
  })

  it('이름·그림·컬렉션·트라이브·일련번호·배지 상세 링크가 없다', () => {
    const html = render()
    expect(html).not.toContain('<img')
    expect(html).not.toContain('/badges/')
    expect(html).not.toContain('배지 상세 보기')
    expect(html).not.toContain('컬렉션 ')
    expect(html).not.toContain('트라이브 ')
  })

  it('등급이 없는 개체(null)는 등급 칩 없이 그려진다', () => {
    expect(render({ rarity: null })).toContain(MASK_NAME)
  })
})

describe('LockedItemDetail — 포인트 블록', () => {
  it('충분하면 «N 포인트 필요» 행과 «보유 포인트 N» 보조 줄, 활성 «열기»가 보이고 안내는 없다', () => {
    const html = render({ pointsRequired: 1200, pointBalance: 5000 })
    const text = visibleText(html)
    expect(text).toContain('1,200 포인트 필요')
    expect(text).toContain('보유 포인트 5,000')
    expect(html).not.toContain('role="status"')
    expect(buttonTagWith(html, d.lockedItem.detail.openCta)).not.toMatch(/disabled/)
  })

  it('보유 포인트가 필요 포인트와 같아도 막지 않는다', () => {
    const html = render({ pointsRequired: 1200, pointBalance: 1200 })
    expect(html).not.toContain('role="status"')
    expect(buttonTagWith(html, d.lockedItem.detail.openCta)).not.toMatch(/disabled/)
  })

  it('필요 포인트는 포인트 보상 행과 같은 모양이다(tint 행 + 서클 코인 + 오렌지 «N 포인트»)', () => {
    const html = withoutStyle(render())
    // «N 포인트» 조각만 point-text로 칠한다 — «필요»는 부모 글자색이다
    expect(html).toMatch(/<span class="text-point-text"[^>]*>1,200 포인트<\/span> 필요/)
    // 서클 lead: --accent 면 + --accent-foreground 코인 아이콘 (미션·배지 상세 보상 행과 같은 값)
    expect(html).toContain('background:var(--accent)')
    expect(html).toContain('color:var(--accent-foreground)')
    // 이전의 dl·dd 두 줄 표현이 아니다
    expect(html).not.toContain('<dl')
    expect(html).not.toContain('<dd')
    expect(html).not.toContain('var(--link)')
  })

  it('모자라면 같은 행 아래에 모자란 만큼을 알리는 안내가 있고 «열기»가 막히며 라벨은 그대로다', () => {
    const html = render({ pointsRequired: 1200, pointBalance: 800 })
    expect(html).toContain('role="status"')
    expect(visibleText(html)).toContain(SHORTAGE_400)
    expect(buttonTagWith(html, d.lockedItem.detail.openCta)).toMatch(/disabled/)
    // 버튼은 포인트 행 오른쪽에 있고, 안내는 그 행 바로 아래에 있다
    expect(html.indexOf('포인트 필요')).toBeLessThan(html.indexOf('<button'))
    expect(html.indexOf('<button')).toBeLessThan(html.indexOf('role="status"'))
  })

  it('«열기» 버튼은 필요 포인트 카드 안 오른쪽(trail 칸)에 있고 맨 아래 전체 폭 버튼은 없다', () => {
    for (const pointsRequired of [1200, 0]) {
      const html = withoutStyle(render({ pointsRequired, pointBalance: 5000 }))
      const trail = html.match(/<div class="ds-list-row-trail"[^>]*>((?:(?!<\/div>)[\s\S])*)<\/div>/)
      expect(trail, `필요 포인트 ${pointsRequired}: trail 칸이 없다`).not.toBeNull()
      expect(trail![1]).toContain('<button')
      expect(trail![1]).toContain(d.lockedItem.detail.openCta)
      expect(html.match(/<button/g)).toHaveLength(1)
      // 획득 정보 카드보다 위에 있다
      expect(html.indexOf('<button')).toBeLessThan(html.indexOf(d.badges.earnInfoTitle))
    }
  })

  it('모자람은 오류색·경고 아이콘 없이 문구로만 알린다', () => {
    const html = render({ pointsRequired: 1200, pointBalance: 800 })
    expect(html).not.toMatch(/text-(red|danger|error|destructive)|bg-(red|danger|error)/)
    // 경고 아이콘이 없다: 잠금 타일 하나와 포인트 행의 코인 아이콘 하나뿐이다
    expect(html.match(/<svg/g)).toHaveLength(2)
  })

  it('화면에는 진행 숫자·퍼센트·분수가 없고 안내에 감정을 얹는 말도 없다', () => {
    const text = visibleText(render({ pointsRequired: 1200, pointBalance: 800 }))
    expect(text).not.toMatch(/\d+\s*%/)
    expect(text).not.toMatch(/\d+\s*\/\s*\d+/)
    expect(SHORTAGE_400).not.toMatch(/아쉽|조금만|곧|해 주세요/)
  })

  it('필요 포인트가 0이면 «포인트 없이 열 수 있어요» 한 줄만 보이고 보유 포인트가 0이어도 막지 않는다', () => {
    const html = render({ pointsRequired: 0, pointBalance: 0 })
    expect(visibleText(html)).toContain(d.lockedItem.detail.points.free)
    expect(visibleText(html)).not.toContain('보유 포인트')
    expect(visibleText(html)).not.toContain('포인트 필요')
    expect(html).not.toContain('role="status"')
    expect(buttonTagWith(html, d.lockedItem.detail.openCta)).not.toMatch(/disabled/)
  })

  it('필요 포인트를 모르면(null) 포인트 블록 전체를 그리지 않고 버튼은 활성이다', () => {
    const html = render({ pointsRequired: null, pointBalance: 0 })
    const text = visibleText(html)
    expect(html).not.toContain('role="status"')
    expect(text).not.toContain('포인트 필요')
    expect(text).not.toContain('보유 포인트')
    expect(text).not.toContain(d.lockedItem.detail.points.free)
    expect(text).toContain(d.badges.earnInfoTitle)
    expect(buttonTagWith(html, d.lockedItem.detail.openCta)).not.toMatch(/disabled/)
    // 카드가 없으니 버튼은 맨 아래(획득 정보 카드 뒤)에 전체 폭으로 놓인다
    expect(html).not.toContain('class="ds-list-row-trail"')
    expect(html.indexOf(d.badges.earnInfoTitle)).toBeLessThan(html.indexOf('<button'))
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
  function openedHtml(): string {
    return render({}, { 2: { ...OPENED }, 3: true })
  }

  it('열면 이름·설명·컬렉션이 보이고 «잠김» 칩과 보이는 «열기» 버튼이 없다', () => {
    const html = openedHtml()
    const text = visibleText(html)
    expect(text).toContain('새벽의 첫 바퀴')
    expect(text).toContain('새벽에 달린 기록')
    // 컬렉션은 일반 아이템 배지 상세와 같은 행(이름 + 쉐브론, 컬렉션 상세로 연결)이다
    expect(text).toContain('새벽 컬렉션')
    expect(html).toContain('href="/collections/c1"')
    expect(text).not.toContain(d.lockedItem.detail.chip)
    // 접힌 포인트 카드 안의 버튼은 남아 있어도 보이지 않고(aria-hidden) 눌리지 않는다(inert)
    expect(html).toMatch(/<div class="grid [^"]*grid-rows-\[0fr\][^"]*" aria-hidden="true" inert="">/)
    expect(html.match(/<button/g) ?? []).toHaveLength(1)
  })

  it('열린 뒤에는 트라이브·낸 포인트·받은 포인트 줄과 «배지 상세 보기» 링크를 두지 않는다(2026-11-09 사용자 지시)', () => {
    const html = openedHtml()
    const text = visibleText(html)
    expect(text).not.toContain('트라이브')
    expect(text).not.toContain('포인트를 냈어요')
    expect(text).not.toContain('포인트를 받았어요')
    expect(text).not.toContain('배지 상세 보기')
    expect(html).not.toContain('/badges/')
    // 다른 배지 상세와 같은 획득 정보 카드는 그대로 있다
    expect(text).toContain(d.badges.earnInfoTitle)
  })

  it('열린 뒤 일련번호는 숫자 릴 모션을 끄지 않는다(일반 아이템 배지 상세와 같다, 2026-11-10 사용자 지시)', () => {
    expect(sourceCode()).not.toMatch(/ItemSerialCode[^>]*animate=\{false\}/)
    // 일련번호 4자 + 6자리 번호가 그대로 보인다
    expect(visibleText(openedHtml())).toContain('000042')
    // 모션을 끈 정적 그림은 자리마다 숫자 칸이 하나(6개)지만, 릴은 돌아갈 숫자 칸을 더 가진다
    expect((openedHtml().match(/class="t-reel-digit"/g) ?? []).length).toBeGreaterThan(6)
  })

  it('포인트 블록은 접히고 보조기기에서 숨는다', () => {
    const html = openedHtml()
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('grid-rows-[0fr]')
  })

  it('모자람 안내는 «N 포인트» 조각만 point-text로 칠한다', () => {
    const short = render({ pointsRequired: 1200, pointBalance: 800 })
    expect(short).toMatch(/<span class="text-point-text"[^>]*>400 포인트<\/span>가 모자라서/)
  })

  it('열기 응답의 item이 null이면 전환하지 않고 열기 전 화면 그대로다(서버 페이지에 맡긴다)', () => {
    const html = render({}, { 2: { ...OPENED, item: null } })
    expect(html).toContain(MASK_NAME)
    expect(html).toContain(d.lockedItem.detail.chip)
  })
})

describe('LockedItemDetail — 문구와 소스', () => {
  it('이 화면의 문구와 소스에 «잠금»이 없고, 열기 문구에는 «획득»·«얻었어요»가 없다', () => {
    // 고정 용어는 «잠김»이다(«잠금» 아님)
    expect(JSON.stringify(d.lockedItem.detail)).not.toMatch(/잠금/)
    expect(sourceCode()).not.toMatch(/잠금/)
    expect(visibleText(render())).not.toMatch(/잠금/)
    // 열기는 유저가 하는 화면 동작이라 획득과 다른 개념이다(2026-11-09 사용자 결정): 열기 문구에는 «획득»·«얻었어요»를 쓰지 않는다.
    // 받은 일시·경로를 말하는 «획득 정보» 카드(다른 배지 상세와 같은 표현)는 `d.badges`의 라벨이라 이 사전 밖이다.
    const openingCopy = JSON.stringify([
      d.lockedItem.detail.openCta,
      d.lockedItem.detail.opening,
      d.lockedItem.detail.openedToast,
      d.lockedItem.detail.points,
      d.lockedItem.detail.opened,
    ])
    expect(openingCopy).not.toMatch(/획득|얻었/)
  })

  it('획득 정보 카드는 다른 배지 상세와 같은 표현(획득 정보·획득 일시·획득 경로)을 쓴다', () => {
    const text = visibleText(render())
    expect(text).toContain('획득 정보')
    expect(text).toContain('획득 일시')
    expect(text).toContain('획득 경로')
  })

  it('열린 뒤 문구 키는 컬렉션 줄 하나뿐이다(트라이브·낸 포인트·받은 포인트·상세 링크 키는 지웠다)', () => {
    expect(Object.keys(d.lockedItem.detail.opened)).toEqual(['collection'])
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

  it('채우기 부품(ProgressBar·JamBalance·BottomSheet)을 가져오지 않는다', () => {
    expect(sourceCode()).not.toMatch(/ProgressBar|JamBalance|BottomSheet|lockedFillPercent|runLockedFill/)
  })

  it('보조 문구에 --muted 글자색을 쓰지 않는다(크림 면 위라 --foreground)', () => {
    // 아이콘 폴백(MedalIcon)의 색은 글자가 아니라 장식이라 제외한다
    expect(sourceCode().replace(/<MedalIcon[^>]*\/>/g, '')).not.toMatch(/text-muted\b/)
  })
})

describe('LockedItemDetail — 일반 아이템 배지 상세와 같은 구성 (2026-11-09 사용자 지시)', () => {
  const openedHtml = () => render({}, { 2: { ...OPENED }, 3: true })

  it('대표 이미지·칩·이름·설명이 일반 상세와 같은 카드(BadgeHeroSection) 안에 있다', () => {
    const html = withoutStyle(render())
    const card = html.slice(html.indexOf('rounded-2xl'), html.indexOf('</h1>'))

    // 일반 상세 카드의 면과 구조: 흰 카드 면, 세로 고정(aspect-square) 없음
    expect(html).toContain('bg-card-bg')
    expect(html).not.toContain('aspect-square')
    // 카드 안에 타일(svg), 등급 칩, «잠김» 칩, 이름이 이 순서로 있다
    expect(card).toContain('<svg')
    expect(html.indexOf('Rare')).toBeGreaterThan(html.indexOf('<svg'))
    expect(html.indexOf(d.lockedItem.detail.chip)).toBeGreaterThan(html.indexOf('Rare'))
    expect(html.indexOf(`>${MASK_NAME}<`)).toBeGreaterThan(html.indexOf(d.lockedItem.detail.chip))
    expect(html).toMatch(/<h1 class="text-3xl font-bold text-center text-foreground">/)
    // 설명은 일반 상세와 같은 문단이다(줄 균형을 끈 text-wrap!)
    expect(html).toMatch(new RegExp(`<p class="text-base text-center text-wrap! text-muted">[^]*${d.lockedItem.detail.description}`))
  })

  it('«잠김» 칩은 등급 칩과 같은 줄에 나란히 놓인다', () => {
    const html = withoutStyle(render())
    const row = html.match(/<div class="flex items-center gap-2">((?:(?!<\/div>)[^])*)<\/div>/)?.[1] ?? ''

    expect(row).toContain('Rare')
    expect(row).toContain(d.lockedItem.detail.chip)
  })

  it('열기 전에는 «잠김» 칩이 있고, 등급이 없으면 «잠김» 칩만 있다', () => {
    const html = withoutStyle(render({ rarity: null }))

    expect(html).toContain(d.lockedItem.detail.chip)
    expect(html).not.toContain('Rare')
    expect(html).not.toContain('Epic')
  })

  it('획득 정보는 다른 배지 상세와 같은 카드 + 라벨·값 행이다', () => {
    const html = withoutStyle(render())
    const text = visibleText(html)

    // 다른 배지 상세와 같은 카드: 제목 «획득 정보» + 라벨·값 행(획득 일시는 시각까지, 획득 경로)
    expect(text).toContain(`${d.badges.earnInfoTitle} ${d.badges.earnedAt}`)
    expect(text).toMatch(/\d{4}-\d{2}-\d{2} (AM|PM) \d{2}:\d{2}:\d{2}/)
    expect(text).toContain(`${d.badges.earnRoute} ${d.inventory.obtainBySystem}`)
    expect(html).toContain('ds-list-row')
  })

  it('열린 뒤 일련번호는 카드 바로 아래 가운데에, 컬렉션은 행으로 보인다', () => {
    const html = withoutStyle(openedHtml())

    // 일반 상세와 같은 일련번호 블록(가운데, pt-3 pb-[32px])이 카드 다음에 온다
    expect(html).toContain('relative z-10 flex justify-center px-4 pt-3 pb-[32px]')
    expect(html.indexOf('</h1>')).toBeLessThan(html.indexOf('pt-3 pb-[32px]'))
    // 이름이 바뀌고 «잠김» 칩이 사라진다
    expect(visibleText(html)).toContain('새벽의 첫 바퀴')
    expect(visibleText(html)).not.toContain(d.lockedItem.detail.chip)
    // 열린 뒤 등급은 열린 배지의 등급(Epic)이다
    expect(html).toContain('Epic')
  })

  it('히어로를 일반 상세의 컴포넌트로 그린다 — 소스가 BadgeHeroSection을 가져온다', () => {
    const src = sourceCode()

    expect(src).toMatch(/import BadgeHeroSection from '@\/components\/BadgeHeroSection'/)
    expect(src).toContain('<BadgeHeroSection')
    // 직접 그리던 칩·제목 마크업은 남지 않는다
    expect(src).not.toContain('<RarityBadge')
    expect(src).not.toContain('<h1')
  })
})

describe('LockedItemDetail — 획득 경로 문구', () => {
  const routeText = (overrides: Partial<LockedItemDetailProps>) => visibleText(render(overrides))

  it('캡슐에서 나온 개체는 obtained_by가 drop이어도 «캡슐 열기 보상»이다', () => {
    expect(routeText({ obtainedBy: 'drop', issueRoute: 'capsule' })).toContain(`${d.badges.earnRoute} 캡슐 열기 보상`)
  })

  it('미션 보상으로 받은 개체는 «미션 보상»이고, 발급 기록이 있으면 발급 기록이 앞선다', () => {
    expect(routeText({ obtainedBy: 'system_event', missionReward: true })).toContain(`${d.badges.earnRoute} 미션 보상`)
    expect(routeText({ obtainedBy: 'drop', issueRoute: 'capsule', missionReward: true })).toContain(`${d.badges.earnRoute} 캡슐 열기 보상`)
    expect(routeText({ obtainedBy: 'system_event' })).toContain(`${d.badges.earnRoute} 시스템 지급`)
  })

  it('활동 동기화로 받은 개체는 «활동 동기화 드랍», 픽업은 «체크인 픽업»이다', () => {
    expect(routeText({ obtainedBy: 'drop', issueRoute: 'sync' })).toContain(`${d.badges.earnRoute} 활동 동기화 드랍`)
    expect(routeText({ obtainedBy: 'drop' })).toContain(`${d.badges.earnRoute} 활동 동기화 드랍`)
    expect(routeText({ obtainedBy: 'pickup' })).toContain(`${d.badges.earnRoute} 체크인 픽업`)
  })

  it('이벤트 드랍과 그 밖의 값은 «이벤트 드랍»·«시스템 지급»이고 이전의 «활동 드랍»은 쓰지 않는다', () => {
    expect(routeText({ obtainedBy: 'drop_event' })).toContain(`${d.badges.earnRoute} 이벤트 드랍`)
    expect(routeText({ obtainedBy: 'system_event' })).toContain(`${d.badges.earnRoute} 시스템 지급`)
    expect(routeText({ obtainedBy: 'drop' })).not.toMatch(/활동 드랍/)
  })
})
