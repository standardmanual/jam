/**
 * 일정표 거르기 줄 (티켓 20261006_1539 ③-d)
 *
 * 저장소에 jsdom·testing-library가 없어(`statusLegend.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 모양을 고정한다. 클릭·포커스는 실행하지 않는다.
 * 선택지 내용(`PopoverContent`)은 눌러야 열리는 포털이라 `Popover`를 가짜로 바꿔 바로 그린다.
 *
 * 지키는 것: 종류·트라이브·패턴 세 단추, 종류 선택지 6개(패턴 제안 제외), 고른 값은 칩과 개수 표식으로 남음, 고른 것이 있을 때만 [거르기 지우기],
 * 월간·타임라인에서만 [상태 아이콘 보기](주간은 없음), 선택지를 못 읽으면 트라이브·패턴 단추가 막히고 이유를 알림.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

const hoisted = vi.hoisted(() => ({ search: '' }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-schedule',
  useSearchParams: () => new URLSearchParams(hoisted.search),
}))

vi.mock('@/components/admin/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div data-popover="">{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div data-popover-content="">{children}</div>,
}))

import { OpsScheduleFilters, SCHEDULE_KIND_OPTIONS } from '../OpsScheduleFilters'

const TRIBES = [
  { value: '3f2a9c1e-0000-4000-8000-00000000000a', label: '러너스' },
  { value: '3f2a9c1e-0000-4000-8000-00000000000b', label: '하이커스' },
]
const PATTERNS = [
  { value: 'P01', label: 'P01 아침 러닝' },
  { value: 'P02', label: 'P02 주말 산책' },
]

function render(search: string, props: Partial<Parameters<typeof OpsScheduleFilters>[0]> = {}): string {
  hoisted.search = search
  return renderToStaticMarkup(<OpsScheduleFilters tribes={TRIBES} patterns={PATTERNS} showLegend={false} {...props} />).replace(/<!-- -->/g, '')
}

describe('OpsScheduleFilters', () => {
  it('종류 선택지는 일정표에 오르는 6개이고 패턴 제안은 없다', () => {
    expect(SCHEDULE_KIND_OPTIONS.map((option) => option.value)).toEqual(['home_feed_card', 'mission', 'drop_schedule', 'recipe', 'jam_badge', 'collection_launch'])
    const out = render('')
    for (const label of ['홈피드 카드', '미션', '드랍 일정', '믹스 레시피', 'JAM! 배지', '컬렉션 런칭']) expect(out).toContain(label)
    expect(out).not.toContain('패턴 제안')
  })

  it('종류·트라이브·패턴 세 단추와 선택지(체크박스 + 이름)가 있다', () => {
    const out = render('')
    for (const title of ['종류', '트라이브', '패턴']) expect(out).toContain(title)
    for (const label of ['러너스', '하이커스', 'P01 아침 러닝', 'P02 주말 산책']) expect(out).toContain(label)
    expect(out).toContain('role="checkbox"')
  })

  it('거르기가 없으면 칩과 [거르기 지우기]가 없다', () => {
    const out = render('view=week&date=2026-10-07')
    expect(out).not.toContain('거르기 지우기')
    expect(out).not.toContain('aria-label="고른 거르기"')
  })

  it('주소에 거르기가 있으면 고른 값이 칩(이름)으로 남고 [×]와 [거르기 지우기]가 있다', () => {
    const out = render(`kind=mission&tribe=${TRIBES[0].value}&pattern=P02`)
    expect(out).toContain('aria-label="고른 거르기"')
    expect(out).toContain('aria-label="미션 거르기 지우기"')
    expect(out).toContain('aria-label="러너스 거르기 지우기"')
    expect(out).toContain('aria-label="P02 주말 산책 거르기 지우기"')
    expect(out).toContain('>거르기 지우기<')
  })

  it('선택지에 없는 값도 칩은 값 글자로 남는다(지울 수 있어야 한다)', () => {
    expect(render('pattern=P09')).toContain('aria-label="P09 거르기 지우기"')
  })

  it('단추 높이는 40rem 미만 44px·이상 40px이다', () => {
    expect(render('')).toContain('h-11 @[40rem]:h-10')
  })

  it('[상태 아이콘 보기]는 showLegend일 때만 이 줄에 붙는다(월간·타임라인)', () => {
    expect(render('')).not.toContain('상태 아이콘 보기')
    expect(render('', { showLegend: true })).toContain('상태 아이콘 보기')
  })

  it('선택지를 못 읽으면 트라이브·패턴 단추가 막히고 이유를 알린다(종류는 그대로 쓴다)', () => {
    const out = render('', { tribes: [], patterns: [], optionsFailed: true })
    expect(out).toContain('트라이브·패턴 목록을 읽지 못해 고를 수 없어요')
    expect(out.match(/disabled=""/g)).toHaveLength(2)
  })
})
