/**
 * 캡슐 시트 (티켓 20261018_0054 1회)
 *
 * `BottomSheet`는 body 포털이라 서버 렌더에서는 비어 있다. 이 시험은 `BottomSheet`를 제목·본문·푸터를 그대로 그리는 대역으로 바꿔
 * 시트 안 화면만 고정한다(시트 자체의 동작은 `BottomSheet`가 맡는다). 고정하는 것:
 * - 본문 단계: 외곽선 게이지, «가진 잼 {balance}» 숫자, 상태별 푸터(채우기 / 열기 / 빈칸 모자람 안내).
 * - 가진 잼이 0이면 «채우기»가 비활성이고 이유 문구가 있다.
 * - 빈칸이 모자라면 «열기»가 없고 지금 빈칸 수와 필요한 빈칸 수, 인벤토리 링크가 있다.
 * - 열기 진행 중에는 «여는 중»이고 비활성이다.
 * - 채우기 단계: 제목 «잼 채우기», 공용 채우기 입력, «취소». 푸터가 없다.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsuleSheet.test.tsx
 */
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/ui/BottomSheet', () => ({
  default: ({ open, title, children, footer }: { open: boolean; title?: string; children: ReactNode; footer?: ReactNode }) =>
    open ? (
      <div data-sheet="">
        <h2>{title}</h2>
        <div data-body="">{children}</div>
        {footer ? <div data-footer="">{footer}</div> : null}
      </div>
    ) : null,
}))

import CapsuleSheet, { type CapsuleSheetStep } from './CapsuleSheet'
import { d, t } from '@/lib/i18n'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'

const status = (over: Partial<CapsuleStatus> = {}): CapsuleStatus => ({
  required: 300,
  filled: 120,
  remaining: 180,
  balance: 50,
  openable: false,
  notOpenableReason: 'not_full',
  ...over,
})

const READY = status({ filled: 300, remaining: 0, openable: true, notOpenableReason: null })
const NO_SLOTS = status({ filled: 300, remaining: 0, openable: false, notOpenableReason: 'no_free_slots', freeSlots: 1, neededSlots: 3 })

function render(over: { status?: CapsuleStatus; step?: CapsuleSheetStep; pending?: 'fill' | 'open' | null; open?: boolean } = {}): string {
  const noop = () => {}
  return renderToStaticMarkup(
    <CapsuleSheet
      open={over.open ?? true}
      onClose={noop}
      status={over.status ?? status()}
      step={over.step ?? 'main'}
      pending={over.pending ?? null}
      onStartFill={noop}
      onCancelFill={noop}
      onConfirmFill={noop}
      onOpen={noop}
    />
  )
}

const footerOf = (html: string) => html.match(/<div data-footer="">([\s\S]*)<\/div><\/div>$/)?.[1] ?? ''
const textOf = (html: string) => html.replace(/<[^>]*>/g, '')

describe('본문 단계', () => {
  it('제목 «캡슐», 외곽선 게이지, «가진 잼» 숫자가 보인다', () => {
    const html = render()
    expect(html).toContain(`<h2>${d.capsule.title}</h2>`)
    expect(html).toContain('--ds-progress-fill:40%')
    expect(html).toContain('border:1px solid var(--border)')
    expect(textOf(html)).toContain(`${d.capsule.sheet.balanceLabel}50`)
    expect(html).toContain('tabular-nums')
  })

  it('게이지에는 숫자와 퍼센트가 없다. 스크린리더 이름이 상태를 글자로 준다', () => {
    const html = render({ status: status({ balance: 0 }) })
    const body = html.match(/<div data-body="">([\s\S]*?)<\/div><div data-footer="">/)?.[1] ?? ''
    // 게이지 래퍼(role=img)의 안쪽에는 글자도 숫자도 없다
    const gauge = body.match(/<div role="img"[^>]*>([\s\S]*?)<\/div><\/div><\/div><\/div>/)?.[0] ?? body
    expect(body).toContain(`role="img" aria-label="${d.capsule.aria.filling}"`)
    expect(textOf(gauge)).not.toMatch(/\d|%/)
  })

  it('시트가 닫혀 있으면 아무것도 그리지 않는다', () => {
    expect(render({ open: false })).toBe('')
  })
})

