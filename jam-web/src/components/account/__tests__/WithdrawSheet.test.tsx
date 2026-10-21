/**
 * 탈퇴 확인 시트 (티켓 20261021_1249 3회, 채원 사전 판정 2026-10-21)
 *
 * 저장소에 jsdom이 없어 (1) 서버 렌더(`renderToStaticMarkup`)로 문구·순서·속성을 보고, (2) 훅이 없는 겉모습 컴포넌트(`WithdrawSheetView`)가
 * 돌려주는 엘리먼트 트리에서 버튼·입력칸의 prop과 핸들러를 꺼내 눌러 본다. BottomSheet는 SSR에서 아무것도 그리지 않아(마운트 게이트)
 * 시험에서는 제목·자식·푸터를 그대로 내보내는 대역으로 바꾼다(DOM 순서는 실제 BottomSheet와 같다: 제목 → 스크롤 영역 → 푸터).
 * 실제 계정을 지우는 호출은 어디에도 없다 — 호출 흐름은 `withdraw-client.test.ts`가 가짜 서버로 고정한다.
 *
 * 고정하는 것
 *  - 문구와 읽는 순서, 왼쪽 정렬, 장식(아이콘·그라디언트) 없음, 한국어 줄바꿈 클래스
 *  - 요약 세 상태(스켈레톤, 값, 읽기 실패 한 문장)와 0 표기, Strava 동기화 줄은 연결 중일 때만
 *  - 확정 버튼은 확인 문구가 일치(앞뒤 공백 무시, NFC)하기 전까지 disabled, 불일치 표시는 blur 뒤 비어 있지 않을 때만
 *  - 제출 중: 확정 loading과 «탈퇴하는 중», 입력칸·취소 disabled, 시트 닫기 막힘
 *  - 실패 안내는 푸터 맨 위 InlineNotice, 입력값 유지
 *  - 첫 포커스는 입력칸이 아니라 본문 래퍼, Tab 순서는 본문 → 입력칸 → 취소 → 탈퇴하기
 *  - Enter는 제출하지 않고 키보드만 내린다(한글 조합 중에는 건드리지 않는다)
 *  - 리터럴 색이 없다
 *
 * 실행: cd jam-web && npx vitest run src/components/account/__tests__/WithdrawSheet.test.tsx
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isValidElement, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/ui/BottomSheet', () => ({
  default: ({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) => (
    <section data-sheet="">
      <h2>{title}</h2>
      <div data-scroll="">{children}</div>
      <footer>{footer}</footer>
    </section>
  ),
}))

import Button from '@/components/ui/Button'
import InlineNotice from '@/components/ui/InlineNotice'
import { Input } from '@ds/components/forms/Input'
import { d, t } from '@/lib/i18n'
import { ABUSE_LOG_RETENTION_MONTHS, CONFIRMATION_RETENTION_MONTHS } from '@/lib/account/retention'
import { WITHDRAW_CONFIRM_PHRASE, type AccountSummary } from '@/lib/account/withdraw-contract'
import WithdrawSheet, { WithdrawSheetView, type WithdrawSummaryState } from '../WithdrawSheet'

const noop = () => {}
const copy = d.withdrawSheet

const SUMMARY: AccountSummary = {
  activityBadgeCount: 12,
  checkinBadgeCount: 7,
  itemCount: 20,
  jamBalance: 340,
  pointBalance: 1200,
  stravaConnected: true,
}

interface ViewProps {
  summary: WithdrawSummaryState
  phrase: string
  phraseBlurred: boolean
  submitting: boolean
  errorMessage: string | null
  onClose: () => void
  onPhraseChange: (value: string) => void
  onPhraseBlur: () => void
  onConfirm: () => void
}

function props(overrides: Partial<ViewProps> = {}) {
  return {
    open: true,
    summary: { status: 'ready', summary: SUMMARY } as WithdrawSummaryState,
    phrase: '',
    phraseBlurred: false,
    submitting: false,
    errorMessage: null,
    onClose: noop,
    onPhraseChange: noop,
    onPhraseBlur: noop,
    onConfirm: noop,
    ...overrides,
  }
}

const markup = (overrides: Partial<ViewProps> = {}) => renderToStaticMarkup(<WithdrawSheetView {...props(overrides)} />)
const treeOf = (overrides: Partial<ViewProps> = {}) => WithdrawSheetView(props(overrides))

type El = React.ReactElement<Record<string, unknown>>

/** 엘리먼트 트리를 훑어 조건에 맞는 엘리먼트를 모두 모은다(자식뿐 아니라 footer 같은 prop도 따라간다). 함수 컴포넌트는 펼치지 않는다 */
function collect(node: ReactNode, predicate: (el: El) => boolean): El[] {
  const found: El[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!isValidElement(value)) return
    const el = value as El
    if (predicate(el)) found.push(el)
    for (const prop of Object.values(el.props)) visit(prop)
  }
  visit(node)
  return found
}

