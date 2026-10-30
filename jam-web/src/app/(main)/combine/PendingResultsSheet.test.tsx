/**
 * 받지 않은 믹스 결과 시트 (티켓 20261018_0055 2회)
 *
 * `BottomSheet`는 body 포털이라 서버 렌더에서는 비어 있다. 이 시험은 `BottomSheet`를 제목·본문·푸터를 그대로 그리는 대역으로 바꿔
 * 시트 안 화면만 고정한다(시트 자체의 동작은 `BottomSheet`가 맡는다). 고정하는 것:
 * - 로딩: 스켈레톤 3개와 비활성 «받기».
 * - 오류: 불러오지 못했다는 문구와 «다시 불러오기». 푸터 버튼은 없다.
 * - 빈 상태: 받을 결과가 없다는 문구와 «닫기».
 * - 빈칸이 충분: 목록과 «받기». 열린 결과는 이름, 잠긴 결과는 «잠긴 아이템 배지»와 등급 칩만 있다(이름·그림은 DOM 어디에도 없다).
 * - 빈칸이 모자람: «받기»가 없고 지금 빈칸 수·필요한 빈칸 수·인벤토리 링크가 있다.
 * - 받는 중: «받는 중»이고 비활성이다.
 * - 이 화면 어디에도 «기한»·«만료»가 없다(결과에는 기한이 없다).
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/combine/PendingResultsSheet.test.tsx"
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

import PendingResultsSheet, { type PendingSheetView } from './PendingResultsSheet'
import { d, t } from '@/lib/i18n'
import type { PendingResultView } from '@/lib/combine/pending'

const open = (over: Partial<PendingResultView> = {}): PendingResultView => ({
  id: 'p-open',
  badgeId: 'b1',
  name: '열린 배지 이름',
  imageUrl: 'https://img.example/open-badge.png',
  rarity: 'rare',
  locked: false,
  createdAt: '2026-10-18T00:00:00Z',
  ...over,
})

const locked = (over: Partial<PendingResultView> = {}): PendingResultView => ({
  id: 'p-locked',
  badgeId: '',
  name: '',
  imageUrl: null,
  rarity: 'epic',
  locked: true,
  createdAt: '2026-10-18T00:00:00Z',
  ...over,
})

const view = (over: Partial<PendingSheetView> = {}): PendingSheetView => ({
  status: 'ready',
  items: [open(), locked()],
  freeSlots: 5,
  neededSlots: 2,
  claiming: false,
  ...over,
})

function render(v: PendingSheetView, isOpen = true): string {
  const noop = () => {}
  return renderToStaticMarkup(<PendingResultsSheet open={isOpen} onClose={noop} view={v} onClaim={noop} onRetry={noop} />)
}

describe('PendingResultsSheet', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    expect(render(view(), false)).toBe('')
  })

  it('제목은 «받지 않은 믹스 결과»이고 마침표가 없다', () => {
    const html = render(view())
    expect(html).toContain(`<h2>${d.combine.pendingSheet.title}</h2>`)
    expect(d.combine.pendingSheet.title.endsWith('.')).toBe(false)
  })

  describe('로딩', () => {
    const html = render(view({ status: 'loading', items: [] }))

    it('스켈레톤 3개와 비활성 «받기»가 있고 본문이 aria-busy다', () => {
      expect(html.match(/aspect-square/g)).toHaveLength(3)
      expect(html).toMatch(/<button[^>]*disabled[^>]*>[^]*?받기/)
      expect(html).toContain('aria-busy="true"')
    })
  })

  describe('오류', () => {
    const html = render(view({ status: 'error', items: [] }))

    it('불러오지 못했다는 문구와 «다시 불러오기»가 있고 푸터가 없다', () => {
      expect(html).toContain(d.combine.claim.loadFailed)
      expect(html).toContain(d.combine.pendingSheet.retry)
      expect(html).not.toContain('data-footer')
    })
  })

  describe('빈 상태', () => {
    const html = render(view({ status: 'ready', items: [], neededSlots: 0 }))

    it('받을 결과가 없다는 문구와 «닫기»가 있고 «받기»는 없다', () => {
      expect(html).toContain(d.combine.claim.noPending)
      expect(html).toContain(d.combine.pendingSheet.close)
      expect(html).not.toContain(`>${d.combine.pendingSheet.claim}<`)
    })
  })

  describe('빈칸이 충분함', () => {
    const html = render(view())

    it('결과 개수 안내, 빈칸 줄, «받기»가 있다', () => {
      expect(html).toContain(t(d.combine.pendingSheet.intro, { count: 2 }))
      expect(html).toContain(t(d.combine.pendingSheet.slots, { free: 5, needed: 2 }))
      expect(html).toContain(d.combine.pendingSheet.claim)
      expect(html).not.toContain(d.combine.pendingSheet.shortTitle)
    })

    it('열린 결과는 이름이 보이고 잠긴 결과는 «잠긴 아이템 배지»와 숫자 없는 일반 설명이 보인다', () => {
      expect(html).toContain('열린 배지 이름')
      expect(html).toContain(d.lockedItem.card.name)
      expect(html).toContain(d.lockedItem.card.description)
      expect(html).not.toContain('잼')
      expect(html).not.toContain('{n}')
    })

    it('결과는 개별 선택 대상이 아니다 — 목록 안에 버튼이 없다', () => {
      const body = html.slice(html.indexOf('<ul'), html.indexOf('</ul>'))
      expect(body).not.toContain('<button')
    })
  })

  it('잠긴 결과의 이름·그림은 호출부가 실수로 실어도 DOM 어디에도 없다', () => {
    const html = render(view({ items: [locked({ name: '비밀 배지 이름', imageUrl: 'https://img.example/secret.png', badgeId: 'secret-id' })] }))
    expect(html).not.toContain('비밀 배지 이름')
    expect(html).not.toContain('secret.png')
    expect(html).not.toContain('secret-id')
    expect(html).toContain(d.lockedItem.card.name)
  })

  describe('빈칸이 모자람', () => {
    const html = render(view({ freeSlots: 1, neededSlots: 3, items: [open(), open({ id: 'x2' }), locked()] }))

    it('«받기» 대신 부족 블록과 인벤토리 링크가 있고 결과는 그대로 남아 있다고 알린다', () => {
      expect(html).not.toContain(`>${d.combine.pendingSheet.claim}<`)
      expect(html).toContain(d.combine.pendingSheet.shortTitle)
      expect(html).toContain(t(d.combine.pendingSheet.shortCount, { free: 1, needed: 3 }))
      expect(html).toContain(d.combine.pendingSheet.shortKept)
      expect(html).toMatch(/<a [^>]*min-h-11[^>]*href="\/inventory"/)
      expect(html).toContain(d.combine.pendingSheet.inventoryLink)
    })

    it('오류색과 경고 표시를 쓰지 않는다', () => {
      expect(html).not.toMatch(/text-(red|danger|error|warning)/)
      expect(html).not.toContain('role="alert"')
    })
  })

  it('받기 409가 알려 준 빈칸·필요 칸 수가 개수와 달라도 그 수로 판정한다', () => {
    const html = render(view({ freeSlots: 0, neededSlots: 2, items: [open()] }))
    expect(html).toContain(t(d.combine.pendingSheet.shortCount, { free: 0, needed: 2 }))
  })

  describe('받는 중', () => {
    const html = render(view({ claiming: true }))

    it('«받는 중»이고 버튼이 비활성이며 aria-busy다', () => {
      expect(html).toContain(d.combine.pendingSheet.claiming)
      expect(html).toMatch(/<button[^>]*disabled[^>]*aria-busy="true"|<button[^>]*aria-busy="true"[^>]*disabled/)
    })
  })

  it('어떤 상태에서도 «기한»·«만료»·재촉하는 말이 없다', () => {
    const states = [
      view(),
      view({ status: 'loading', items: [] }),
      view({ status: 'error', items: [] }),
      view({ items: [], neededSlots: 0 }),
      view({ freeSlots: 0, neededSlots: 3 }),
    ]
    for (const state of states) {
      const html = render(state)
      expect(html).not.toMatch(/기한|만료|서둘러|마감/)
    }
  })

  it('두 줄 이상이 될 수 있는 문장에 줄바꿈 보정이 붙는다', () => {
    const html = render(view({ freeSlots: 1, neededSlots: 3, items: [open(), open({ id: 'x2' }), locked()] }))
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
    expect(html).toContain('text-pretty')
    expect(html).toContain('text-balance')
  })
})
