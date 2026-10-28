/**
 * 컬렉션 상세의 «모두 해제하기» 확인 시트 (티켓 20261028_1420, 채원 사전 판정 2026-10-28)
 *
 * - 겉모습(`UnslotAllSheetView`): 제목, 본문 1~3줄(등급이 정해졌으면 등급 줄, 완성 컬렉션이면 완성 기록 줄), 취소(secondary)와 확정(primary main) 한 쌍이
 *   같은 폭·같은 클래스, 제출 중 상태(확정 loading·«해제하는 중», 취소 disabled, 시트 닫기 막힘), 취소는 닫기만 한다
 * - 안내: 푸터 맨 위 InlineNotice 한 블록이고, «인벤토리 보기» 링크(`/inventory`)는 빈칸이 모자란 안내에만 붙는다. 안내가 보여도 확정은 켜져 있다
 * - 흐름(`runUnslotAll`): 성공이면 `onSuccess`, 빈칸 부족이면 링크가 있는 안내, 그 밖의 실패면 링크 없는 안내, 진행 중 중복 탭은 서버를 한 번만 부른다
 * - 응답 해석(`toUnslotAllOutcome`): 409와 `code`로만 빈칸 부족을 가른다
 *
 * 저장소에 jsdom이 없어 (1) 서버 렌더(`renderToStaticMarkup`)로 문구·클래스를 보고, (2) 훅이 없는 겉모습 컴포넌트가 돌려주는 엘리먼트 트리에서
 * 버튼의 `onClick`을 꺼내 눌러 본다. BottomSheet는 SSR에서 아무것도 그리지 않아(마운트 게이트) 시험에서는 자식·푸터를 그대로 내보내는 대역으로 바꾼다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/collections/[id]/__tests__/UnslotAllSheet.test.tsx"
 */
import { isValidElement, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/ui/BottomSheet', () => ({
  default: ({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) => (
    <section data-sheet="">
      <h2>{title}</h2>
      {children}
      <footer>{footer}</footer>
    </section>
  ),
}))

import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import { d } from '@/lib/i18n'
import { INVENTORY_FULL_CODE } from '@/lib/inventory/locked-item-block'
import {
  UnslotAllSheetView,
  runUnslotAll,
  toUnslotAllOutcome,
  type UnslotAllNotice,
  type UnslotAllOutcome,
} from '../UnslotAllSheet'

const copy = d.itembooks.unslotAll

/** 엘리먼트 트리를 훑어 조건에 맞는 엘리먼트를 모두 모은다(자식뿐 아니라 footer 같은 prop도 따라간다) */
function collect(node: ReactNode, predicate: (el: React.ReactElement<Record<string, unknown>>) => boolean) {
  const found: React.ReactElement<Record<string, unknown>>[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!isValidElement(value)) return
    const el = value as React.ReactElement<Record<string, unknown>>
    if (predicate(el)) found.push(el)
    for (const prop of Object.values(el.props)) visit(prop)
  }
  visit(node)
  return found
}

const buttonsOf = (tree: ReactNode) => collect(tree, (el) => el.type === Button)
const labelOf = (button: React.ReactElement<Record<string, unknown>>) => String(button.props.children)

const noop = () => {}

interface ViewOptions {
  open?: boolean
  submitting?: boolean
  tierFixed?: boolean
  completed?: boolean
  notice?: UnslotAllNotice | null
  onClose?: () => void
  onConfirm?: () => void
}

function viewElement(options: ViewOptions = {}) {
  return UnslotAllSheetView({
    open: true,
    submitting: false,
    tierFixed: false,
    completed: false,
    notice: null,
    onClose: noop,
    onConfirm: noop,
    ...options,
  })
}

const markup = (options: ViewOptions = {}) =>
  renderToStaticMarkup(
    <UnslotAllSheetView
      open
      submitting={false}
      tierFixed={false}
      completed={false}
      notice={null}
      onClose={noop}
      onConfirm={noop}
      {...options}
    />,
  )

