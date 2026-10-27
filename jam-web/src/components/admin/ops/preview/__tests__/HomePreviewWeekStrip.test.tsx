/**
 * 홈피드 미리보기의 7일 칸 (티켓 20261026_2025 2회차)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 그림을 확인하고,
 * 누르기는 훅이 없는 컴포넌트를 함수로 불러 얻은 요소 트리에서 `onClick`을 꺼내 부른다.
 *
 * 확인하는 것: 7칸, 요일·날짜, 칸의 카드 수 = `entries.length`, 모양별 막대 조각(카드 수만큼, 모양마다 다른 농도, `title` 툴팁),
 * 승인 전 카드가 있을 때만 점선 점과 «승인 전 N», 선택한 칸의 강조, 칸 누르면 그 날이 선택된다.
 *
 * 실행: cd jam-web && npx vitest run src/components/admin/ops/preview/__tests__/HomePreviewWeekStrip.test.tsx
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HomePreviewWeekStrip } from '../HomePreviewWeekStrip'
import { SHAPE_STYLES } from '../homePreviewClient'
import { live, makeDay, makeWeek, pending } from './fixtures'

function findAll(node: ReactNode, match: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = []
  const visit = (current: ReactNode) => {
    if (Array.isArray(current)) return current.forEach(visit)
    if (!isValidElement<Record<string, unknown>>(current)) return
    if (match(current)) found.push(current)
    visit(current.props.children as ReactNode)
  }
  visit(node)
  return found
}

const render = (selectedDate = '2026-10-07') =>
  renderToStaticMarkup(<HomePreviewWeekStrip days={makeWeek()} selectedDate={selectedDate} onSelect={vi.fn()} />)

describe('HomePreviewWeekStrip', () => {
  it('7칸을 그리고 칸마다 요일·날짜를 보인다', () => {
    const html = render()
    expect(html.match(/data-day-cell=/g)).toHaveLength(7)
    expect(html).toContain('월 10/5')
    expect(html).toContain('일 10/11')
  })

  it('칸의 카드 수 숫자는 그날 entries.length다', () => {
    const week = makeWeek()
    const html = renderToStaticMarkup(<HomePreviewWeekStrip days={week} selectedDate="2026-10-05" onSelect={vi.fn()} />)
    const counts = [...html.matchAll(/data-day-count[^>]*>(\d+)</g)].map((m) => Number(m[1]))
    expect(counts).toEqual(week.map((day) => day.entries.length))
    expect(counts).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('모양별 막대는 카드 한 장이 한 조각이고 모양마다 다른 회색이며 title 툴팁으로 읽는다', () => {
    const day = makeDay('2026-10-05', [live('a', 'hero'), live('b', 'hero'), live('c', 'square'), pending('d', [], 'brief')])
    const html = renderToStaticMarkup(<HomePreviewWeekStrip days={[day]} selectedDate="2026-10-05" onSelect={vi.fn()} />)
    expect(html.match(/data-shape=/g)).toHaveLength(4)
    expect(html).toContain('title="히어로 2장"')
    expect(html).toContain('title="정사각 1장"')
    expect(html).toContain('title="간단 1장"')
    expect(html).toContain(SHAPE_STYLES.hero.barClass)
    expect(html).toContain(SHAPE_STYLES.square.barClass)
    expect(new Set(Object.values(SHAPE_STYLES).map((s) => s.barClass)).size).toBe(Object.keys(SHAPE_STYLES).length)
  })

  it('승인 전 카드가 있는 날만 점선 점과 «승인 전 N»을 보인다', () => {
    const html = render()
    // makeWeek: 넷째 날(10/8)부터 마지막 카드가 승인 전이다 → 10/8·9·10·11 네 칸
    expect(html.match(/data-pending-dot/g)).toHaveLength(4)
    expect(html.match(/승인 전 1</g)).toHaveLength(4)
    const none = renderToStaticMarkup(<HomePreviewWeekStrip days={[makeDay('2026-10-05', [live('a')])]} selectedDate="2026-10-05" onSelect={vi.fn()} />)
    expect(none).not.toContain('승인 전')
  })

  it('선택한 칸만 테두리로 강조하고 aria-pressed가 참이다', () => {
    const html = render('2026-10-07')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html.match(/border-2 border-foreground/g)).toHaveLength(1)
    expect(html).toMatch(/data-day-cell="2026-10-07"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-day-cell="2026-10-07"/)
  })

  it('칸을 누르면 그 날짜로 onSelect가 불린다', () => {
    const onSelect = vi.fn()
    const tree = HomePreviewWeekStrip({ days: makeWeek(), selectedDate: '2026-10-05', onSelect })
    const cells = findAll(tree, (el) => el.type === 'button')
    expect(cells).toHaveLength(7)
    ;(cells[3].props.onClick as () => void)()
    expect(onSelect).toHaveBeenCalledWith('2026-10-08')
  })
})
