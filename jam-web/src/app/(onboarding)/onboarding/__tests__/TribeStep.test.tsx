/**
 * 트라이브 고르기 화면 (티켓 20261021_1247 1회, 채원 사전 판정 2026-10-21, 사용자 결정 5·6)
 *
 * 고정하는 것
 *  - 제목 아래에 안내 두 줄이 보인다: «한 번 고르면 바꿀 수 없어요»(foreground, text-base)와 «동기화로 받는 아이템 배지는 고른 트라이브의 것이에요»(muted, text-sm).
 *    옛 문구 «탈퇴하기 전까지»와 바꾸는 방법(운영자가 바꿔 주는 길)은 화면에 없다.
 *  - 게이트로 돌아온 유저(`showGateHint`)에게만 «트라이브를 고르면 JAM!을 시작할 수 있어요»가 보인다.
 *  - 카드를 눌러도 확정되지 않는다(onSelect만 불린다). 버튼 «이 트라이브로 시작하기»를 눌러야 onFinish가 불린다. 선택이 없으면 버튼은 비활성이다.
 *  - 선택한 카드만 inverse 톤(색 반전)이고 aria-checked가 참이다. 카드 묶음은 radiogroup, 카드는 radio다.
 *  - 제출 중에는 카드(클릭·포커스)와 «뒤로»가 잠기고 버튼 문구가 «시작하는 중»으로 바뀐다. 제출 중에는 카드를 눌러도 선택이 바뀌지 않는다.
 *  - 오류 문구에는 role="alert"가 있다. 로딩·읽기 실패와 «다시 시도»·활성 0개 상태는 그대로다.
 *  - 카드는 세로 1열 가로형(padding 16), 이미지 48, 사람 모양 폴백과 minHeight 140이 없고, 이미지가 하나도 없으면 이미지 자리를 뺀다.
 *  - 새로 쓴 한국어 요소에 줄바꿈 클래스(break-keep + wrap-break-word)가 있다.
 *  - 로그아웃 길(티켓 20261021_1247 재작업, 채원 사전 판정 2026-10-21): 맨 아래에 ghost «로그아웃» 하나가 있고(프로필과 같은 문구), 로딩·읽기 실패·활성 0개·준비 네 상태에서
 *    모두 보인다. 제출 중에는 비활성이다. 로그아웃 중에는 스피너를 보이고 카드·«뒤로»·확정 버튼을 잠그며 확정 버튼 문구는 «시작하는 중»으로 바뀌지 않는다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)와, Hook을 쓰지 않는 컴포넌트를 함수로 불러 얻은
 * 요소 트리 읽기(클릭은 요소의 onClick을 직접 부른다)로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(onboarding)/onboarding/__tests__/TribeStep.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/image', () => ({
  default: function ImageStub(props: { src: string; alt: string; width?: number; height?: number; className?: string }) {
    // eslint-disable-next-line @next/next/no-img-element -- 시험용 가짜 이미지
    return <img src={props.src} alt={props.alt} width={props.width} height={props.height} className={props.className} />
  },
}))

import TribeStep, { TRIBE_STEP_TITLE_ID, type TribeOption, type TribeStepProps } from '../TribeStep'
import { Card } from '@ds/components/cards/Card'
import Button from '@/components/ui/Button'
import { d } from '@/lib/i18n'

const TRIBES: TribeOption[] = [
  { id: 't1', name: '낭만 미식가', tagline: '맛 · 먹으러 달리는 사람들', image_url: '/tribes/t1.png' },
  { id: 't2', name: '아스팔트 레인저', tagline: '도시 · 길 위에서 만나요', image_url: null },
  { id: 't3', name: '숲속의 갱단', tagline: null, image_url: '/tribes/t3.png' },
]

function makeProps(overrides: Partial<TribeStepProps> = {}): TribeStepProps {
  return {
    tribesState: { kind: 'ready', tribes: TRIBES },
    selectedTribeId: null,
    submitting: false,
    loggingOut: false,
    error: '',
    showGateHint: false,
    onSelect: vi.fn(),
    onFinish: vi.fn(),
    onBack: vi.fn(),
    onRetry: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  }
}

type Element = ReactElement<Record<string, unknown>>

/** 요소 트리를 깊이 우선으로 돈다 */
function walk(node: unknown, visit: (element: Element) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (!isValidElement(node)) return
  const element = node as Element
  visit(element)
  for (const value of Object.values(element.props)) walk(value, visit)
}