describe('UnslotAllSheetView — 문구와 본문', () => {
  it('제목과 첫 본문은 항상 보이고, 등급·완성 줄은 조건이 없으면 보이지 않는다', () => {
    const html = markup()

    expect(html).toContain('장착한 배지를 모두 해제할까요?')
    expect(html).toContain('이 컬렉션에 장착한 배지가 모두 인벤토리로 돌아와요.')
    expect(html).not.toContain(copy.bodyTier)
    expect(html).not.toContain(copy.bodyCompleted)
    expect(html.match(/<p /g)).toHaveLength(1)
  })

  it('등급이 정해졌으면(tierFixed) 등급 줄이, 완성한 컬렉션이면(completed) 완성 기록 줄이 붙는다 — 1~3줄', () => {
    expect(markup({ tierFixed: true }).match(/<p /g)).toHaveLength(2)
    expect(markup({ tierFixed: true })).toContain('컬렉션 등급도 풀려서 다른 등급으로 다시 정할 수 있어요.')
    expect(markup({ completed: true }).match(/<p /g)).toHaveLength(2)
    expect(markup({ completed: true })).toContain('완성 기록은 그대로 남아요.')

    const html = markup({ tierFixed: true, completed: true })
    expect(html.match(/<p /g)).toHaveLength(3)
    // 순서: 인벤토리로 돌아옴 → 등급 풀림 → 완성 기록
    expect(html.indexOf(copy.bodyReturn)).toBeLessThan(html.indexOf(copy.bodyTier))
    expect(html.indexOf(copy.bodyTier)).toBeLessThan(html.indexOf(copy.bodyCompleted))
  })

  it('본문은 가운데 정렬이 아니라 왼쪽 정렬이고 한국어 줄바꿈 클래스를 갖는다', () => {
    const html = markup({ tierFixed: true, completed: true })

    expect(html).toContain('text-left')
    expect(html).not.toContain('text-center')
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
    // 제목과 같은 가장자리(px-6)
    expect(html).toContain('px-6')
  })

  it('장착 개수 숫자나 «슬롯·개체·소각»을 문구에 쓰지 않고 느낌표·마침표 없는 제목이다', () => {
    const texts = [
      copy.title,
      copy.bodyReturn,
      copy.bodyTier,
      copy.bodyCompleted,
      copy.cancel,
      copy.confirm,
      copy.confirming,
      copy.successToast,
      copy.inventoryLink,
      copy.shortNotice,
      copy.failed,
    ]
    for (const text of texts) {
      expect(text).not.toMatch(/\d/)
      expect(text).not.toMatch(/슬롯|개체|소각/)
      expect(text).not.toContain('!')
    }
    expect(copy.title.endsWith('.')).toBe(false)
  })
})

