/**
 * 아이템 배지 상세의 «획득 정보» (티켓 20261107_1944, 2026-11-09 사용자 지시로 «획득 이력» → «획득 정보»)
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

describe('ItemEarnHistory — 획득 정보', () => {
  it('<button> 개수가 2번째부터의 행 수와 같다', () => {
    const html = withoutStyle(renderToStaticMarkup(<ItemEarnHistory items={THREE} activeItemId="c" />))
    expect(html.match(/<button/g) ?? []).toHaveLength(2)
  })

  it('행 제목이 날짜 문자열이다', () => {
    const html = withoutStyle(renderToStaticMarkup(<ItemEarnHistory items={THREE} activeItemId="c" />))
    const rows = html.match(/<button[\s\S]*?<\/button>/g) ?? []
    // 일시는 모두 년월일시다(2026-11-09 사용자 지시)
    expect(rows[0]).toContain(formatKoreanDateTime('2026-09-03T00:00:00Z', { year: true, time: true }))
    expect(rows[1]).toContain(formatKoreanDateTime('2026-08-03T00:00:00Z', { year: true, time: true }))
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

  it('첫 카드는 획득 일시 다음 만료 일시 순서로 나오고 둘 다 년월일시다', () => {
    const html = withoutStyle(
      renderToStaticMarkup(<ItemEarnHistory items={[{ ...entry('a', '2026-08-03T00:00:00Z'), expires_at: '2026-09-03T05:30:00Z' }]} />),
    )
    const order = [d.inventory.obtainedAt, d.inventory.expiresAt].map((x) => html.indexOf(x))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain(formatKoreanDateTime('2026-08-03T00:00:00Z', { year: true, time: true }))
    expect(html).toContain(formatKoreanDateTime('2026-09-03T05:30:00Z', { year: true, time: true }))
    expect(html).not.toContain('text-[14px]')
  })

  it('만료가 없는 개체는 만료 일시 줄을 그리지 않는다 (2026-11-09 사용자 지시)', () => {
    const html = withoutStyle(renderToStaticMarkup(<ItemEarnHistory items={[entry('a', '2026-08-03T00:00:00Z')]} />))

    expect(html).toContain(d.inventory.obtainedAt)
    expect(html).not.toContain(d.inventory.expiresAt)
    expect(html).not.toContain('없음')
    expect(Object.keys(d.inventory)).not.toContain('expiresNone')
  })

  it('제목은 «획득 정보»이고 오른쪽의 «총 N회»가 없다 (2026-11-09 사용자 지시)', () => {
    const html = withoutStyle(renderToStaticMarkup(<ItemEarnHistory items={THREE} activeItemId="c" />))

    expect(html).toContain('획득 정보')
    expect(html).not.toContain('획득 이력')
    expect(html).not.toMatch(/총 \d+회/)
  })

  it('라벨은 «획득 일시»·«만료 일시»다(이전의 «획득일»·«만료일»이 아니다)', () => {
    const html = withoutStyle(
      renderToStaticMarkup(<ItemEarnHistory items={[{ ...entry('a', '2026-08-03T00:00:00Z'), expires_at: '2026-09-03T05:30:00Z' }]} />),
    )

    expect(html).toContain('획득 일시')
    expect(html).toContain('만료 일시')
    expect(html).not.toMatch(/획득일|만료일/)
    // 문구 사전의 값도 같다
    expect(d.inventory.obtainedAt).toBe('획득 일시')
    expect(d.inventory.expiresAt).toBe('만료 일시')
  })
})
