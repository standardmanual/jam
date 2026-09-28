/**
 * 관리자 전용 퀘스트 미리보기 띠(QuestPreviewBanner) 초기 렌더 (티켓 20260928_0138, N5b).
 *
 * 저장소에 jsdom·testing-library가 없어(`OnboardingSyncButton.test.tsx`와 같은 방식) 서버 렌더
 * (`renderToStaticMarkup`)로 단계 라벨·done 라벨이 값에 따라 정확히 보이는지만 고정한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import QuestPreviewBanner, { shouldRefreshOnPathChange } from './QuestPreviewBanner'
import { d } from '@/lib/i18n'

describe('shouldRefreshOnPathChange (재작업 ③ — 경로 변경 시에만 새로고침)', () => {
  it('첫 마운트(prevPathname === null)는 경로가 같아도 새로고침하지 않는다', () => {
    expect(shouldRefreshOnPathChange(null, '/')).toBe(false)
  })

  it('경로가 바뀌지 않았으면 새로고침하지 않는다', () => {
    expect(shouldRefreshOnPathChange('/', '/')).toBe(false)
  })

  it('첫 마운트 이후 경로가 바뀌면 새로고침한다', () => {
    expect(shouldRefreshOnPathChange('/', '/inventory')).toBe(true)
  })
})

describe('QuestPreviewBanner 초기 렌더', () => {
  it('단계 키(pickup, 3번째 단계)는 「퀘스트 미리보기 중 · 3/7단계」를 보여준다', () => {
    const html = renderToStaticMarkup(<QuestPreviewBanner value="pickup" />)
    expect(html).toContain('퀘스트 미리보기 중 · 3/7단계')
  })

  it('done은 「퀘스트 미리보기 중 · 연동 단계」를 보여준다', () => {
    const html = renderToStaticMarkup(<QuestPreviewBanner value="done" />)
    expect(html).toContain(d.onboardingQuest.preview.doneLabel)
  })

  it('끝내기 버튼 라벨이 보인다', () => {
    const html = renderToStaticMarkup(<QuestPreviewBanner value="sync" />)
    expect(html).toContain(d.onboardingQuest.preview.finishButton)
  })
})
