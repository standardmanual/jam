/**
 * 캡슐 위젯 (티켓 20261028_1739 2회, 새 게이지 + 안내 영역. «받기» 버튼은 티켓 20261105_0105 T5에서 걷었다)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 첫 화면을 검증한다.
 * - 서버 초기값이 있으면 로딩 없이 바로 게이지를 그린다. 시트·«가진 잼»·퍼센트가 없고, 게이지에 채운 양 숫자만 있다.
 * - 안내 영역은 서버가 준 `notice`로 간결 문구를 고른다. 퍼센트·진행 숫자는 쓰지 않는다.
 * - 안내는 막힘 한 종류다. 막히면 «인벤토리 보기»와 빈칸 덧줄이 보이고, 홈 전용 prop(`blockedCard`)이면 게이지를 막힘 카드로 감싼다(티켓 20261105_1912). 이용 정지는 안내가 없다. «받기» 버튼은 어떤 상태에서도 없다.
 * - 초기값이 없으면 높이 72의 Skeleton이다.
 * - 위젯이 z-index를 가진 래퍼를 만들지 않는다.
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
  claim: { blockedReason: null, freeSlots: 40, neededSlots: 2 },
  notice: 'none',
  pendingItemCount: 0,
  shortfall: 0,
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

  it('채운 양 숫자만 있고 퍼센트·CAPSULE 글자·가진 잼 줄이 없다', () => {
    const html = render()
    expect(textOf(html)).toBe('120')
    expect(html).not.toContain('777')
    expect(html).not.toContain('가진 잼')
  })

  it('시트가 없고 위젯은 z-index를 가진 래퍼를 만들지 않는다', () => {
    const html = render()
    expect(html).not.toContain('aria-haspopup')
    expect(html).not.toMatch(/z-index|z-\d|z-\[/)
  })
})

describe('안내 영역 — 서버가 준 notice로 간결 문구를 고른다(막힘 한 종류, 티켓 20261105_0104)', () => {
  const CLAIM_OK = { blockedReason: null, freeSlots: 40, neededSlots: 2 } as const
  const BLOCKED = { filled: 300, remaining: 0, notice: 'blocked', claim: { blockedReason: null, freeSlots: 1, neededSlots: 2 } } as const

  it('막힘: «캡슐이 가득 찼어요»와 빈칸 덧줄, «인벤토리 보기»가 보인다(프로필 기본)', () => {
    const html = render(BLOCKED)
    const text = textOf(html)
    expect(text).toContain(d.capsule.widget.notice.blocked)
    expect(text).toContain(t(d.capsule.widget.slots, { free: 1, needed: 2 }))
    expect(text).toContain('인벤토리 보기')
    // 문구는 게이지 안 숫자 자리에 있고 숫자(300)는 지워진다(2026-11-05 사용자 요청)
    expect(html).toMatch(/data-capsule-number="inside"[\s\S]*캡슐이 가득 찼어요/)
    expect(text).not.toContain('300')
    expect(html).toContain(`aria-label="${d.capsule.widget.gaugeAria.blocked}"`)
  })

  it('막힘 + 채움 0(보류가 생긴 새 캡슐): 문구가 채움 안쪽에 보인다(티켓 20261105_1912)', () => {
    const html = render({ ...BLOCKED, filled: 0, remaining: 300 })
    expect(html).toMatch(/data-capsule-number="inside"[\s\S]*캡슐이 가득 찼어요/)
    expect(html).not.toContain('data-capsule-number="outside"')
    expect(html).toContain(`aria-label="${d.capsule.widget.gaugeAria.blocked}"`)
    expect(d.capsule.widget.gaugeAria.blocked).toBe('캡슐, 얻은 아이템 배지를 넣지 못해 잼을 얻을 수 없어요')
  })

  it('막힘 + 홈 전용 prop: 게이지를 카드 하나로 감싸고 두 줄 안내와 «인벤토리 가기» 버튼 하나만 있다', () => {
    const html = renderToStaticMarkup(<CapsuleWidget initial={status(BLOCKED)} blockedCard />)
    const text = textOf(html)
    expect(html.match(/<section/g)).toHaveLength(1)
    expect(html.match(/role="img"/g)).toHaveLength(1)
    expect(text).toContain(d.capsule.widget.notice.blocked)
    expect(text).toContain(d.capsule.blockedBanner.line1)
    expect(text).toContain(d.capsule.blockedBanner.line2)
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(text).toContain('인벤토리 가기')
    // 빈칸 덧줄·«인벤토리 보기»는 홈 막힘 카드에서 그리지 않는다
    expect(text).not.toContain('인벤토리 보기')
    expect(text).not.toContain(t(d.capsule.widget.slots, { free: 1, needed: 2 }))
    expect(html).toContain(`aria-label="${d.capsule.widget.gaugeAria.blocked}"`)
  })

  it('홈 전용 prop이 있어도 막히지 않았으면(일반·이용 정지) 카드가 DOM에 없고 숫자 게이지만 있다', () => {
    for (const html of [
      renderToStaticMarkup(<CapsuleWidget initial={status()} blockedCard />),
      renderToStaticMarkup(
        <CapsuleWidget initial={status({ pendingCount: 1, notice: 'none', claim: { blockedReason: 'suspended', freeSlots: 40, neededSlots: 2 } })} blockedCard />,
      ),
    ]) {
      expect(html).not.toContain('<section')
      expect(html).not.toContain('<button')
      expect(textOf(html)).toBe('120')
    }
  })

  it('막힘이 아닌데 받을 보상이 빈칸에 막힌 경우는 홈 전용 prop이 있어도 «인벤토리 보기»를 둔다', () => {
    const html = renderToStaticMarkup(
      <CapsuleWidget
        initial={status({ pendingCount: 1, notice: 'none', claim: { blockedReason: 'no_slots', freeSlots: 1, neededSlots: 3 } })}
        blockedCard
      />,
    )
    expect(textOf(html)).toContain(t(d.capsule.widget.slots, { free: 1, needed: 3 }))
    expect(textOf(html)).toContain('인벤토리 보기')
  })

  it('대기 보상이 있어도 빈칸에 막히지 않았다면 «받기» 버튼도 안내도 없다(자동 지급, 티켓 20261105_0105)', () => {
    const html = render({ pendingCount: 1, notice: 'none', claim: CLAIM_OK })
    expect(textOf(html)).not.toContain('받기')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('role="status"')
    expect(html).toContain(`aria-label="${d.capsule.aria.filling}"`)
  })

  it('옛 안내 4종 문구는 사전에 남아 있지 않다', () => {
    expect(Object.keys(d.capsule.widget.notice)).toEqual(['blocked'])
    expect(Object.keys(d.capsule.widget.gaugeAria)).toEqual(['blocked'])
  })

  it('이용 정지: 보류가 있어도 서버가 notice none을 주면 안내가 없다', () => {
    const html = render({
      pendingCount: 1,
      notice: 'none',
      claim: { blockedReason: 'suspended', freeSlots: 40, neededSlots: 2 },
    })
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('<button')
    expect(textOf(html)).toBe('120')
  })

  it('소속 트라이브가 없어 받을 수 없으면 안내와 버튼이 없다', () => {
    const html = render({
      pendingCount: 1,
      notice: 'none',
      claim: { blockedReason: 'no_tribe', freeSlots: 40, neededSlots: 2 },
    })
    expect(textOf(html)).toBe('120')
    expect(html).not.toContain('<button')
  })

  it('안내 문구와 버튼에 퍼센트가 없다', () => {
    const all = JSON.stringify([d.capsule.widget])
    expect(all).not.toContain('%')
  })
})

describe('«받기» 버튼 제거', () => {
  it('사전에 받기 문구가 남아 있지 않다', () => {
    expect(Object.keys(d.capsule.widget)).not.toContain('claim')
    expect(Object.keys(d.capsule.widget)).not.toContain('claiming')
  })

  it('열기를 부추기는 말과 낮은 등급을 낮추어 보는 말이 캡슐 화면 문구에 없다', () => {
    const all = JSON.stringify([d.capsule.title, d.capsule.pill, d.capsule.aria, d.capsule.sheet, d.capsule.widget])
    expect(all).not.toMatch(/한 번만 더|곧 좋은|꽝|대박|행운/)
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