/** 함수 컴포넌트(`ConfirmPhraseField` 등)를 한 겹 펼쳐 안쪽 엘리먼트까지 훑는다. 훅이 없는 컴포넌트만 해당한다 */
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand)
  if (!isValidElement(node)) return node
  const el = node as El
  if (typeof el.type === 'function' && el.type !== Button && el.type !== Input && el.type !== InlineNotice) {
    const fn = el.type as (p: Record<string, unknown>) => ReactNode
    try {
      return expand(fn(el.props))
    } catch {
      return el // 훅을 쓰는 컴포넌트(RemovedSection)는 펼치지 않는다
    }
  }
  const children = el.props.children
  if (children === undefined) return el
  return { ...el, props: { ...el.props, children: expand(children as ReactNode) } } as El
}

/** 소스에서 주석 줄을 뺀 코드. 주석의 설명 문장이 검사에 걸리지 않게 한다 */
function codeOf(file: string): string {
  return readFileSync(path.resolve(__dirname, file), 'utf-8')
    .split('\n')
    .filter((line) => !/^\s*(\/\*\*?|\*|\/\/)/.test(line))
    .join('\n')
}

const footerButtons = (tree: ReactNode) => collect(tree, (el) => el.type === Button)
const inputOf = (tree: ReactNode) => collect(expand(tree), (el) => el.type === Input)[0]
const labelOf = (button: El) => String(button.props.children)

