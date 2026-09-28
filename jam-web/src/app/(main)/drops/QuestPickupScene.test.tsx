/**
 * 온보딩 퀘스트 `pickup`·`drop` 차례 공용 연출 씬(QuestPickupScene) 초기 렌더 (티켓
 * 20260927_2126 T3, 20260927_2128 T5).
 *
 * 저장소에 jsdom·testing-library가 없어(`QuestBagGrid.test.tsx`와 같은 방식) 서버 렌더
 * (`renderToStaticMarkup`)로 초기 마크업만 고정한다: 정지 마커와 라벨이 보이고, 마커를
 * 아직 탭하지 않은 초기 상태라 캐러셀·"여기에 드랍" 버튼은 렌더되지 않는다. `mode`가 달라도
 * 마커·배경은 동일하다(채원 판정 3 — 마커 라벨 재사용).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/drops',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import QuestPickupScene from './QuestPickupScene'
import { d } from '@/lib/i18n'
import { BADGE_FILL_PATH } from '@/components/map/MapView'

describe('QuestPickupScene 초기 렌더 (mode=pickup)', () => {
  it('마커 라벨(pickupMarkerLabel)이 보인다', () => {
    const html = renderToStaticMarkup(<QuestPickupScene mode="pickup" />)
    expect(html).toContain(d.onboardingQuest.pickupMarkerLabel)
  })

  it('마커가 실제 드랍 마커와 같은 실루엣(BADGE_FILL_PATH)을 그린다', () => {
    const html = renderToStaticMarkup(<QuestPickupScene mode="pickup" />)
    expect(html).toContain('viewBox="0 0 24 24"')
    // dangerouslySetInnerHTML로 주입된 path의 fill-rule 속성 일부로 재사용 여부를 확인한다.
    expect(BADGE_FILL_PATH).toContain('fill-rule')
    expect(html).toContain('fill-rule')
  })

  it('마커를 탭하기 전에는 "여기에 드랍" 버튼(캐러셀)이 렌더되지 않는다', () => {
    const html = renderToStaticMarkup(<QuestPickupScene mode="pickup" />)
    // 마커 라벨 자체에도 "드랍"이 들어가므로, 버튼 텍스트 노드의 정확한 경계(`>드랍<`)로 좁혀 확인한다.
    expect(html).not.toContain(`>${d.drops.dropHereButton}<`)
  })
})

describe('QuestPickupScene 초기 렌더 (mode=drop)', () => {
  it('mode=pickup과 동일하게 마커 라벨(pickupMarkerLabel, 채원 판정 3)이 보인다', () => {
    const html = renderToStaticMarkup(<QuestPickupScene mode="drop" />)
    expect(html).toContain(d.onboardingQuest.pickupMarkerLabel)
  })

  it('마커를 탭하기 전에는 캐러셀(카드)이 렌더되지 않는다', () => {
    const html = renderToStaticMarkup(<QuestPickupScene mode="drop" />)
    expect(html).not.toContain(`>${d.drops.dropHereButton}<`)
    expect(html).not.toContain(d.drops.dropEmptyTitle)
  })
})
