/**
 * 체크인 배지 상세의 «방문 기록» (티켓 20261018_1817, 2회)
 *
 * 제목은 «방문 기록»이고 개수는 «총 {count}회»를 유지한다. 목록은 최신순이라 마지막 행이 가장
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

function count(html: string, text: string): number {
  return html.split(text).length - 1
}

const THREE = [earn('c', '2026-10-03T00:00:00Z'), earn('b', '2026-09-03T00:00:00Z'), earn('a', '2026-08-03T00:00:00Z')]

describe('PoiEarnHistory — 방문 기록', () => {
  it('제목이 «방문 기록»이고 «총 N회»를 보인다', () => {
    const html = renderToStaticMarkup(<PoiEarnHistory poiEarns={THREE} />)
    expect(html).toContain('방문 기록')
    expect(html).not.toContain('획득 이력')
    expect(html).toContain('총 3회')
  })

  it('«처음 받은 날» 칩은 가장 오래된(마지막) 행 하나에만 붙는다', () => {
    const html = renderToStaticMarkup(<PoiEarnHistory poiEarns={THREE} />)
    expect(count(html, d.badges.firstEarnedChip)).toBe(1)
    // 칩은 목록 끝 행에 있고, 최신 카드(첫 행)보다 뒤에 나온다
    expect(html.indexOf(d.badges.firstEarnedChip)).toBeGreaterThan(html.indexOf('총 3회'))
    expect(html.lastIndexOf('<button')).toBeLessThan(html.indexOf(d.badges.firstEarnedChip))
  })

  it('행이 하나뿐이면 그 카드에 칩이 붙는다', () => {
    const html = renderToStaticMarkup(<PoiEarnHistory poiEarns={[earn('a', '2026-08-03T00:00:00Z')]} />)
    expect(count(html, d.badges.firstEarnedChip)).toBe(1)
    expect(html).toContain('총 1회')
  })

  it('기록이 없으면 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<PoiEarnHistory poiEarns={[]} />)).toBe('')
  })
})
