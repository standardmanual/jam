/**
 * 체크인 배지 상세의 «방문 기록» (티켓 20261018_1817, 2회)
 *
 * 제목은 «방문 기록»이고 오른쪽의 «총 {count}회»는 없다(2026-11-09 사용자 지시, 횟수는 히어로 카드의 방문 횟수 칩이 말한다). 목록은 최신순이라 마지막 행이 가장
 * 오래된 방문이며, «처음 받은 날» 칩은 그 한 행에만 붙는다. 행이 하나뿐이면 그 행이 처음 받은 날이다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/[id]/__tests__/PoiEarnHistory.test.tsx"
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PoiEarnHistory, { type PoiEarnItem } from '../PoiEarnHistory'
import { d } from '@/lib/i18n'
import { formatKoreanDateTime } from '@/components/LocalDate'

function earn(id: string, iso: string): PoiEarnItem {
  return {
    id,
    earned_at: iso,
    triggered_by_activity_name: null,
    triggered_by_distance_km: null,
    triggered_by_activity_date: null,
    triggered_by_strava_id: null,
  }
}

/** ListRow가 행마다 내보내는 <style>의 CSS 글자를 먼저 걷는다 */
function withoutStyle(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, '')
}

/** 행마다 하나인 클릭 영역(<button>…</button>) 안쪽 마크업 */
function buttons(html: string): string[] {
  return withoutStyle(html).match(/<button[\s\S]*?<\/button>/g) ?? []
}

function count(html: string, text: string): number {
  return html.split(text).length - 1
}

const THREE = [earn('c', '2026-10-03T00:00:00Z'), earn('b', '2026-09-03T00:00:00Z'), earn('a', '2026-08-03T00:00:00Z')]

describe('PoiEarnHistory — 방문 기록', () => {
  it('제목이 «방문 기록»이고 «총 N회»는 없다', () => {
    const html = renderToStaticMarkup(<PoiEarnHistory poiEarns={THREE} />)
    expect(html).toContain('방문 기록')
    expect(html).not.toContain('획득 이력')
    expect(html).not.toContain('총 3회')
  })

  it('«처음 받은 날» 칩은 가장 오래된(마지막) 행 하나에만 붙는다', () => {
    const html = renderToStaticMarkup(<PoiEarnHistory poiEarns={THREE} />)
    expect(count(html, d.badges.firstEarnedChip)).toBe(1)
    // 칩은 목록 끝 행에 있고, 최신 카드(첫 행)보다 뒤에 나온다
    expect(html.indexOf(d.badges.firstEarnedChip)).toBeGreaterThan(html.indexOf('방문 기록'))
    expect(html.lastIndexOf('<button')).toBeLessThan(html.indexOf(d.badges.firstEarnedChip))
  })

  it('2번째부터의 행이 각각 날짜 제목을 가진 클릭 영역이고, 칩은 가장 오래된 행 안에만 있다', () => {
    const html = renderToStaticMarkup(<PoiEarnHistory poiEarns={THREE} />)
    const rows = buttons(html)
    // 첫 기록은 카드라 클릭 영역이 아니다 — 행은 나머지 둘이다
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain(formatKoreanDateTime('2026-09-03T00:00:00Z', { year: true, time: true }))
    expect(rows[1]).toContain(formatKoreanDateTime('2026-08-03T00:00:00Z', { year: true, time: true }))
    expect(rows[0]).not.toContain(d.badges.firstEarnedChip)
    expect(rows[1]).toContain(d.badges.firstEarnedChip)
    // 클릭 영역 안은 phrasing 요소만 쓴다
    for (const row of rows) expect(row).not.toMatch(/<(div|p)[\s>]/)
  })

  it('행이 하나뿐이면 그 카드에 칩이 붙는다', () => {
    const html = renderToStaticMarkup(<PoiEarnHistory poiEarns={[earn('a', '2026-08-03T00:00:00Z')]} />)
    expect(count(html, d.badges.firstEarnedChip)).toBe(1)
    expect(html).not.toContain('총 1회')
  })

  it('기록이 없으면 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<PoiEarnHistory poiEarns={[]} />)).toBe('')
  })

  it('첫 카드의 값 행은 라벨 다음에 값 순서로 나오고 긴 활동 이름이 말줄임 없이 전체로 나온다', () => {
    const longName = '토요일 아침 한강공원 장거리 러닝 크루 정기 모임 달리기와 아주긴이름없는띄어쓰기구간'
    const item: PoiEarnItem = {
      ...earn('a', '2026-08-03T00:00:00Z'),
      triggered_by_activity_name: longName,
      triggered_by_distance_km: 10.5,
    }
    const html = withoutStyle(renderToStaticMarkup(<PoiEarnHistory poiEarns={[item]} />))
    expect(html).toContain(longName)
    expect(html).not.toContain('truncate')
    expect(html).not.toContain('text-[14px]')
    const order = [d.badges.earnedAt, d.badges.triggerActivity, longName, d.badges.triggerDistance].map((x) => html.indexOf(x))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // 값이 없는 행(활동 날짜)은 통째로 빠진다
    expect(html).not.toContain(d.badges.triggerDate)
  })
})
