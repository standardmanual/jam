/**
 * Strava 동기화 시트 두 개 (티켓 20261017_1422 2회, 채원 사전 판정 2026-10-17 → 20261021_1249 4회 2026-10-22)
 *
 * - 끊기 확인 시트: 문구, 버튼(취소 secondary · 확정 danger), 제출 중 상태(두 버튼 막힘·라벨·시트 닫기 막힘)
 * - 중복 안내 시트 offer 모양: 문구 3문장(왼쪽 정렬, px-6), 버튼은 «취소»(secondary)와 «그래도 연결하기»(danger) 하나씩이고 같은 폭,
 *   확인 문구 입력칸이 없다, 취소·시트 닫기가 같은 결과(닫기)이고 서버 호출이 없다, 제출 중에는 확정이 loading(«연결하는 중»)이고
 *   취소와 시트 닫기가 막힌다, 실패 안내(retry·restart)는 푸터 맨 위 한 블록이고 restart에서는 확정이 disabled이며 «Strava 다시 동기화하기»가 붙는다
 * - 중복 안내 시트 blocked 모양: 문구 2문장, 버튼은 «닫기»(secondary)와 «문의하기»(primary main)뿐이고 danger가 없다
 *
 * 저장소에 jsdom이 없어 (1) 서버 렌더(`renderToStaticMarkup`)로 문구·버튼 구조를 보고, (2) 훅이 없는 겉모습
 * 컴포넌트가 돌려주는 엘리먼트 트리에서 버튼의 `onClick`을 꺼내 눌러 본다. BottomSheet는 SSR에서 아무것도 그리지
 * 않아(마운트 게이트) 시험에서는 자식·푸터를 그대로 내보내는 대역으로 바꾼다.
 *
 * 실행: cd jam-web && npx vitest run src/components/strava/StravaSheets.test.tsx
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isValidElement, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

import Button from '@/components/ui/Button'
import InlineNotice from '@/components/ui/InlineNotice'
import { StravaDisconnectSheetView } from './StravaDisconnectSheet'
import { StravaDuplicateSheetView } from './StravaDuplicateSheet'
import { d } from '@/lib/i18n'

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

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('StravaDisconnectSheetView — 끊기 확인 시트', () => {
  const noop = () => {}
  const markup = (submitting: boolean) =>
    renderToStaticMarkup(<StravaDisconnectSheetView open submitting={submitting} onClose={noop} onConfirm={noop} />)

  it('제목과 본문 세 문장을 d.* 문구 그대로 그린다', () => {
    const html = markup(false)
    const copy = d.stravaConnection.disconnectSheet
    expect(html).toContain(copy.title)
    expect(copy.body).toHaveLength(3)
    for (const line of copy.body) expect(html).toContain(line)
  })

  it('본문은 가운데 정렬이 아니라 왼쪽 정렬이고 한국어 줄바꿈 클래스를 갖는다', () => {
    const html = markup(false)
    expect(html).toContain('text-left')
    expect(html).not.toContain('text-center')
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
  })

  it('footer는 [secondary 취소][danger 동기화 끊기] 두 버튼이다 — 취소가 왼쪽, 같은 너비', () => {
    const tree = StravaDisconnectSheetView({ open: true, submitting: false, onClose: noop, onConfirm: noop })
    const [cancel, confirm] = buttonsOf(tree)
    expect(buttonsOf(tree)).toHaveLength(2)
    expect(labelOf(cancel)).toBe(d.stravaConnection.disconnectSheet.cancel)
    expect(cancel.props.variant).toBe('secondary')
    expect(cancel.props.fullWidth).toBe(true)
    expect(labelOf(confirm)).toBe(d.stravaConnection.disconnectSheet.confirm)
    expect(confirm.props.variant).toBe('danger')
    expect(confirm.props.fullWidth).toBe(true)
  })

  it('취소를 누르면 onClose가, 확정을 누르면 onConfirm이 불린다', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    const tree = StravaDisconnectSheetView({ open: true, submitting: false, onClose, onConfirm })
    const [cancel, confirm] = buttonsOf(tree)
    ;(cancel.props.onClick as () => void)()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    ;(confirm.props.onClick as () => void)()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('제출 중에는 취소가 막히고 확정 버튼이 loading이며 라벨이 «동기화 끊는 중»이다', () => {
    const tree = StravaDisconnectSheetView({ open: true, submitting: true, onClose: noop, onConfirm: noop })
    const [cancel, confirm] = buttonsOf(tree)
    expect(cancel.props.disabled).toBe(true)
    expect(confirm.props.loading).toBe(true)
    expect(labelOf(confirm)).toBe(d.stravaConnection.disconnectSheet.confirming)
    expect(markup(true)).toContain(d.stravaConnection.disconnectSheet.confirming)
  })

  it('제출 중에는 시트 닫기(바깥 탭·아래로 끌기·Escape)가 막히고, 아닐 때는 onClose로 이어진다', () => {
    const onClose = vi.fn()
    const submitting = StravaDisconnectSheetView({ open: true, submitting: true, onClose, onConfirm: noop })
    ;(submitting.props.onClose as () => void)()
    expect(onClose).not.toHaveBeenCalled()

    const idle = StravaDisconnectSheetView({ open: true, submitting: false, onClose, onConfirm: noop })
    ;(idle.props.onClose as () => void)()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('StravaDuplicateSheetView — 중복 연결 안내 시트', () => {
  const copy = d.stravaConnection.duplicateSheet
  const noop = () => {}
  type ViewProps = Parameters<typeof StravaDuplicateSheetView>[0]
  const props = (overrides: Partial<ViewProps> = {}): ViewProps => ({
    open: true,
    mode: 'offer',
    submitting: false,
    notice: null,
    onClose: noop,
    onConfirm: noop,
    onInquire: noop,
    onRestart: noop,
    ...overrides,
  })
  const markup = (overrides: Partial<ViewProps> = {}) => renderToStaticMarkup(<StravaDuplicateSheetView {...props(overrides)} />)
  const treeOf = (overrides: Partial<ViewProps> = {}) => StravaDuplicateSheetView(props(overrides))
  const noticesOf = (tree: ReactNode) => collect(tree, (el) => el.type === InlineNotice)

  describe('offer 모양 (기존 계정이 일반·정상)', () => {
    it('제목과 본문 3문장을 d.* 문구 그대로 그린다 — 문장마다 단락이고 왼쪽 정렬이며 제목과 같은 px-6이다', () => {
      const html = markup()
      expect(html).toContain(copy.title)
      expect(copy.offerBody).toHaveLength(3)
      for (const line of copy.offerBody) expect(html).toContain(`>${line}</p>`)
      expect(html).toContain('text-left')
      expect(html).not.toContain('text-center')
      expect(html).toContain('break-keep')
      expect(html).toContain('wrap-break-word')
      expect(html).toContain('px-6')
    })

    it('footer는 [secondary 취소][danger 그래도 연결하기] 두 버튼이고 같은 폭이며 라벨이 한 줄로 유지된다', () => {
      const buttons = buttonsOf(treeOf())
      expect(buttons).toHaveLength(2)
      const [cancel, confirm] = buttons
      expect(labelOf(cancel)).toBe(copy.cancel)
      expect(cancel.props.variant).toBe('secondary')
      expect(cancel.props.fullWidth).toBe(true)
      expect(labelOf(confirm)).toBe(copy.confirm)
      expect(labelOf(confirm)).toBe('그래도 연결하기')
      expect(confirm.props.variant).toBe('danger')
      expect(confirm.props.fullWidth).toBe(true)
      for (const button of buttons) expect(String(button.props.className)).toContain('whitespace-nowrap')
      // danger는 확정 버튼 하나뿐이다
      expect(buttons.filter((b) => b.props.variant === 'danger')).toHaveLength(1)
    })

    it('확인 문구 입력칸과 기존 계정 정보 칸이 없다 — 두 번째 버튼 누름이 확인이다', () => {
      const html = markup()
      expect(html).not.toContain('<input')
      expect(html).not.toContain('<textarea')
      expect(html).not.toContain('<img')
    })

    it('«취소»를 누르면 닫히고 서버 호출은 없다 — 시트 닫기(바깥 탭·Escape)도 같은 결과다', () => {
      const onClose = vi.fn()
      const onConfirm = vi.fn()
      const tree = treeOf({ onClose, onConfirm })
      ;(buttonsOf(tree)[0].props.onClick as () => void)()
      expect(onClose).toHaveBeenCalledTimes(1)
      ;(tree.props.onClose as () => void)()
      expect(onClose).toHaveBeenCalledTimes(2)
      expect(onConfirm).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('«그래도 연결하기»를 누르면 onConfirm이 불리고 닫히지는 않는다', () => {
      const onClose = vi.fn()
      const onConfirm = vi.fn()
      const tree = treeOf({ onClose, onConfirm })
      ;(buttonsOf(tree)[1].props.onClick as () => void)()
      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onClose).not.toHaveBeenCalled()
    })

    it('제출 중에는 취소가 막히고 확정 버튼이 loading이며 라벨이 «연결하는 중»이다', () => {
      const tree = treeOf({ submitting: true })
      const [cancel, confirm] = buttonsOf(tree)
      expect(cancel.props.disabled).toBe(true)
      expect(confirm.props.loading).toBe(true)
      expect(labelOf(confirm)).toBe(copy.confirming)
      expect(labelOf(confirm)).toBe('연결하는 중')
      expect(markup({ submitting: true })).toContain(copy.confirming)
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

    it('실패 안내가 없으면 InlineNotice가 없고 두 버튼이 모두 켜져 있다', () => {
      const tree = treeOf()
      expect(noticesOf(tree)).toHaveLength(0)
      const [cancel, confirm] = buttonsOf(tree)
      expect(cancel.props.disabled).toBeFalsy()
      expect(confirm.props.disabled).toBeFalsy()
      expect(confirm.props.loading).toBeFalsy()
    })

    it('retry 안내는 푸터 맨 위 InlineNotice 한 블록이고 확정 버튼은 그대로 켜져 있으며 다시 동기화 버튼이 없다', () => {
      const message = d.stravaConnection.replaceResult.retry
      const tree = treeOf({ notice: { message, next: 'retry' } })

      const notices = noticesOf(tree)
      expect(notices).toHaveLength(1)
      expect(notices[0].props.children).toBe(message)
      expect(notices[0].props.action).toBeUndefined()
      // 푸터 맨 위: 푸터 래퍼의 첫 자식이 InlineNotice다
      const footer = (tree.props as { footer: React.ReactElement<{ children: ReactNode[] }> }).footer
      expect((footer.props.children as ReactNode[])[0]).toBe(notices[0])

      const buttons = buttonsOf(tree)
      expect(buttons).toHaveLength(2)
      expect(buttons[1].props.disabled).toBeFalsy()
      expect(markup({ notice: { message, next: 'retry' } })).toContain(message)
    })

    it('restart 안내는 «Strava 다시 동기화하기» outline 버튼을 붙이고 «그래도 연결하기»를 disabled로 만든다', () => {
      const onRestart = vi.fn()
      const message = d.stravaConnection.replaceResult.restart
      const tree = treeOf({ notice: { message, next: 'restart' }, onRestart })

      const [notice] = noticesOf(tree)
      const actionButtons = buttonsOf(notice.props.action as ReactNode)
      expect(actionButtons).toHaveLength(1)
      expect(labelOf(actionButtons[0])).toBe(d.stravaConnection.settings.reconnectButton)
      expect(actionButtons[0].props.variant).toBe('outline')
      ;(actionButtons[0].props.onClick as () => void)()
      expect(onRestart).toHaveBeenCalledTimes(1)

      const confirm = buttonsOf(tree).find((b) => b.props.variant === 'danger')!
      expect(confirm.props.disabled).toBe(true)
    })

    it('실패 안내에 오류색·경고 아이콘·애니메이션 클래스가 없다', () => {
      const html = markup({ notice: { message: d.stravaConnection.replaceResult.retry, next: 'retry' } })
      expect(html).not.toMatch(/animate-|<svg|text-danger/)
    })
  })

  describe('blocked 모양 (기존 계정이 어드민이거나 이용 정지 중)', () => {
    it('제목과 본문 2문장을 그리고 막힌 까닭(어드민·이용 정지)을 쓰지 않는다', () => {
      const html = markup({ mode: 'blocked' })
      expect(html).toContain(copy.title)
      expect(copy.blockedBody).toHaveLength(2)
      for (const line of copy.blockedBody) expect(html).toContain(`>${line}</p>`)
      for (const line of copy.offerBody.slice(1)) expect(html).not.toContain(line)
      expect(JSON.stringify(copy.blockedBody)).not.toMatch(/어드민|관리자|정지|삭제/)
    })

    it('footer는 [secondary 닫기][primary main 문의하기] 둘이고 danger가 없다', () => {
      const buttons = buttonsOf(treeOf({ mode: 'blocked' }))
      expect(buttons).toHaveLength(2)
      const [close, inquire] = buttons
      expect(labelOf(close)).toBe(copy.close)
      expect(close.props.variant).toBe('secondary')
      expect(close.props.fullWidth).toBe(true)
      expect(labelOf(inquire)).toBe(d.voc.inquireCta)
      expect(inquire.props.variant).toBe('primary')
      expect(inquire.props.surface).toBe('main')
      expect(inquire.props.fullWidth).toBe(true)
      expect(buttons.some((b) => b.props.variant === 'danger')).toBe(false)
      expect(markup({ mode: 'blocked' })).not.toContain(copy.confirm)
    })

    it('«닫기»·시트 닫기는 onClose, «문의하기»는 onInquire이고 서버 호출은 없다', () => {
      const onClose = vi.fn()
      const onInquire = vi.fn()
      const onConfirm = vi.fn()
      const tree = treeOf({ mode: 'blocked', onClose, onInquire, onConfirm })
      const [close, inquire] = buttonsOf(tree)
      ;(close.props.onClick as () => void)()
      ;(tree.props.onClose as () => void)()
      expect(onClose).toHaveBeenCalledTimes(2)
      ;(inquire.props.onClick as () => void)()
      expect(onInquire).toHaveBeenCalledTimes(1)
      expect(onConfirm).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('실패 안내가 넘어와도 blocked 모양에는 보이지 않는다', () => {
      const tree = treeOf({ mode: 'blocked', notice: { message: d.stravaConnection.replaceResult.retry, next: 'retry' } })
      expect(noticesOf(tree)).toHaveLength(0)
    })
  })

  it('«그래도 연결하기»는 중복 안내 시트에만 있다 — 끊기 시트·끊김 카드·설정 구획에는 없고, 향후를 약속하는 «준비 중»도 사전에 없다', () => {
    const root = path.resolve(__dirname, '../..')
    const files = [
      'components/strava/StravaDisconnectSheet.tsx',
      'components/strava/StravaDisconnectedCard.tsx',
      'components/strava/StravaSettingsSection.tsx',
    ]
    for (const file of files) {
      const source = readFileSync(path.join(root, file), 'utf8')
      expect(source, file).not.toContain('그래도 연결하기')
    }
    expect(copy.confirm).toBe('그래도 연결하기')
    expect(JSON.stringify(copy)).not.toContain('준비 중')
    expect(JSON.stringify(d.stravaConnection.replaceResult)).not.toContain('준비 중')
  })
})