describe('WithdrawSheetView — 문구와 순서', () => {
  it('제목, 첫 문단, 묶음 라벨, 확인 문구 라벨을 d.* 문구 그대로 위에서 아래로 그린다', () => {
    const html = markup()
    const order = [
      copy.title,
      copy.intro,
      copy.removedLabel,
      copy.keptLabel,
      t(copy.confirmLabel, { phrase: WITHDRAW_CONFIRM_PHRASE }).replace(/"/g, '&quot;'),
    ].map((text) => {
      const index = html.indexOf(text)
      expect(index, text).toBeGreaterThanOrEqual(0)
      return index
    })
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // 입력칸은 라벨 뒤, 푸터 버튼은 입력칸 뒤
    const input = html.indexOf('<input')
    expect(input).toBeGreaterThan(order[order.length - 1])
    expect(html.indexOf(`>${copy.cancel}<`)).toBeGreaterThan(input)
    expect(html.indexOf(`>${copy.confirm}<`)).toBeGreaterThan(html.indexOf(`>${copy.cancel}<`))
  })

  it('«남는 것» 문단 둘 — 보관 개월 수는 retention.ts 상수에서 끼워 넣는다', () => {
    const html = markup()
    expect(html).toContain(
      `법에 따라 ${CONFIRMATION_RETENTION_MONTHS}개월, 부정 이용 탐지 기록은 ${ABUSE_LOG_RETENTION_MONTHS}개월 동안`
    )
    expect(html).toContain(copy.keptDrops)
    expect(html).not.toContain('{confirmMonths}')
    expect(html).not.toContain('{abuseMonths}')
  })

  it('전부 왼쪽 정렬이고 장식 아이콘·그라디언트·이모지가 없다', () => {
    const html = markup({ errorMessage: d.account.deleteFailed, phrase: 'x', phraseBlurred: true })
    expect(html).toContain('text-left')
    expect(html).not.toContain('text-center')
    expect(html).not.toContain('<svg')
    expect(html).not.toMatch(/gradient|bg-linear|bg-gradient/)
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('한국어 문단에 break-keep wrap-break-word text-pretty가 붙고, 행 값은 줄바꿈이 없다', () => {
    const html = markup()
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
    expect(html).toContain('text-pretty')
    expect(html).toMatch(/<dd class="[^"]*whitespace-nowrap/)
    expect(html).toMatch(/<dt class="[^"]*shrink-0/)
  })

  it('본문 가장자리는 제목과 같은 px-6이다', () => {
    expect(markup()).toContain('px-6 pb-6')
  })
})

describe('WithdrawSheetView — 요약 세 상태', () => {
  it('값이 오면 다섯 줄을 라벨 muted·값 foreground로 보인다', () => {
    const html = markup()
    for (const label of [copy.rowActivityBadges, copy.rowCheckinBadges, copy.rowItemBadges, copy.rowJam, copy.rowPoints]) {
      expect(html, label).toContain(`>${label}</dt>`)
    }
    expect(html).toContain('>12개</dd>')
    expect(html).toContain('>7개</dd>')
    expect(html).toContain('>20개</dd>')
    expect(html).toContain('>340</dd>')
    expect(html).toContain('>1,200 포인트</dd>')
    expect(html).toContain('text-muted')
    expect(html).not.toContain('aria-busy="true"')
  })

  it('0도 줄을 숨기지 않고 «0개»·«0 포인트»로 보인다', () => {
    const html = markup({
      summary: {
        status: 'ready',
        summary: { ...SUMMARY, activityBadgeCount: 0, checkinBadgeCount: 0, itemCount: 0, jamBalance: 0, pointBalance: 0, stravaConnected: false },
      },
    })
    expect(html.match(/<dt /g)).toHaveLength(5)
    expect(html.match(/>0개<\/dd>/g)).toHaveLength(3)
    expect(html).toContain('>0</dd>')
    expect(html).toContain('>0 포인트</dd>')
  })

  it('큰 수는 천 단위로 끊고 값은 한 줄이다', () => {
    const html = markup({
      summary: { status: 'ready', summary: { ...SUMMARY, pointBalance: 1234567, jamBalance: 98765 } },
    })
    expect(html).toContain('>1,234,567 포인트</dd>')
    expect(html).toContain('>98,765</dd>')
  })

  it('Strava 동기화 줄은 연결 중일 때만 보인다', () => {
    expect(markup()).toContain(copy.stravaSync)
    expect(markup({ summary: { status: 'ready', summary: { ...SUMMARY, stravaConnected: false } } })).not.toContain(copy.stravaSync)
  })

  it('읽는 동안은 스켈레톤 다섯 줄이고 aria-busy이며, 높이를 미리 잡는다 — 값 줄은 없다', () => {
    const html = markup({ summary: { status: 'loading' } })
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('t-skel-skeleton is-pulsing')
    expect(html).toContain('--skel-min-h:160px')
    expect(html.match(/h-6 w-24 rounded-lg bg-foreground\/15/g)).toHaveLength(5)
    expect(html).not.toContain('<dl')
    expect(html).not.toContain(copy.stravaSync)
    // 로딩 중에도 탈퇴는 막지 않는다: 확인 문구를 채우면 버튼이 열린다
    const [, confirm] = footerButtons(treeOf({ summary: { status: 'loading' }, phrase: WITHDRAW_CONFIRM_PHRASE }))
    expect(confirm.props.disabled).toBe(false)
  })

  it('읽기에 실패하면 오류 문구 없이 일반 문장 하나로 바꾼다 — 탈퇴는 그대로 된다', () => {
    const html = markup({ summary: { status: 'error' } })
    expect(html).toContain(copy.removedFallback)
    expect(html).not.toContain('<dl')
    expect(html).not.toContain(copy.stravaSync)
    expect(html).not.toContain(d.auth.errorGeneric)
    expect(html).not.toContain('role="status"')
    const [, confirm] = footerButtons(treeOf({ summary: { status: 'error' }, phrase: WITHDRAW_CONFIRM_PHRASE }))
    expect(confirm.props.disabled).toBe(false)
  })
})

describe('WithdrawSheetView — 확인 문구와 확정 버튼', () => {
  it('푸터는 [secondary 취소][danger 탈퇴하기] 두 버튼이다 — 같은 너비, 취소가 왼쪽', () => {
    const buttons = footerButtons(treeOf())
    expect(buttons).toHaveLength(2)
    const [cancel, confirm] = buttons
    expect(labelOf(cancel)).toBe(copy.cancel)
    expect(cancel.props.variant).toBe('secondary')
    expect(cancel.props.fullWidth).toBe(true)
    expect(labelOf(confirm)).toBe(copy.confirm)
    expect(confirm.props.variant).toBe('danger')
    expect(confirm.props.fullWidth).toBe(true)
    expect(cancel.props.className).toBe(confirm.props.className)
  })

  it.each([
    ['비어 있음', ''],
    ['일부만', '탈퇴합니'],
    ['공백만', '   '],
    ['다른 문구', '삭제합니다'],
  ])('%s이면 탈퇴하기는 disabled다', (_label, phrase) => {
    const [, confirm] = footerButtons(treeOf({ phrase }))
    expect(confirm.props.disabled).toBe(true)
  })

  it.each([
    ['정확히 같음', WITHDRAW_CONFIRM_PHRASE],
    ['앞뒤 공백', `  ${WITHDRAW_CONFIRM_PHRASE}  `],
    ['NFD로 붙여넣음', WITHDRAW_CONFIRM_PHRASE.normalize('NFD')],
  ])('%s이면 탈퇴하기가 활성화된다', (_label, phrase) => {
    const [, confirm] = footerButtons(treeOf({ phrase }))
    expect(confirm.props.disabled).toBe(false)
  })

  it('취소를 누르면 onClose가, 활성화된 탈퇴하기를 누르면 onConfirm이 불린다', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    const [cancel, confirm] = footerButtons(treeOf({ onClose, onConfirm, phrase: WITHDRAW_CONFIRM_PHRASE }))
    ;(cancel.props.onClick as () => void)()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    ;(confirm.props.onClick as () => void)()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('입력 중(blur 전)에는 불일치여도 오류색도 문구도 없다 — 한글 조합 중간 글자에 오류를 띄우지 않는다', () => {
    const html = markup({ phrase: '탈퇴합', phraseBlurred: false })
    expect(html).not.toContain('aria-invalid')
    expect(inputOf(treeOf({ phrase: '탈퇴합', phraseBlurred: false })).props.state).toBe('default')
    expect(html).not.toContain(t(copy.confirmMismatch, { phrase: WITHDRAW_CONFIRM_PHRASE }).replace(/"/g, '&quot;'))
  })

  it('blur했고 비어 있지 않고 불일치일 때만 오류 테두리와 한 문장 문구가 보인다', () => {
    const tree = treeOf({ phrase: '탈퇴합', phraseBlurred: true })
    expect(inputOf(tree).props.state).toBe('error')
    const html = markup({ phrase: '탈퇴합', phraseBlurred: true })
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain(t(copy.confirmMismatch, { phrase: WITHDRAW_CONFIRM_PHRASE }).replace(/"/g, '&quot;'))
  })

  it.each([
    ['blur했지만 비어 있음', '', true],
    ['blur했지만 공백만 있음', '   ', true],
    ['blur했고 일치함', WITHDRAW_CONFIRM_PHRASE, true],
  ])('%s: 오류 표시가 없다', (_label, phrase, phraseBlurred) => {
    const tree = treeOf({ phrase, phraseBlurred })
    expect(inputOf(tree).props.state).toBe('default')
    expect(markup({ phrase, phraseBlurred })).not.toContain('aria-invalid')
  })

  it('성공을 뜻하는 초록 상태를 쓰지 않는다 — 일치해도 default다', () => {
    for (const phrase of ['', '탈', WITHDRAW_CONFIRM_PHRASE]) {
      for (const phraseBlurred of [false, true]) {
        expect(inputOf(treeOf({ phrase, phraseBlurred })).props.state).not.toBe('success')
      }
    }
  })

  it('불일치 문구 자리는 평소에도 min-h-6로 높이를 잡고 입력칸의 aria-describedby로 이어진다', () => {
    const html = markup()
    expect(html).toContain('id="withdraw-confirm-hint"')
    expect(html).toMatch(/<p id="withdraw-confirm-hint"[^>]*min-h-6[^>]*><\/p>/)
    expect(html).toContain('aria-describedby="withdraw-confirm-hint"')
  })

  it('라벨은 입력칸과 htmlFor로 이어지고 입력칸에는 자리표시가 없다', () => {
    const html = markup()
    expect(html).toContain('for="withdraw-confirm-input"')
    expect(html).toContain('id="withdraw-confirm-input"')
    expect(html).toContain('placeholder=""')
    // 입력값은 그대로 보인다
    expect(markup({ phrase: '탈퇴합' })).toContain('value="탈퇴합"')
  })

  it('자동완성·자동수정·맞춤법 밑줄을 끄고 키보드 버튼은 «완료»다', () => {
    const html = markup()
    expect(html).toContain('autoComplete="off"')
    expect(html).toContain('autoCorrect="off"')
    expect(html).toContain('autoCapitalize="none"')
    expect(html).toContain('spellCheck="false"')
    expect(html).toContain('enterKeyHint="done"')
  })

  it('입력이 바뀌면 onPhraseChange에 값이 넘어가고, 입력칸을 벗어나면 onPhraseBlur가 불린다', () => {
    const onPhraseChange = vi.fn()
    const onPhraseBlur = vi.fn()
    const input = inputOf(treeOf({ onPhraseChange, onPhraseBlur }))
    ;(input.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: '탈퇴' } })
    expect(onPhraseChange).toHaveBeenCalledWith('탈퇴')
    ;(input.props.onBlur as () => void)()
    expect(onPhraseBlur).toHaveBeenCalledTimes(1)
  })

  it('Enter는 제출하지 않고 키보드만 내린다 — 한글 조합 중의 Enter와 다른 키는 건드리지 않는다', () => {
    const onConfirm = vi.fn()
    const onKeyDown = inputOf(treeOf({ onConfirm, phrase: WITHDRAW_CONFIRM_PHRASE })).props.onKeyDown as (e: unknown) => void
    const make = (key: string, isComposing: boolean) => ({
      key,
      nativeEvent: { isComposing },
      preventDefault: vi.fn(),
      currentTarget: { blur: vi.fn() },
    })

    const enter = make('Enter', false)
    onKeyDown(enter)
    expect(enter.currentTarget.blur).toHaveBeenCalledTimes(1)
    expect(enter.preventDefault).toHaveBeenCalledTimes(1)

    const composing = make('Enter', true)
    onKeyDown(composing)
    expect(composing.currentTarget.blur).not.toHaveBeenCalled()

    const other = make('a', false)
    onKeyDown(other)
    expect(other.currentTarget.blur).not.toHaveBeenCalled()

    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('WithdrawSheetView — 제출 중과 실패', () => {
  it('제출 중에는 취소가 막히고 탈퇴하기는 loading이며 라벨이 «탈퇴하는 중»이다', () => {
    const tree = treeOf({ submitting: true, phrase: WITHDRAW_CONFIRM_PHRASE })
    const [cancel, confirm] = footerButtons(tree)
    expect(cancel.props.disabled).toBe(true)
    expect(confirm.props.loading).toBe(true)
    expect(labelOf(confirm)).toBe(copy.confirming)
    expect(markup({ submitting: true, phrase: WITHDRAW_CONFIRM_PHRASE })).toContain(copy.confirming)
  })

  it('제출 중에는 입력칸도 막힌다', () => {
    expect(inputOf(treeOf({ submitting: true })).props.disabled).toBe(true)
    expect(inputOf(treeOf({ submitting: false })).props.disabled).toBe(false)
  })

  it('제출 중에는 시트 닫기(바깥 탭·아래로 끌기·Escape)가 막히고, 아닐 때는 onClose로 이어진다', () => {
    const onClose = vi.fn()
    const submitting = treeOf({ submitting: true, onClose })
    ;(submitting.props.onClose as () => void)()
    expect(onClose).not.toHaveBeenCalled()

    const idle = treeOf({ submitting: false, onClose })
    ;(idle.props.onClose as () => void)()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('시트는 compact이고 탭바를 숨기는 화면용 safe-area 여백을 쓴다', () => {
    const tree = treeOf()
    expect(tree.props.detent).toBe('compact')
    expect(tree.props.footerBottomInset).toBe('safe-area')
    expect(tree.props.title).toBe(copy.title)
  })

  it('실패하면 푸터 맨 위에 InlineNotice 한 블록이 보이고, 입력값은 그대로다', () => {
    const tree = treeOf({ errorMessage: d.account.deleteFailed, phrase: WITHDRAW_CONFIRM_PHRASE })
    const notices = collect(tree, (el) => el.type === InlineNotice)
    expect(notices).toHaveLength(1)
    expect(notices[0].props.children).toBe(d.account.deleteFailed)
    expect(inputOf(tree).props.value).toBe(WITHDRAW_CONFIRM_PHRASE)

    const html = markup({ errorMessage: d.account.deleteFailed, phrase: WITHDRAW_CONFIRM_PHRASE })
    expect(html).toContain(d.account.deleteFailed)
    expect(html.indexOf('role="status"')).toBeLessThan(html.indexOf(`>${copy.cancel}<`))
  })

  it('실패 뒤에는 입력칸과 버튼이 다시 활성화된다', () => {
    const tree = treeOf({ errorMessage: d.account.deleteFailed, phrase: WITHDRAW_CONFIRM_PHRASE, submitting: false })
    const [cancel, confirm] = footerButtons(tree)
    expect(inputOf(tree).props.disabled).toBe(false)
    expect(cancel.props.disabled).toBe(false)
    expect(confirm.props.disabled).toBe(false)
    expect(confirm.props.loading).toBe(false)
  })

  it('실패 안내가 없으면 InlineNotice를 그리지 않는다', () => {
    expect(collect(treeOf(), (el) => el.type === InlineNotice)).toHaveLength(0)
    expect(markup()).not.toContain('role="status"')
  })
})

describe('WithdrawSheetView — 포커스 순서', () => {
  it('첫 포커스 요소는 입력칸이 아니라 본문 래퍼다 — tabindex·role="region"·aria-label이 입력칸보다 앞에 있다', () => {
    const html = markup()
    const region = html.indexOf('tabindex="0"')
    expect(region).toBeGreaterThanOrEqual(0)
    expect(html).toContain(`role="region" aria-label="${copy.title}"`)
    // 래퍼보다 앞에 포커스 가능한 요소가 없다(BottomSheet의 FOCUSABLE_SELECTOR 대상)
    const before = html.slice(0, region)
    expect(before).not.toMatch(/<button|<input|<select|<textarea|href=/)
    expect(region).toBeLessThan(html.indexOf('<input'))
  })

  it('Tab 순서는 본문 → 입력칸 → 취소 → 탈퇴하기다', () => {
    const html = markup({ phrase: WITHDRAW_CONFIRM_PHRASE })
    const stops = [
      html.indexOf('tabindex="0"'),
      html.indexOf('<input'),
      html.indexOf(`>${copy.cancel}<`),
      html.indexOf(`>${copy.confirm}<`),
    ]
    expect(stops.every((i) => i >= 0)).toBe(true)
    expect([...stops].sort((a, b) => a - b)).toEqual(stops)
  })
})

describe('WithdrawSheet — 컨테이너', () => {
  it('열린 채로 처음 그려지면 요약을 읽는 중(스켈레톤)이고 입력칸은 비어 있으며 탈퇴하기는 막혀 있다', () => {
    const html = renderToStaticMarkup(<WithdrawSheet open onClose={noop} />)
    expect(html).toContain(copy.title)
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('value=""')
    expect(html).toMatch(/disabled=""[^>]*>[^<]*(<span[^>]*><\/span>)?탈퇴하기/)
    expect(html).not.toContain('role="status"')
  })

  it('시트가 열려 있는 동안 탭바를 숨기고(pushTabBarHidden), 열릴 때마다 요약을 새로 읽는다', () => {
    const code = codeOf('../WithdrawSheet.tsx')
    expect(code).toMatch(/useEffect\(\(\) => \{\s*if \(!open\) return\s*return pushTabBarHidden\(\)\s*\}, \[open\]\)/)
    expect(code).toMatch(/useEffect\(\(\) => \{\s*if \(!open\) return\s*const controller = new AbortController\(\)/)
    // 성공 뒤 이동은 router.push가 아니라 window.location.replace다
    expect(code).toContain('window.location.replace(WITHDRAWN_LOGIN_PATH)')
    expect(code).not.toContain('router.push')
  })
})

describe('WithdrawSheet — 토큰만 쓴다', () => {
  it('리터럴 색(#, rgb, 흰/검정 유틸리티)과 빨간 글자가 없다', () => {
    const code = codeOf('../WithdrawSheet.tsx')
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(code).not.toMatch(/rgba?\(/)
    expect(code).not.toMatch(/text-white|bg-black|bg-white|border-white|text-red|bg-red|text-danger|text-foreground\/[0-9]/)
    // 위험색은 버튼 변형과 Input state로만 쓴다(직접 적은 danger 클래스가 없다)
    expect(code).not.toMatch(/bg-danger|border-danger/)
  })
})
