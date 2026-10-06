/**
 * 상태 칩의 아이콘만 보기와 범례 (티켓 20261006_1538 ③-c, 채원 판정 「상태 칩: 좁은 월간·타임라인은 아이콘 + `sr-only` 글자와 범례」)
 *
 * 저장소에 jsdom·testing-library가 없어(`parts.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 모양을 고정한다.
 * 범례의 내용(`PopoverContent`)은 눌러야 열리는 포털이라 `Popover`를 가짜로 바꿔 내용을 바로 그린다.
 *
 * 지키는 것:
 * - `iconOnly`면 아이콘만 보이고 글자는 `sr-only`로 남는다(색·모양에만 기대지 않는다). 안 주면 옛 모양 그대로다
 * - 모든 항목 상태 10개·신호 수준 3개·시험·형식 오류 칩이 `iconOnly`에서도 화면 읽기 글자를 가진다
 * - 범례 버튼은 컨테이너 40rem 미만 44px(`h-11`)·이상 40px(`@[40rem]:h-10`)이고, 내용은 항목 상태 10개·시험·신호 3개를 실제 칩 그대로 보여 준다
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

vi.mock('@/components/admin/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div data-popover="">{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
    <div data-popover-content="" aria-label={props['aria-label'] as string}>
      {children}
    </div>
  ),
}))

import { OpsStatusBadge } from '../OpsStatusBadge'
import { OpsStatusLegend, STATUS_LEGEND_BUTTON_LABEL, STATUS_LEGEND_TITLE } from '../OpsStatusLegend'
import { OPS_ITEM_STATUSES } from '@/lib/admin/opsInbox/constants'
import { OPS_ITEM_STATUS_LABELS } from '@/lib/admin/opsInbox/labels'

const flat = (node: ReactNode) => renderToStaticMarkup(<>{node}</>).replace(/<!-- -->/g, '')

/** 마크업에서 아이콘(svg)과 `sr-only` 글자를 빼고 남는 보이는 글자. */
function visibleText(markup: string): string {
  return markup
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

describe('OpsStatusBadge — iconOnly', () => {
  it('아이콘만 보이고 글자는 sr-only로 남는다', () => {
    const out = flat(<OpsStatusBadge type="item" status="live" iconOnly />)
    expect(out).toContain('tabler-icon')
    expect(out).toContain('<span class="sr-only">게재중</span>')
    expect(visibleText(out)).toBe('')
  })

  it('안 주면 글자가 그대로 보인다(옛 모양)', () => {
    const out = flat(<OpsStatusBadge type="item" status="live" />)
    expect(visibleText(out)).toBe('게재중')
    expect(out).not.toContain('sr-only')
  })

  it('항목 상태 10개 모두 아이콘만 보여도 화면 읽기 글자를 가진다', () => {
    for (const status of OPS_ITEM_STATUSES) {
      const out = flat(<OpsStatusBadge type="item" status={status} iconOnly />)
      expect(out, status).toContain(`<span class="sr-only">${OPS_ITEM_STATUS_LABELS[status]}</span>`)
      expect(visibleText(out), status).toBe('')
    }
  })

  it('신호 수준·확인 안 함·시험·형식 오류 칩도 같은 방식이다', () => {
    const cases: Array<[string, ReactNode]> = [
      ['중단', <OpsStatusBadge key="a" type="signal" level="stop" iconOnly />],
      ['주의', <OpsStatusBadge key="b" type="signal" level="warn" iconOnly />],
      ['참고', <OpsStatusBadge key="c" type="signal" level="info" iconOnly />],
      ['시험', <OpsStatusBadge key="d" type="sample" iconOnly />],
      ['형식 오류 3', <OpsStatusBadge key="e" type="format-errors" count={3} iconOnly />],
      ['아직 확인하지 않아요', <OpsStatusBadge key="f" type="signal-unchecked" reason="not_started" iconOnly />],
    ]
    for (const [label, node] of cases) {
      const out = flat(node)
      expect(out, label).toContain(`<span class="sr-only">${label}</span>`)
      expect(visibleText(out), label).toBe('')
    }
  })

  it('점선 확인 안 함 칩은 아이콘만 보여도 점선이다', () => {
    expect(flat(<OpsStatusBadge type="signal-unchecked" reason="not_built" iconOnly />)).toContain('border-dashed')
  })
})

describe('OpsStatusLegend — 상태 아이콘 보기', () => {
  const out = flat(<OpsStatusLegend />)

  it('버튼 글자는 「상태 아이콘 보기」이고 높이는 40rem 미만 44px·이상 40px다', () => {
    expect(STATUS_LEGEND_BUTTON_LABEL).toBe('상태 아이콘 보기')
    const button = /<button[^>]*class="([^"]*)"[^>]*>/.exec(out)?.[1] ?? ''
    expect(button).toContain('h-11')
    expect(button).toContain('@[40rem]:h-10')
    expect(out).toContain('상태 아이콘 보기')
    expect(button).not.toMatch(/\bh-9\b/)
  })

  it('내용은 항목 상태 10개를 아이콘 + 글자 칩 그대로 보여 준다', () => {
    expect(out).toContain(STATUS_LEGEND_TITLE)
    for (const status of OPS_ITEM_STATUSES) expect(out, status).toContain(`</svg>${OPS_ITEM_STATUS_LABELS[status]}</span>`)
    // 범례의 칩은 글자가 보이는 모양이다(sr-only로 숨기지 않는다)
    expect(out).not.toContain('sr-only')
  })

  it('시험과 신호 수준 3개도 보여 준다', () => {
    for (const label of ['시험', '중단', '주의', '참고']) expect(out, label).toContain(`</svg>${label}</span>`)
  })
})
