/**
 * 온보딩 퀘스트 `bag` 차례 인벤토리 그리드(QuestBagGrid) 초기 렌더 (티켓 20260928_0137,
 * 상위 20260927_2123 T2b).
 *
 * 저장소에 jsdom·testing-library가 없어(`OnboardingSyncButton.test.tsx`와 같은 방식) 서버
 * 렌더(`renderToStaticMarkup`)로 초기 마크업만 고정한다: 연출 도토리가 첫 칸에 보이고,
 * 캡션이 노출되며, 실제 아이템이 0개여도 EmptyState 대신 그리드가 렌더된다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/inventory',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import QuestBagGrid from './QuestBagGrid'
import { d } from '@/lib/i18n'
import { DEMO_INVENTORY_ITEM } from '@/lib/onboarding-quest/demo-data'

describe('QuestBagGrid 초기 렌더', () => {
  it('연출 도토리가 첫 칸에 보인다', () => {
    const html = renderToStaticMarkup(<QuestBagGrid gridItems={[]} emptySlots={5} />)
    expect(html).toContain(DEMO_INVENTORY_ITEM.badgeName)
  })

  it('캡션(demoBadgeNotice)이 노출된다', () => {
    const html = renderToStaticMarkup(<QuestBagGrid gridItems={[]} emptySlots={5} />)
    expect(html).toContain(d.onboardingQuest.demoBadgeNotice)
  })

  it('실제 아이템이 0개여도 그리드(도토리 버튼)가 렌더된다', () => {
    const html = renderToStaticMarkup(<QuestBagGrid gridItems={[]} emptySlots={5} />)
    expect(html).toContain('<button')
  })
})
