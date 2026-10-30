/**
 * 캡슐 위젯 (티켓 20261028_1739 2회, 새 게이지 + 안내 영역 + 받기)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 첫 화면을 검증한다.
 * - 서버 초기값이 있으면 로딩 없이 바로 게이지를 그린다. 시트·«가진 잼»·퍼센트가 없다.
 * - 안내 영역은 서버가 준 `notice`로 간결 문구를 고른다. 퍼센트·진행 숫자는 쓰지 않는다.
 * - «받기»는 `claim.available`일 때, 빈칸이 모자라면 «인벤토리 보기»와 빈칸 덧줄이 보인다. 이용 정지는 안내가 없다.
 * - 초기값이 없으면 높이 72의 Skeleton이다.
 * - 위젯이 z-index를 가진 래퍼를 만들지 않는다.
 * 받기 호출의 결과 처리는 `runClaim`(capsule-flow.test.ts)이 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsuleWidget.test.tsx
 */
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

import CapsuleWidget from './CapsuleWidget'
import { CAPSULE_GAUGE_HEIGHT_PX } from './CapsuleGauge'
import { d, t } from '@/lib/i18n'
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
const render = (over: Partial<CapsuleStatus> = {}) => renderToStaticMarkup(<CapsuleWidget initial={status(over)} />)

describe('서버 초기값이 있을 때', () => {
  it('로딩 없이 바로 게이지를 그리고 안내 영역은 없다', () => {
    const html = render()
    expect(html).not.toContain('aria-label="' + d.capsule.aria.loading)
    expect(html).toContain('role="img"')
    expect(html).toContain(`aria-label="${d.capsule.aria.filling}"`)
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('<button')
  })

  it('퍼센트·CAPSULE 글자·가진 잼 줄이 없다', () => {
    const html = render()
    expect(textOf(html)).toBe('')
    expect(html).not.toContain('777')
    expect(html).not.toContain('가진 잼')
  })

  it('시트가 없고 위젯은 z-index를 가진 래퍼를 만들지 않는다', () => {
    const html = render()
    expect(html).not.toContain('aria-haspopup')
    expect(html).not.toMatch(/z-index|z-\d|z-\[/)
  })
})

describe('안내 영역 — 서버가 준 notice로 간결 문구를 고른다', () => {
  const CLAIM_OK = { available: true, blockedReason: null, freeSlots: 40, neededSlots: 2 } as const

  it('보류 1개: «못 받은 보상이 1개 있어요»와 «받기»', () => {
    const html = render({ pendingCount: 1, notice: 'pending', claim: CLAIM_OK })
    expect(textOf(html)).toContain('못 받은 보상이 1개 있어요')
    expect(textOf(html)).toContain('받기')
    expect(html).toContain('role="status"')
    expect(html).toContain(`aria-label="${d.capsule.widget.gaugeAria.pending}"`)
  })

  it('보류 1개와 단계 70·80·90: «캡슐이 거의 찼어요»와 «받기»', () => {
    for (const alertStage of [70, 80, 90] as const) {
      const html = render({ pendingCount: 1, alertStage, notice: 'pending_nearly_full', claim: CLAIM_OK })
      expect(textOf(html)).toContain('캡슐이 거의 찼어요')
      expect(textOf(html)).toContain('받기')
      // 단계 숫자는 화면에 나오지 않는다
      expect(textOf(html)).not.toMatch(/\d/)
    }
  })

  it('잼을 받을 수 없음(보류 2개): «지금은 잼을 받을 수 없어요»와 «받기»', () => {
    const html = render({ pendingCount: 2, jamBlocked: true, notice: 'jam_blocked', claim: CLAIM_OK })
    expect(textOf(html)).toContain('지금은 잼을 받을 수 없어요')
    expect(textOf(html)).toContain('받기')
    expect(html).toContain(`aria-label="${d.capsule.widget.gaugeAria.jamBlocked}"`)
  })

  it('빈칸이 모자라면 «받기»는 숨기고 «인벤토리 보기»와 빈칸 덧줄을 보인다', () => {
    const html = render({
      pendingCount: 1,
      notice: 'pending',
      claim: { available: false, blockedReason: 'no_slots', freeSlots: 1, neededSlots: 3 },
    })
    const text = textOf(html)
    expect(text).toContain('못 받은 보상이 1개 있어요')
    expect(text).toContain(t(d.capsule.widget.slots, { free: 1, needed: 3 }))
    expect(text).toContain('인벤토리 보기')
    expect(text).not.toMatch(/(^|[^은])받기/)
  })

  it('잼을 받을 수 없는데 빈칸도 모자라면 «인벤토리 보기»다', () => {
    const html = render({
      pendingCount: 2,
      jamBlocked: true,
      notice: 'jam_blocked',
      claim: { available: false, blockedReason: 'no_slots', freeSlots: 0, neededSlots: 2 },
    })
    expect(textOf(html)).toContain('지금은 잼을 받을 수 없어요')
    expect(textOf(html)).toContain('인벤토리 보기')
  })

  it('가득 찬 채 남음: 문구만 있고 버튼이 없다', () => {
    const html = render({ filled: 300, remaining: 0, notice: 'full_waiting' })
    expect(textOf(html)).toBe('캡슐이 가득 찼어요')
    expect(html).not.toContain('<button')
    expect(html).toContain(`aria-label="${d.capsule.widget.gaugeAria.full}"`)
  })

  it('이용 정지: 보류가 있어도 서버가 notice none을 주면 안내가 없다', () => {
    const html = render({
      pendingCount: 1,
      notice: 'none',
      claim: { available: false, blockedReason: 'suspended', freeSlots: 40, neededSlots: 2 },
    })
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('<button')
    expect(textOf(html)).toBe('')
  })

  it('소속 트라이브가 없어 받을 수 없으면 문구만 있고 버튼이 없다', () => {
    const html = render({
      pendingCount: 1,
      notice: 'pending',
      claim: { available: false, blockedReason: 'no_tribe', freeSlots: 40, neededSlots: 2 },
    })
    expect(textOf(html)).toBe('못 받은 보상이 1개 있어요')
    expect(html).not.toContain('<button')
  })

  it('안내 문구와 버튼에 퍼센트가 없다', () => {
    const all = JSON.stringify([d.capsule.widget, d.capsule.claimResult])
    expect(all).not.toContain('%')
  })
})

describe('서버 초기값이 없을 때', () => {
  it('높이 72의 Skeleton으로 시작한다', () => {
    for (const initial of [undefined, null]) {
      const html = renderToStaticMarkup(<CapsuleWidget initial={initial} />)
      expect(html).toContain('role="status"')
      expect(html).toContain(`height:${CAPSULE_GAUGE_HEIGHT_PX}px`)
      expect(html).not.toContain('role="img"')
    }
  })
})
