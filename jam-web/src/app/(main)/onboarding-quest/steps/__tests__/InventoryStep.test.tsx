/**
 * 온보딩 퀘스트 2단계(InventoryStep) 초기 렌더 (티켓 20260927_2125, 상위 20260927_2123 T2b).
 *
 * 저장소에 jsdom·testing-library가 없어(`safeImageCallSites.test.tsx`와 같은 방식) 서버 렌더
 * (`renderToStaticMarkup`)로 초기 상태만 고정한다: 위치 안내 문구·연출 표시 문구가 확정값과
 * 글자 단위로 같고, 그리드에 연출 배지 1개 + 빈 슬롯 5개가 보인다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import InventoryStep from '../InventoryStep'
import { d } from '@/lib/i18n'
import { DEMO_INVENTORY_ITEM } from '@/lib/onboarding-quest/demo-data'

describe('InventoryStep 초기 렌더', () => {
  it('위치 안내 문구가 확정값과 같다', () => {
    expect(d.onboardingQuest.steps.bag.locationHint).toBe('인벤토리는 아래 탭에 있어요')
  })

  it('연출 표시 문구가 확정값과 같다', () => {
    expect(d.onboardingQuest.demoBadgeNotice).toBe('이 배지는 실제 인벤토리에는 남지 않아요.')
  })

  it('위치 안내·연출 배지·연출 표시가 이 순서로 보인다', () => {
    const html = renderToStaticMarkup(<InventoryStep />)
    const hintIdx = html.indexOf(d.onboardingQuest.steps.bag.locationHint)
    const badgeIdx = html.indexOf(DEMO_INVENTORY_ITEM.badgeName)
    const noticeIdx = html.indexOf(d.onboardingQuest.demoBadgeNotice)

    expect(hintIdx).toBeGreaterThan(-1)
    expect(badgeIdx).toBeGreaterThan(hintIdx)
    expect(noticeIdx).toBeGreaterThan(badgeIdx)
  })

  it('빈 슬롯 5개(2행 3열 밀도)가 함께 보인다', () => {
    const html = renderToStaticMarkup(<InventoryStep />)
    const emptySlotCount = (html.match(/text-xl">\+<\/span>/g) ?? []).length
    expect(emptySlotCount).toBe(5)
  })

  it('「연습」이라는 말을 쓰지 않는다(사용자 결정)', () => {
    const html = renderToStaticMarkup(<InventoryStep />)
    expect(html).not.toContain('연습')
  })
})
