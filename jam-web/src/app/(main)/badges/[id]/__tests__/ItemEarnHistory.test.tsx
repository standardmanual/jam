/**
 * 아이템 배지 상세의 «획득 이력» (티켓 20261107_1944)
 *
 * 첫 항목은 카드, 2번째부터는 날짜가 제목인 ListRow다. 행마다 클릭 영역(<button>)이 하나고
 * 누르면 바텀시트가 열린다. 클릭 영역 안에는 <div>·<p>를 두지 않는다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/[id]/__tests__/ItemEarnHistory.test.tsx"
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ItemEarnHistory, { type ItemEarnEntry } from '../ItemEarnHistory'
import { formatKoreanDateTime } from '@/components/LocalDate'
import { d } from '@/lib/i18n'

function entry(id: string, iso: string): ItemEarnEntry {
  return { id, serial: `S-${id}`, obtained_at: iso, expires_at: null }
}

/** ListRow가 행마다 내보내는 <style>의 CSS 글자를 먼저 걷는다 */
function withoutStyle(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, '')
}

const THREE = [entry('c', '2026-10-03T00:00:00Z'), entry('b', '2026-09-03T00:00:00Z'), entry('a', '2026-08-03T00:00:00Z')]

describe('ItemEarnHistory — 획득 이력', () => {
  it('<button> 개수가 2번째부터의 행 수와 같다', () => {
    const html = withoutStyle(renderToStaticMarkup(<ItemEarnHistory items={THREE} activeItemId="c" />))
    expect(html.match(/<button/g) ?? []).toHaveLength(2)
  })

  it('행 제목이 날짜 문자열이다', () => {
    const html = withoutStyle(renderToStaticMarkup(<ItemEarnHistory items={THREE} activeItemId="c" />))
    const rows = html.match(/<button[\s\S]*?<\/button>/g) ?? []
    expect(rows[0]).toContain(formatKoreanDateTime('2026-09-03T00:00:00Z', { year: true }))
    expect(rows[1]).toContain(formatKoreanDateTime('2026-08-03T00:00:00Z', { year: true }))
  })

  it('클릭 영역 안에 <p>·<div>가 없다', () => {
    const html = withoutStyle(renderToStaticMarkup(<ItemEarnHistory items={THREE} activeItemId="c" />))
    for (const row of html.match(/<button[\s\S]*?<\/button>/g) ?? []) {
      expect(row).not.toMatch(/<(div|p)[\s>]/)
    }
  })

  it('항목이 하나뿐이면 행이 없다', () => {
    const html = renderToStaticMarkup(<ItemEarnHistory items={[entry('a', '2026-08-03T00:00:00Z')]} />)
    expect(html).not.toContain('<button')
  })

  it('항목이 없으면 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<ItemEarnHistory items={[]} />)).toBe('')
  })

  it('첫 카드는 획득일 다음 만료일 순서로 나오고 만료가 없으면 «없음» 문구를 낸다', () => {
    const html = withoutStyle(renderToStaticMarkup(<ItemEarnHistory items={[entry('a', '2026-08-03T00:00:00Z')]} />))
    const order = [d.inventory.obtainedAt, d.inventory.expiresAt, d.inventory.expiresNone].map((x) => html.indexOf(x))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).not.toContain('text-[14px]')
  })
})
