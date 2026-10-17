/**
 * Strava 동기화 시트 두 개 (티켓 20261017_1422 2회, 채원 사전 판정 2026-10-17)
 *
 * - 끊기 확인 시트: 문구, 버튼(취소 secondary · 확정 danger), 제출 중 상태(두 버튼 막힘·라벨·시트 닫기 막힘)
 * - 중복 안내 시트: 문구 4문장, 버튼은 «취소» 하나뿐, 취소·시트 닫기가 같은 결과(닫기)이고 서버 호출이 없다
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

  it('제목과 4문장을 d.* 문구 그대로 그린다 — 문장마다 단락이고 왼쪽 정렬이다', () => {
    const html = renderToStaticMarkup(<StravaDuplicateSheetView open onClose={() => {}} />)
    expect(html).toContain(copy.title)
    expect(copy.body).toHaveLength(4)
    for (const line of copy.body) expect(html).toContain(`>${line}</p>`)
    expect(html).toContain('text-left')
    expect(html).not.toContain('text-center')
    expect(html).toContain('break-keep')
  })

  it('버튼은 «취소» 하나뿐이고 primary main 전체 폭이다', () => {
    const tree = StravaDuplicateSheetView({ open: true, onClose: () => {} })
    const buttons = buttonsOf(tree)
    expect(buttons).toHaveLength(1)
    expect(labelOf(buttons[0])).toBe(copy.cancel)
    expect(buttons[0].props.variant).toBe('primary')
    expect(buttons[0].props.surface).toBe('main')
    expect(buttons[0].props.fullWidth).toBe(true)
  })

  it('«취소»를 누르면 닫히고 서버 호출은 없다 — 시트 닫기(바깥 탭·Escape)도 같은 결과다', () => {
    const onClose = vi.fn()
    const tree = StravaDuplicateSheetView({ open: true, onClose })
    ;(buttonsOf(tree)[0].props.onClick as () => void)()
    expect(onClose).toHaveBeenCalledTimes(1)
    ;(tree.props.onClose as () => void)()
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('«그래도 연결하기»는 코드 어디에도 없다 — 문구·컴포넌트·향후 약속(준비 중) 모두', () => {
    const root = path.resolve(__dirname, '../..')
    const files = [
      'components/strava/StravaDuplicateSheet.tsx',
      'components/strava/StravaDisconnectSheet.tsx',
      'components/strava/StravaDisconnectedCard.tsx',
      'components/strava/StravaSettingsSection.tsx',
      'lib/i18n/ko.ts',
    ]
    for (const file of files) {
      const source = readFileSync(path.join(root, file), 'utf8')
      expect(source, file).not.toContain('그래도 연결하기')
    }
    expect(JSON.stringify(copy)).not.toContain('준비 중')
  })
})
