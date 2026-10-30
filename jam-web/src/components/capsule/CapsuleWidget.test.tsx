/**
 * 캡슐 위젯 (방사형 그라데이션 정식 서비스 적용)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 첫 화면을 검증한다.
 * - 서버 초기값이 있으면 로딩 없이 바로 알약을 그리고 CAPSULE 및 xx%가 표기된다.
 * - 캡슐 정중앙에 'CAPSULE' 볼드 및 상단에 'xx%' 큰 텍스트 볼드 표기
 * - 채우기 버튼 제거 (캡슐 자체 클릭으로 시트 오픈)
 * - 초기값이 없으면 높이 96px의 Skeleton 알약이다.
 * - 위젯이 z-index를 가진 래퍼를 만들지 않는다.
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
import { CAPSULE_PILL_HEIGHT_PX } from './CapsulePill'
import { d } from '@/lib/i18n'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'

const status = (over: Partial<CapsuleStatus> = {}): CapsuleStatus => ({
  required: 300,
  filled: 120,
  remaining: 180,
  balance: 777,
  openable: false,
  notOpenableReason: 'not_full',
  pendingCount: 0,
  jamBlocked: false,
  alertStage: 0,
  claim: { available: false, blockedReason: null, freeSlots: 40, neededSlots: 2 },
  notice: 'none',
  ...over,
})

const textOf = (html: string) => html.replace(/<[^>]*>/g, '')

describe('서버 초기값이 있을 때', () => {
  it('로딩 없이 바로 알약을 그리고 CAPSULE 및 퍼센트가 표기되며 채우기 버튼은 없다', () => {
    const html = renderToStaticMarkup(<CapsuleWidget initial={status()} />)
    expect(html).not.toContain('role="status"')
    expect(textOf(html)).toContain('CAPSULE')
    expect(textOf(html)).toContain('40%')
    expect(html).not.toContain(d.capsule.pill.filling)
    expect(html).toContain(d.capsule.aria.filling)
  })

  it('다 채워 열 수 있으면 aria-label로 열 수 있음을 알리고 100%가 표기된다', () => {
    const html = renderToStaticMarkup(
      <CapsuleWidget initial={status({ filled: 300, remaining: 0, openable: true, notOpenableReason: null })} />
    )
    expect(html).toContain(d.capsule.aria.ready)
    expect(textOf(html)).toContain('100%')
  })

  it('빈칸이 모자라면 aria-label로 빈칸 모자람을 알린다', () => {
    const html = renderToStaticMarkup(
      <CapsuleWidget initial={status({ filled: 300, remaining: 0, notOpenableReason: 'no_free_slots', freeSlots: 1, neededSlots: 3 })} />
    )
    expect(html).toContain(d.capsule.aria.noSlots)
  })

  it('위젯에는 가진 잼 잔액(balance)이 직접 노출되지 않는다', () => {
    const html = renderToStaticMarkup(<CapsuleWidget initial={status()} />)
    expect(html).not.toContain('777')
    expect(html).not.toContain(d.capsule.sheet.balanceLabel)
  })

  it('시트는 닫힌 채 시작하고 위젯은 z-index를 가진 래퍼를 만들지 않는다', () => {
    const html = renderToStaticMarkup(<CapsuleWidget initial={status()} />)
    expect(html).not.toContain('data-sheet')
    expect(html).not.toMatch(/z-index|z-\d|z-\[/)
  })
})

describe('서버 초기값이 없을 때', () => {
  it('높이(96px)의 Skeleton 알약으로 시작한다', () => {
    for (const initial of [undefined, null]) {
      const html = renderToStaticMarkup(<CapsuleWidget initial={initial} />)
      expect(html).toContain('role="status"')
      expect(html).toContain(`height:${CAPSULE_PILL_HEIGHT_PX}px`)
    }
  })
})