function findAll(tree: unknown, predicate: (element: Element) => boolean): Element[] {
  const found: Element[] = []
  walk(tree, (element) => {
    if (predicate(element)) found.push(element)
  })
  return found
}

function treeOf(props: TribeStepProps): unknown {
  return TribeStep(props)
}

const cardsOf = (tree: unknown) => findAll(tree, (e) => e.type === Card)
const buttonsOf = (tree: unknown) => findAll(tree, (e) => e.type === Button)
const buttonLabeled = (tree: unknown, label: string) =>
  buttonsOf(tree).find((b) => b.props.children === label) as Element | undefined

function html(props: TribeStepProps): string {
  return renderToStaticMarkup(<TribeStep {...props} />)
}

/** 문구가 든 요소의 class 속성을 돌려준다 */
function classOf(markup: string, text: string): string {
  const match = new RegExp(`<[a-z0-9]+ [^>]*class="([^"]*)"[^>]*>${text}<`).exec(markup)
  if (!match) throw new Error(`문구 «${text}»를 담은 요소를 찾지 못했다`)
  return match[1]
}

describe('안내 문구', () => {
  it('제목 아래에 안내 두 줄이 보인다(첫 줄 foreground text-base, 둘째 줄 muted text-sm)', () => {
    const markup = html(makeProps())

    expect(markup).toContain(d.onboarding.step2Subtitle)
    expect(markup).toContain(d.onboarding.step2ItemBadgeNotice)
    expect(d.onboarding.step2Subtitle).toBe('한 번 고르면 바꿀 수 없어요')
    expect(d.onboarding.step2ItemBadgeNotice).toBe('동기화로 받는 아이템 배지는 고른 트라이브의 것이에요')

    const first = classOf(markup, d.onboarding.step2Subtitle)
    expect(first).toContain('text-foreground')
    expect(first).toContain('text-base')
    expect(first).not.toContain('text-muted')

    const second = classOf(markup, d.onboarding.step2ItemBadgeNotice)
    expect(second).toContain('text-muted')
    expect(second).toContain('text-sm')
  })

  it('안내 두 줄은 제목과 카드 사이에 있다', () => {
    const markup = html(makeProps())

    const title = markup.indexOf(TRIBE_STEP_TITLE_ID)
    const first = markup.indexOf(d.onboarding.step2Subtitle)
    const second = markup.indexOf(d.onboarding.step2ItemBadgeNotice)
    const firstCard = markup.indexOf('role="radio"')
    expect(title).toBeGreaterThanOrEqual(0)
    expect(title).toBeLessThan(first)
    expect(first).toBeLessThan(second)
    expect(second).toBeLessThan(firstCard)
  })

  it('옛 문구(탈퇴하기 전까지)와 바꾸는 방법 안내는 화면에 없다', () => {
    const markup = html(makeProps())

    expect(markup).not.toContain('탈퇴')
    expect(markup).not.toContain('운영')
    expect(markup).not.toContain('바꿔 드')
    expect(markup).not.toContain('문의')
  })

  it('게이트로 돌아온 유저에게만 «트라이브를 고르면 JAM!을 시작할 수 있어요»가 보인다(muted)', () => {
    const arrived = html(makeProps({ showGateHint: true }))
    const normal = html(makeProps({ showGateHint: false }))

    expect(d.onboarding.step2GateHint).toBe('트라이브를 고르면 JAM!을 시작할 수 있어요')
    expect(arrived).toContain(d.onboarding.step2GateHint)
    expect(classOf(arrived, d.onboarding.step2GateHint)).toContain('text-muted')
    expect(normal).not.toContain(d.onboarding.step2GateHint)
    // 한 줄은 제목 아래, 안내 두 줄 위에 있다
    expect(arrived.indexOf(TRIBE_STEP_TITLE_ID)).toBeLessThan(arrived.indexOf(d.onboarding.step2GateHint))
    expect(arrived.indexOf(d.onboarding.step2GateHint)).toBeLessThan(arrived.indexOf(d.onboarding.step2Subtitle))
  })

  it('제목·안내·오류·소개 등 새로 그리는 한국어 요소에 줄바꿈 클래스(break-keep, wrap-break-word)가 있다', () => {
    const markup = html(makeProps({ showGateHint: true, error: d.onboarding.genericError, selectedTribeId: 't1' }))

    for (const text of [
      d.onboarding.step2Subtitle,
      d.onboarding.step2ItemBadgeNotice,
      d.onboarding.step2GateHint,
      d.onboarding.genericError,
      '낭만 미식가',
      '맛 · 먹으러 달리는 사람들',
    ]) {
      const cls = classOf(markup, text)
      expect(cls, text).toContain('break-keep')
      expect(cls, text).toContain('wrap-break-word')
    }
    expect(markup).toMatch(/<h1 [^>]*class="[^"]*break-keep[^"]*wrap-break-word/)
    // 버튼 라벨은 한 줄로 읽혀야 한다
    expect(markup).toMatch(/whitespace-nowrap[^"]*"[^>]*>이 트라이브로 시작하기</)
  })
})

describe('카드 선택과 확정', () => {
  it('카드를 눌러도 확정되지 않는다 — 선택만 알리고 확정(onFinish)은 부르지 않는다', () => {
    const props = makeProps()
    const [first] = cardsOf(treeOf(props))

    ;(first.props.onClick as () => void)()

    expect(props.onSelect).toHaveBeenCalledTimes(1)
    expect(props.onSelect).toHaveBeenCalledWith('t1')
    expect(props.onFinish).not.toHaveBeenCalled()
  })

  it('버튼 «이 트라이브로 시작하기»를 눌러야 확정된다', () => {
    const props = makeProps({ selectedTribeId: 't2' })
    const finish = buttonLabeled(treeOf(props), d.onboarding.finishButton) as Element

    expect(d.onboarding.finishButton).toBe('이 트라이브로 시작하기')
    expect(finish.props.disabled).toBe(false)
    ;(finish.props.onClick as () => void)()

    expect(props.onFinish).toHaveBeenCalledTimes(1)
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('선택이 없으면 버튼이 비활성이다', () => {
    const finish = buttonLabeled(treeOf(makeProps()), d.onboarding.finishButton) as Element

    expect(finish.props.disabled).toBe(true)
  })

  it('고른 카드만 inverse 톤(색 반전)이고 aria-checked가 참이다', () => {
    const cards = cardsOf(treeOf(makeProps({ selectedTribeId: 't2' })))

    expect(cards.map((c) => c.props.tone)).toEqual(['default', 'inverse', 'default'])
    expect(cards.map((c) => c.props['aria-checked'])).toEqual([false, true, false])
  })

  it('고른 카드는 어두운 면 위 소개 글자가 --snow다(muted가 아니다)', () => {
    const markup = html(makeProps({ selectedTribeId: 't1' }))

    expect(classOf(markup, '맛 · 먹으러 달리는 사람들')).toContain('text-snow')
    expect(classOf(markup, '맛 · 먹으러 달리는 사람들')).not.toContain('text-muted')
    expect(classOf(markup, '도시 · 길 위에서 만나요')).toContain('text-muted')
  })
})

describe('접근성 역할', () => {
  it('카드 묶음은 radiogroup이고 제목으로 이름이 붙는다, 카드는 radio다', () => {
    const markup = html(makeProps({ selectedTribeId: 't1' }))

    expect(markup).toContain('role="radiogroup"')
    expect(markup).toContain(`aria-labelledby="${TRIBE_STEP_TITLE_ID}"`)
    expect(markup).toContain(`id="${TRIBE_STEP_TITLE_ID}"`)
    expect(markup.match(/role="radio"/g)).toHaveLength(3)
    expect(markup.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(markup.match(/aria-checked="false"/g)).toHaveLength(2)
  })

  it('고른 카드는 키보드로도 닿는다(tabindex 0)', () => {
    const markup = html(makeProps())

    expect(markup.match(/tabindex="0"/g)).toHaveLength(3)
  })

  it('오류 문구에는 role="alert"가 있고, 오류가 없으면 alert가 없다', () => {
    const withError = html(makeProps({ error: d.onboarding.invalidTribeError }))
    const without = html(makeProps())

    expect(withError).toMatch(new RegExp(`role="alert"[^>]*>${d.onboarding.invalidTribeError}<`))
    expect(without).not.toContain('role="alert"')
  })
})

describe('제출 중 잠금', () => {
  it('카드의 onClick이 없어 클릭·포커스가 모두 막히고 aria-disabled가 붙는다', () => {
    const props = makeProps({ selectedTribeId: 't1', submitting: true })
    const tree = treeOf(props)

    for (const card of cardsOf(tree)) {
      expect(card.props.onClick).toBeUndefined()
      expect(card.props['aria-disabled']).toBe(true)
    }
    const markup = html(props)
    expect(markup).not.toContain('tabindex="0"')
    expect(markup.match(/aria-disabled="true"/g)).toHaveLength(3)
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('«뒤로»와 확정 버튼이 비활성이고 확정 버튼 문구가 «시작하는 중»이다', () => {
    const tree = treeOf(makeProps({ selectedTribeId: 't1', submitting: true }))

    const back = buttonLabeled(tree, d.common.back) as Element
    const finishing = buttonLabeled(tree, d.onboarding.finishing) as Element
    expect(d.onboarding.finishing).toBe('시작하는 중')
    expect(back.props.disabled).toBe(true)
    expect(finishing.props.disabled).toBe(true)
    expect(buttonLabeled(tree, d.onboarding.finishButton)).toBeUndefined()
  })

  it('제출 중이 아니면 «뒤로»가 열려 있고 누르면 onBack이 불린다', () => {
    const props = makeProps({ selectedTribeId: 't1' })
    const back = buttonLabeled(treeOf(props), d.common.back) as Element

    expect(back.props.disabled).toBe(false)
    ;(back.props.onClick as () => void)()
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })
})

describe('상태: 로딩 · 읽기 실패 · 활성 0개', () => {
  it('로딩 중에는 스피너가 보이고 카드·오류 문구가 없다', () => {
    const markup = html(makeProps({ tribesState: { kind: 'loading' } }))

    expect(markup).toContain('animate-spin')
    expect(markup).not.toContain('role="radiogroup"')
    expect(markup).not.toContain(d.onboarding.tribesLoadError)
  })

  it('읽기에 실패하면 오류 문구와 «다시 시도»가 보이고 누르면 onRetry가 불린다', () => {
    const props = makeProps({ tribesState: { kind: 'error' } })
    const markup = html(props)

    expect(markup).toContain(d.onboarding.tribesLoadError)
    const retry = buttonLabeled(treeOf(props), d.onboarding.retryButton) as Element
    ;(retry.props.onClick as () => void)()
    expect(props.onRetry).toHaveBeenCalledTimes(1)
    expect(markup).not.toContain('role="radiogroup"')
  })

  it('활성 트라이브가 0개면 안내 문구와 «다시 시도»가 보이고 카드가 없다', () => {
    const props = makeProps({ tribesState: { kind: 'ready', tribes: [] } })
    const markup = html(props)

    expect(markup).toContain(d.onboarding.tribesEmptyError)
    expect(buttonLabeled(treeOf(props), d.onboarding.retryButton)).toBeDefined()
    expect(markup).not.toContain('role="radiogroup"')
  })
})

describe('카드 모양', () => {
  it('세로 1열이다 — 2열 격자(grid-cols-2)가 없다', () => {
    const markup = html(makeProps())

    expect(markup).not.toContain('grid-cols-2')
    expect(markup).toMatch(/role="radiogroup"[^>]*class="[^"]*flex-col/)
  })

  it('카드 안쪽 여백은 16이고 minHeight 140이 없다', () => {
    const markup = html(makeProps())

    expect(markup).toContain('padding:var(--spacing-16)')
    expect(markup).not.toContain('min-height')
    expect(markup).not.toContain('140')
  })

  it('이름은 text-base 굵게, 소개는 text-sm 2줄까지다', () => {
    const markup = html(makeProps())

    const name = classOf(markup, '낭만 미식가')
    expect(name).toContain('text-base')
    expect(name).toContain('font-bold')
    const tagline = classOf(markup, '맛 · 먹으러 달리는 사람들')
    expect(tagline).toContain('text-sm')
    expect(tagline).toContain('line-clamp-2')
  })

  it('소개가 없는 트라이브는 소개 줄 없이 이름만 그린다', () => {
    const markup = html(makeProps())

    expect(markup).toContain('숲속의 갱단')
    expect(markup).not.toContain('>null<')
  })

  it('사람 모양 폴백 아이콘이 없다 — 이미지가 없는 트라이브는 빈 자리만 둔다', () => {
    const markup = html(makeProps())

    expect(markup).not.toContain('<svg')
    expect(markup).not.toContain('bg-black/10')
    // 이미지는 48이고 이미지가 있는 트라이브만 그린다
    expect(markup.match(/<img /g)).toHaveLength(2)
    expect(markup).toContain('width="48"')
    expect(markup).toContain('height="48"')
  })

  it('이미지가 하나도 없으면 이미지 자리를 뺀다', () => {
    const noImages = TRIBES.map((tribe) => ({ ...tribe, image_url: null }))
    const markup = html(makeProps({ tribesState: { kind: 'ready', tribes: noImages } }))

    expect(markup).not.toContain('<img')
    expect(markup).not.toContain('w-12 h-12')
  })

  it('이미지가 하나라도 있으면 이름 줄이 어긋나지 않게 48 자리를 모두 둔다', () => {
    const markup = html(makeProps())

    expect(markup.match(/class="w-12 h-12 shrink-0"/g)).toHaveLength(3)
  })
})

describe('로그아웃 길 (티켓 20261021_1247, 채원 사전 판정 2026-10-21)', () => {
  const STATES: Array<[string, TribeStepProps['tribesState']]> = [
    ['로딩', { kind: 'loading' }],
    ['읽기 실패', { kind: 'error' }],
    ['활성 0개', { kind: 'ready', tribes: [] }],
    ['준비(카드 있음)', { kind: 'ready', tribes: TRIBES }],
  ]
  const logoutOf = (tree: unknown) => buttonLabeled(tree, d.profile.logoutButton) as Element

  it('문구는 프로필의 «로그아웃»을 그대로 쓴다 — 새 문구가 없다', () => {
    expect(d.profile.logoutButton).toBe('로그아웃')
    expect(logoutOf(treeOf(makeProps()))).toBeDefined()
  })

  it.each(STATES)('%s 상태에서도 «로그아웃»이 보인다', (_name, tribesState) => {
    const props = makeProps({ tribesState })

    expect(logoutOf(treeOf(props))).toBeDefined()
    expect(html(props)).toContain(`>${d.profile.logoutButton}<`)
  })

  it('ghost 버튼이고 내용 폭(fullWidth 없음)이며 type="button"이다, aria-label은 달지 않는다', () => {
    const logout = logoutOf(treeOf(makeProps()))

    expect(logout.props.variant).toBe('ghost')
    expect(logout.props.fullWidth).toBeUndefined()
    expect(logout.props.size).toBeUndefined()
    expect(logout.props.type).toBe('button')
    expect(logout.props['aria-label']).toBeUndefined()
  })

  it('한 줄로 읽히고 줄바꿈 클래스(whitespace-nowrap, break-keep, wrap-break-word)가 있다', () => {
    const cls = String(logoutOf(treeOf(makeProps())).props.className)

    expect(cls).toContain('whitespace-nowrap')
    expect(cls).toContain('break-keep')
    expect(cls).toContain('wrap-break-word')
  })

  it('tribesState 조건 블록 밖, 바깥 스택의 마지막 자식이다 — «시작하기/뒤로» 묶음 바로 다음 형제다', () => {
    for (const [name, tribesState] of STATES) {
      const tree = treeOf(makeProps({ tribesState }))
      const [stack] = findAll(tree, (e) => e.type === 'div' && String(e.props.className).includes('max-w-sm'))
      const children = Children.toArray(stack.props.children as ReactNode) as Element[]
      const last = children[children.length - 1]
      const beforeLast = children[children.length - 2]

      expect(last.type, name).toBe(Button)
      expect(last.props.children, name).toBe(d.profile.logoutButton)
      expect(String(beforeLast.props.className), name).toContain('gap-3')
      expect(Children.toArray(beforeLast.props.children as ReactNode).map((c) => (c as Element).props.children), name).toEqual([
        d.onboarding.finishButton,
        d.common.back,
      ])
    }
  })

  it('화면 순서는 카드 → 시작하기 → 뒤로 → 로그아웃이다(포커스 순서와 같다)', () => {
    const markup = html(makeProps({ selectedTribeId: 't1' }))

    const lastCard = markup.lastIndexOf('role="radio"')
    const finish = markup.indexOf(d.onboarding.finishButton)
    const back = markup.indexOf(`>${d.common.back}<`)
    const logout = markup.indexOf(`>${d.profile.logoutButton}<`)
    expect(lastCard).toBeLessThan(finish)
    expect(finish).toBeLessThan(back)
    expect(back).toBeLessThan(logout)
  })

  it('누르면 onLogout이 불린다, 아무 일도 없을 때는 열려 있고 스피너가 없다', () => {
    const props = makeProps()
    const logout = logoutOf(treeOf(props))

    expect(logout.props.disabled).toBe(false)
    expect(logout.props.loading).toBe(false)
    ;(logout.props.onClick as () => void)()
    expect(props.onLogout).toHaveBeenCalledTimes(1)
    expect(html(props)).not.toContain('animate-spin')
  })

  it('제출 중(submitting)에는 비활성이다', () => {
    const props = makeProps({ selectedTribeId: 't1', submitting: true })

    expect(logoutOf(treeOf(props)).props.disabled).toBe(true)
    expect(html(props)).toMatch(new RegExp(`<button [^>]*disabled=""[^>]*>${d.profile.logoutButton}</button>`))
  })

  it('로그아웃 중에는 스피너를 보이고 글자는 «로그아웃» 그대로다', () => {
    const props = makeProps({ loggingOut: true })
    const markup = html(props)

    expect(logoutOf(treeOf(props)).props.loading).toBe(true)
    expect(markup).toContain('animate-spin')
    expect(markup).toContain(`>${d.profile.logoutButton}<`)
  })

  it('로그아웃 중에는 카드의 onClick이 없고 aria-disabled가 붙는다', () => {
    const props = makeProps({ selectedTribeId: 't1', loggingOut: true })

    for (const card of cardsOf(treeOf(props))) {
      expect(card.props.onClick).toBeUndefined()
      expect(card.props['aria-disabled']).toBe(true)
    }
    const markup = html(props)
    expect(markup).not.toContain('tabindex="0"')
    expect(markup.match(/aria-disabled="true"/g)).toHaveLength(3)
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('로그아웃 중에는 «뒤로»와 확정 버튼이 비활성이고 확정 버튼 문구는 «시작하는 중»으로 바뀌지 않는다', () => {
    const props = makeProps({ selectedTribeId: 't1', loggingOut: true })
    const tree = treeOf(props)

    const back = buttonLabeled(tree, d.common.back) as Element
    const finish = buttonLabeled(tree, d.onboarding.finishButton) as Element
    expect(back.props.disabled).toBe(true)
    expect(finish).toBeDefined()
    expect(finish.props.disabled).toBe(true)
    expect(buttonLabeled(tree, d.onboarding.finishing)).toBeUndefined()
    expect(html(props)).not.toContain(d.onboarding.finishing)
  })

  it('로그아웃 중이 아니고 제출 중도 아니면 카드·«뒤로»가 열려 있다(잠금이 새지 않는다)', () => {
    const tree = treeOf(makeProps({ selectedTribeId: 't1' }))

    expect(cardsOf(tree).every((c) => typeof c.props.onClick === 'function')).toBe(true)
    expect((buttonLabeled(tree, d.common.back) as Element).props.disabled).toBe(false)
  })
})
