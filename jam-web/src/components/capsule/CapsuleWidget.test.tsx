/**
 * 캡슐 위젯 (티켓 20261018_0054 1회)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 첫 화면을 고정한다. 요청·응답에 따른 결정은 `capsule-flow.test.ts`가 맡는다. 고정하는 것:
 * - 서버 초기값이 있으면 로딩 없이 바로 알약을 그리고 상태 문구가 상태를 따른다(채우기 / 열 수 있어요 / 빈칸이 모자라요).
 * - 초기값이 없으면 같은 높이의 Skeleton 알약이다(마운트 뒤 조회하므로 첫 렌더는 로딩).
 * - 위젯 자체에는 가진 잼이 없고(시트·잠긴 상세·채우기 입력에만 보인다) 숫자·퍼센트도 없다.
 * - 시트는 닫힌 채로 시작한다. 위젯이 z-index를 가진 래퍼를 만들지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsuleWidget.test.tsx
 */
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))
vi.mock('@/components/ui/BottomSheet', () => ({
  default: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div data-sheet="">{children}</div> : null),
}))

import CapsuleWidget from './CapsuleWidget'
import { d } from '@/lib/i18n'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'

const status = (over: Partial<CapsuleStatus> = {}): CapsuleStatus => ({
  required: 300,
  filled: 120,
  remaining: 180,
  balance: 777,
  openable: false,
  notOpenableReason: 'not_full',
  ...over,
})

const textOf = (html: string) => html.replace(/<[^>]*>/g, '')

describe('서버 초기값이 있을 때', () => {
  it('로딩 없이 바로 알약을 그린다', () => {
    const html = renderToStaticMarkup(<CapsuleWidget initial={status()} />)
    expect(html).not.toContain('role="status"')
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(textOf(html)).toBe(`${d.capsule.title}${d.capsule.pill.filling}`)
    expect(html).toContain('--ds-progress-fill:40%')
  })

  it('다 채워 열 수 있으면 «열 수 있어요»다', () => {
    const html = renderToStaticMarkup(<CapsuleWidget initial={status({ filled: 300, remaining: 0, openable: true, notOpenableReason: null })} />)
    expect(textOf(html)).toBe(`${d.capsule.title}${d.capsule.pill.ready}`)
    expect(html).toContain('--ds-progress-fill:100%')
  })

  it('빈칸이 모자라면 «빈칸이 모자라요»다', () => {
    const html = renderToStaticMarkup(
      <CapsuleWidget initial={status({ filled: 300, remaining: 0, notOpenableReason: 'no_free_slots', freeSlots: 1, neededSlots: 3 })} />
    )
    expect(textOf(html)).toBe(`${d.capsule.title}${d.capsule.pill.noSlots}`)
  })

  it('위젯에는 가진 잼이 보이지 않고 숫자·퍼센트도 없다', () => {
    const html = renderToStaticMarkup(<CapsuleWidget initial={status()} />)
    expect(html).not.toContain('777')
    expect(html).not.toContain(d.capsule.sheet.balanceLabel)
    expect(textOf(html)).not.toMatch(/\d|%/)
  })

  it('시트는 닫힌 채 시작하고 위젯은 z-index를 가진 래퍼를 만들지 않는다', () => {
    const html = renderToStaticMarkup(<CapsuleWidget initial={status()} />)
    expect(html).not.toContain('data-sheet')
    expect(html).not.toMatch(/z-index|z-\d|z-\[/)
  })
})

describe('서버 초기값이 없을 때', () => {
  it('같은 높이(76px)의 Skeleton 알약으로 시작한다', () => {
    for (const initial of [undefined, null]) {
      const html = renderToStaticMarkup(<CapsuleWidget initial={initial} />)
      expect(html).toContain('role="status"')
      expect(html).toContain('height:76px')
      expect(html).not.toContain('<button')
    }
  })
})