describe('UnslotAllSheetView — 버튼', () => {
  it('취소(secondary)와 확정(primary main) 한 쌍이 같은 폭·같은 클래스다', () => {
    const [cancel, confirm, ...rest] = buttonsOf(viewElement())

    expect(rest).toEqual([])
    expect(labelOf(cancel)).toBe('취소')
    expect(cancel.props.variant).toBe('secondary')
    expect(labelOf(confirm)).toBe('모두 해제하기')
    expect(confirm.props.variant).toBe('primary')
    expect(confirm.props.surface).toBe('main')
    // danger가 없다 — 배지는 인벤토리로 돌아오고 완성 기록도 남는다
    expect(buttonsOf(viewElement()).some((b) => b.props.variant === 'danger')).toBe(false)
    for (const button of [cancel, confirm]) {
      expect(button.props.fullWidth).toBe(true)
      expect(button.props.className).toBe('px-3! whitespace-nowrap')
    }
  })

  it('기본 상태에서는 두 버튼이 모두 켜져 있다', () => {
    const [cancel, confirm] = buttonsOf(viewElement())

    expect(cancel.props.disabled).toBe(false)
    expect(confirm.props.loading).toBe(false)
    expect(confirm.props.disabled).toBeUndefined()
  })

  it('취소를 누르면 닫기만 한다 — 확정 핸들러는 부르지 않는다', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    const [cancel] = buttonsOf(viewElement({ onClose, onConfirm }))

    ;(cancel.props.onClick as () => void)()

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('확정을 누르면 onConfirm을 부른다', () => {
    const onConfirm = vi.fn()
    const [, confirm] = buttonsOf(viewElement({ onConfirm }))

    ;(confirm.props.onClick as () => void)()

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('제출 중이면 확정이 loading이고 라벨이 «해제하는 중»이며 취소가 막힌다', () => {
    const [cancel, confirm] = buttonsOf(viewElement({ submitting: true }))

    expect(confirm.props.loading).toBe(true)
    expect(labelOf(confirm)).toBe('해제하는 중')
    expect(cancel.props.disabled).toBe(true)
  })

  it('제출 중에는 시트 닫기(바깥 탭·드래그·Escape)가 아무 일도 하지 않는다', () => {
    const onClose = vi.fn()

    const submitting = collect(viewElement({ submitting: true, onClose }), (el) => el.type === BottomSheet)[0]
    ;(submitting.props.onClose as () => void)()
    expect(onClose).not.toHaveBeenCalled()

    const idle = collect(viewElement({ submitting: false, onClose }), (el) => el.type === BottomSheet)[0]
    ;(idle.props.onClose as () => void)()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('UnslotAllSheetView — 안내', () => {
  it('안내가 없으면 InlineNotice와 링크가 없다', () => {
    const html = markup()

    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('href="/inventory"')
  })

  it('빈칸이 모자란 안내(inventoryLink)는 문구와 «인벤토리 보기» 링크(/inventory, 44px)를 푸터 맨 위에 보인다', () => {
    const html = markup({ notice: { message: copy.shortNotice, inventoryLink: true } })

    expect(html).toContain('role="status"')
    expect(html).toContain('인벤토리 빈칸이 모자라서 해제하지 못했어요')
    expect(html).toContain('href="/inventory"')
    expect(html).toContain('>인벤토리 보기<')
    expect(html).toContain('min-h-11')
    // 안내가 버튼 한 쌍보다 위에 있다
    expect(html.indexOf('role="status"')).toBeLessThan(html.indexOf('>취소<'))
  })

  it('일반 실패 안내는 링크가 없다', () => {
    const html = markup({ notice: { message: copy.failed, inventoryLink: false } })

    expect(html).toContain('해제하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    expect(html).not.toContain('href="/inventory"')
    expect(html).not.toContain('인벤토리 보기')
  })

  it('안내가 보여도 확정은 켜져 있다 — 다시 누르면 재시도다', () => {
    const [cancel, confirm] = buttonsOf(viewElement({ notice: { message: copy.shortNotice, inventoryLink: true } }))

    expect(cancel.props.disabled).toBe(false)
    expect(confirm.props.loading).toBe(false)
    expect(confirm.props.disabled).toBeUndefined()
  })
})

describe('runUnslotAll — 확정을 눌렀을 때의 흐름', () => {
  function deps(request: () => Promise<UnslotAllOutcome>) {
    return {
      inFlight: { current: false },
      request,
      setNotice: vi.fn<(notice: UnslotAllNotice | null) => void>(),
      onSuccess: vi.fn(),
    }
  }

  it('성공이면 onSuccess를 한 번 부르고 안내를 세우지 않는다', async () => {
    const d1 = deps(async () => ({ kind: 'ok' }))

    await runUnslotAll(d1)

    expect(d1.onSuccess).toHaveBeenCalledTimes(1)
    expect(d1.setNotice).not.toHaveBeenCalled()
  })

  it('빈칸 부족이면 시트를 닫지 않고 링크가 있는 안내를 세운다', async () => {
    const d1 = deps(async () => ({ kind: 'full', message: copy.shortNotice }))

    await runUnslotAll(d1)

    expect(d1.onSuccess).not.toHaveBeenCalled()
    expect(d1.setNotice).toHaveBeenCalledWith({ message: copy.shortNotice, inventoryLink: true })
  })

  it('그 밖의 실패면 링크가 없는 안내를 세운다', async () => {
    const d1 = deps(async () => ({ kind: 'error', message: copy.failed }))

    await runUnslotAll(d1)

    expect(d1.onSuccess).not.toHaveBeenCalled()
    expect(d1.setNotice).toHaveBeenCalledWith({ message: copy.failed, inventoryLink: false })
  })

  it('진행 중에 다시 누르면 서버를 부르지 않는다(중복 탭 막기)', async () => {
    let release!: (outcome: UnslotAllOutcome) => void
    const request = vi.fn(() => new Promise<UnslotAllOutcome>((resolve) => (release = resolve)))
    const d1 = deps(request)

    const first = runUnslotAll(d1)
    await runUnslotAll(d1)
    expect(request).toHaveBeenCalledTimes(1)

    release({ kind: 'ok' })
    await first
    expect(d1.onSuccess).toHaveBeenCalledTimes(1)
  })

  it('끝나면 다시 누를 수 있다 — 실패 뒤 재시도가 서버를 다시 부른다', async () => {
    const request = vi
      .fn<() => Promise<UnslotAllOutcome>>()
      .mockResolvedValueOnce({ kind: 'error', message: copy.failed })
      .mockResolvedValueOnce({ kind: 'ok' })
    const d1 = deps(request)

    await runUnslotAll(d1)
    expect(d1.inFlight.current).toBe(false)
    await runUnslotAll(d1)

    expect(request).toHaveBeenCalledTimes(2)
    expect(d1.onSuccess).toHaveBeenCalledTimes(1)
  })
})

describe('toUnslotAllOutcome — 응답 해석', () => {
  it('성공 응답은 ok다', () => {
    expect(toUnslotAllOutcome(true, 200, { ok: true, released: 3, remaining: 0 })).toEqual({ kind: 'ok' })
    // 장착이 이미 없던 경우(해제 0개)도 성공과 같다
    expect(toUnslotAllOutcome(true, 200, { ok: true, released: 0, remaining: 0 })).toEqual({ kind: 'ok' })
  })

  it('409와 code(inventory_full)면 서버 문구 그대로 빈칸 부족이다 — 일부 해제 문구도 같다', () => {
    const partial = '2개를 해제했지만 인벤토리 빈칸이 모자라 나머지 2개는 장착된 채로 남았어요.'

    expect(toUnslotAllOutcome(false, 409, { error: partial, released: 2, remaining: 2, code: INVENTORY_FULL_CODE })).toEqual({
      kind: 'full',
      message: partial,
    })
  })

  it('빈칸 부족인데 문구가 없으면 기본 문구로 채운다', () => {
    expect(toUnslotAllOutcome(false, 409, { code: INVENTORY_FULL_CODE })).toEqual({ kind: 'full', message: copy.shortNotice })
  })

  it('code가 없는 409나 다른 상태는 일반 실패다', () => {
    expect(toUnslotAllOutcome(false, 409, { error: '다른 거절' })).toEqual({ kind: 'error', message: '다른 거절' })
    expect(toUnslotAllOutcome(false, 500, { error: copy.failed, released: 1, remaining: 2 })).toEqual({
      kind: 'error',
      message: copy.failed,
    })
    // 상태가 409가 아니면 code가 있어도 빈칸 부족으로 읽지 않는다
    expect(toUnslotAllOutcome(false, 500, { code: INVENTORY_FULL_CODE })).toEqual({ kind: 'error', message: copy.failed })
  })

  it('본문을 읽지 못했으면 일반 실패 기본 문구다', () => {
    expect(toUnslotAllOutcome(false, 502, {})).toEqual({ kind: 'error', message: copy.failed })
    expect(toUnslotAllOutcome(false, 502, null)).toEqual({ kind: 'error', message: copy.failed })
    expect(toUnslotAllOutcome(false, 502, 'Bad Gateway')).toEqual({ kind: 'error', message: copy.failed })
  })
})