describe('채우는 중(filling)', () => {
  it('푸터에 주 버튼 «채우기»가 있고 활성이다', () => {
    const footer = footerOf(render())
    expect(footer.match(/<button/g)).toHaveLength(1)
    expect(textOf(footer)).toBe(d.capsule.sheet.fillCta)
    expect(footer).not.toContain('disabled')
    expect(footer).not.toContain(d.capsule.sheet.noJam)
  })

  it('가진 잼이 0이면 «채우기»가 비활성이고 아래에 이유 문구가 있다', () => {
    const footer = footerOf(render({ status: status({ balance: 0 }) }))
    expect(footer).toContain('disabled=""')
    expect(textOf(footer)).toContain(d.capsule.sheet.noJam)
  })
})

describe('열 수 있음(ready)', () => {
  it('푸터에 «열기»가 있다', () => {
    const footer = footerOf(render({ status: READY }))
    expect(textOf(footer)).toBe(d.capsule.sheet.openCta)
    expect(footer).not.toContain('disabled')
  })

  it('열기 진행 중에는 «여는 중»이고 비활성이며 중복 제출을 막는다', () => {
    const footer = footerOf(render({ status: READY, pending: 'open' }))
    expect(textOf(footer)).toBe(d.capsule.sheet.opening)
    expect(footer).toContain('disabled=""')
    expect(footer).toContain('aria-busy="true"')
  })

  it('«열 수 있어요»를 점·펄스로 부추기지 않는다', () => {
    const html = render({ status: READY })
    expect(html).not.toMatch(/animate-|jam-quest-pulse|pulse/)
  })
})

describe('인벤토리 빈칸 모자람(noSlots)', () => {
  it('«열기» 버튼이 없고 안내 블록과 인벤토리 링크가 있다', () => {
    const footer = footerOf(render({ status: NO_SLOTS }))
    expect(footer).not.toContain('<button')
    expect(textOf(footer)).not.toContain(d.capsule.sheet.openCta)
    expect(textOf(footer)).toContain(d.capsule.sheet.noSlotsTitle)
    expect(textOf(footer)).toContain(t(d.capsule.sheet.noSlotsCount, { free: 1, needed: 3 }))
    expect(textOf(footer)).toContain(d.capsule.sheet.noSlotsKept)
    expect(footer).toContain('href="/inventory"')
    expect(textOf(footer)).toContain(d.capsule.sheet.inventoryLink)
  })

  it('지금 빈칸 수를 모르는 응답이면 수 문구만 뺀다', () => {
    const footer = footerOf(render({ status: status({ ...NO_SLOTS, freeSlots: undefined, neededSlots: undefined }) }))
    expect(textOf(footer)).toContain(d.capsule.sheet.noSlotsTitle)
    expect(textOf(footer)).not.toContain('지금 빈칸')
    expect(footer).toContain('href="/inventory"')
  })

  it('안내 블록과 링크가 위젯 규칙대로 한국어 줄바꿈 클래스를 갖는다', () => {
    const footer = footerOf(render({ status: NO_SLOTS }))
    expect(footer.match(/break-keep wrap-break-word/g)?.length).toBeGreaterThanOrEqual(4)
  })
})

describe('채우기 단계', () => {
  const html = render({ step: 'fill' })

  it('제목이 «잼 채우기»로 바뀌고 푸터가 없다', () => {
    expect(html).toContain(`<h2>${d.capsule.sheet.fillTitle}</h2>`)
    expect(html).not.toContain('data-footer')
  })

  it('공용 채우기 입력(숫자 입력창)과 «취소»가 있다', () => {
    expect(html).toContain('inputMode="numeric"')
    expect(html).toContain(`aria-label="${d.capsule.fill.amountLabel}"`)
    expect(textOf(html)).toContain(d.capsule.sheet.cancel)
  })

  it('가진 잼을 다시 보여 주고 기본값은 min(남은 양, 가진 잼)이다', () => {
    expect(textOf(html)).toContain(`${d.capsule.sheet.balanceLabel}50`)
    // 남은 180, 가진 50 → 50
    expect(html).toContain('value="50"')
  })

  it('제출 중에는 «취소»가 막힌다', () => {
    const pendingHtml = render({ step: 'fill', pending: 'fill' })
    const cancel = pendingHtml.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)?.find((b) => textOf(b) === d.capsule.sheet.cancel) ?? ''
    expect(cancel).toContain('disabled=""')
  })
})
