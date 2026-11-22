/**
 * 홈피드 컬러셋 편집기 서버 렌더 (티켓 20261121_2146)
 *
 * 확인하는 것: 15행(이름·hex 칸, 기본값·저장된 값은 «기본값» 버튼 설명에), 저장된 덮어쓰기가 있는 행의 «바뀜» 없음(저장된 값 = 편집 값), 미리보기 컨테이너에만 변수가 걸림,
 * 규칙 재계산 문구, 영향받는 카드 목록, 잘못된 hex 오류 문구. 저장소에 jsdom이 없어(`environment: 'node'`) `renderToStaticMarkup`으로 확인한다.
 * 클릭·입력 동작(바뀜 표시·오류 문구 갱신·확인 대화상자)은 순수 함수 시험(`feedColorImpact.test.ts`)과 이 파일의 초기 렌더로 나눠 지킨다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/feed-colors/__tests__/FeedColorsEditor.test.tsx
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/today/TodayCardTracker', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import FeedColorsEditor, { ColorRow, ImpactCardList } from '../FeedColorsEditor'
import { FEED_COLOR_LABELS } from '@/app/admin/today/FeedCardSection'
import { FEED_COLOR_KEYS } from '@/lib/today/feedConstants'
import { findNewlyViolatedCards, type FeedColorCardInput } from '@/lib/admin/feedColorImpact'
import { buildFeedPalette } from '@/lib/today/feedColorOverrides'

const html = (props: { savedOverrides?: Record<string, string>; cards?: FeedColorCardInput[] } = {}) =>
  renderToStaticMarkup(<FeedColorsEditor savedOverrides={props.savedOverrides ?? {}} cards={props.cards ?? []} />)

describe('FeedColorsEditor 초기 렌더', () => {
  it('15색이 이름·기본값과 함께 한 줄씩 그려진다', () => {
    const out = html()
    expect((out.match(/data-color-key="/g) ?? []).length).toBe(15)
    for (const key of FEED_COLOR_KEYS) expect(out).toContain(FEED_COLOR_LABELS[key])
    expect(out).toContain('#ff1d1d')
    expect(out).toContain('저장된 값 없음')
  })

  it('바꾼 것이 없으면 «바뀜» 표시도 없고 적용 버튼이 비활성이다', () => {
    const out = html()
    expect(out).not.toContain('data-changed')
    expect(out).toContain('바꾼 색이 없어요.')
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>적용<\/button>/)
  })

  it('저장된 값이 있는 행은 저장된 hex를 보이고, 되돌리기 버튼이 활성이다', () => {
    const out = html({ savedOverrides: { red: '#aabbcc' } })
    expect(out).toContain('저장된 값 #aabbcc')
    expect(out).toMatch(/<button[^>]*>전체 기본값으로 되돌리기<\/button>/)
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>전체 기본값으로 되돌리기<\/button>/)
  })

  it('색 설정과 미리보기가 따로 스크롤되는 두 칸이다', () => {
    const out = html()
    const settings = out.match(/<section aria-label="색 설정" data-pane="settings" class="([^"]*)"/)
    const preview = out.match(/<section aria-label="미리보기" data-pane="preview" class="([^"]*)"/)
    expect(settings![1]).toContain('lg:overflow-y-auto')
    expect(preview![1]).toContain('lg:overflow-y-auto')
    // 색 줄은 설정 칸 안에, 미리보기·규칙·영향 카드는 미리보기 칸 안에 있다
    const split = out.indexOf('data-pane="preview"')
    expect(out.slice(0, split)).toContain('data-color-key="red"')
    expect(out.slice(split)).toContain('data-feed-color-preview')
    expect(out.slice(split)).not.toContain('data-color-key=')
  })

  it('색 선택기와 hex 글자 칸이 행마다 있고 네이티브 select는 쓰지 않는다', () => {
    const out = html()
    expect((out.match(/type="color"/g) ?? []).length).toBe(15)
    expect((out.match(/id="feed-color-[a-z-]+-hex"/g) ?? []).length).toBe(15)
    expect(out).not.toContain('<select')
  })

  it('편집 중인 팔레트 변수는 미리보기 컨테이너에만 걸리고 :root에는 걸리지 않는다', () => {
    const out = html({ savedOverrides: { red: '#aabbcc' } })
    const preview = out.match(/<div data-feed-color-preview="" style="([^"]*)"/)
    expect(preview).not.toBeNull()
    expect(preview![1]).toContain('--feed-color-red:#aabbcc')
    expect(preview![1]).toContain('--feed-color-ref-yellow:')
    expect(out).not.toContain(':root')
    expect(out).not.toContain('<style')
  })

  it('규칙 재계산 문구에 통과하는 조합 수(편집 값·지금 값)가 보인다', () => {
    const out = html()
    expect(out).toMatch(/통과하는 조합 \d+개 \(지금 \d+개\)/)
    expect(out).not.toContain('통과하는 조합이') // 줄어들지 않았으니 경고는 없다
  })

  it('영향받는 카드가 없으면 없다고 안내하고, 카드 색 키가 바뀌지 않는다는 안내가 있다', () => {
    const out = html()
    expect(out).toContain('새로 규칙에 걸리는 카드는 없어요')
    expect(out).toContain('카드에 저장된 색 이름은 바뀌지 않고')
  })

  it('저장된 값으로 새로 걸리는 카드는 없다(저장 값 = 편집 값이라 변화가 없다)', () => {
    const cards: FeedColorCardInput[] = [
      { id: 'c1', title: '낙엽 카드', feedType: 'hero_box', bgColorKey: 'red-soft', chipColorKey: 'red', boxColorKey: 'ref-lime' },
    ]
    const out = html({ savedOverrides: { red: '#ff9b9b' }, cards })
    expect(out).toContain('새로 규칙에 걸리는 카드 0장')
    expect(out).not.toContain('낙엽 카드')
  })
})

describe('ColorRow', () => {
  const base = { colorKey: 'red' as const, savedHex: null, disabled: false, onChange: () => {} }

  it('바뀐 행은 «바뀜» 표시와 data-changed가 있고 바뀌지 않은 행은 없다', () => {
    const changed = renderToStaticMarkup(<ColorRow {...base} draft="#aabbcc" changed />)
    expect(changed).toContain('바뀜')
    expect(changed).toContain('data-changed')
    const same = renderToStaticMarkup(<ColorRow {...base} draft="#ff1d1d" changed={false} />)
    expect(same).not.toContain('바뀜')
  })

  it('잘못된 hex는 칸 아래 오류 문구와 aria-invalid를 보이고, 올바른 값은 보이지 않는다', () => {
    const bad = renderToStaticMarkup(<ColorRow {...base} draft="#12" changed={false} />)
    expect(bad).toContain('#과 영문·숫자 6자리로 입력해 주세요')
    expect(bad).toContain('aria-invalid="true"')
    const ok = renderToStaticMarkup(<ColorRow {...base} draft="#aabbcc" changed />)
    expect(ok).not.toContain('6자리로 입력해 주세요')
    expect(ok).toContain('aria-invalid="false"')
  })
})

describe('ImpactCardList', () => {
  const current = buildFeedPalette({})
  const edited = buildFeedPalette({ red: '#ff9b9b' })
  const card = (id: string): FeedColorCardInput => ({
    id,
    title: `낙엽 카드 ${id}`,
    feedType: 'hero_box',
    bgColorKey: 'red-soft',
    chipColorKey: 'red',
    boxColorKey: null,
  })

  it('새로 걸리는 카드의 제목·걸린 규칙·바뀐 색을 보인다', () => {
    const out = renderToStaticMarkup(<ImpactCardList cards={findNewlyViolatedCards(current, edited, [card('a')])} />)
    expect(out).toContain('낙엽 카드 a')
    expect(out).toContain('배경색 연한 레드 · 칩 색 레드 조합이')
    expect(out).toContain('규칙에 걸려요')
    expect(out).toContain('#ff1d1d → #ff9b9b')
    expect(out).not.toContain('외 ')
  })

  it('카드가 20장을 넘으면 20장까지만 보이고 «외 N장»을 적는다', () => {
    const many = Array.from({ length: 23 }, (_, i) => card(`k${i}`))
    const out = renderToStaticMarkup(<ImpactCardList cards={findNewlyViolatedCards(current, edited, many)} />)
    expect((out.match(/낙엽 카드 k/g) ?? []).length).toBe(20)
    expect(out).toContain('외 3장')
  })

  it('걸리는 카드가 없으면 없다고 안내한다', () => {
    const out = renderToStaticMarkup(<ImpactCardList cards={findNewlyViolatedCards(current, current, [card('a')])} />)
    expect(out).toContain('새로 규칙에 걸리는 카드는 없어요')
  })
})
