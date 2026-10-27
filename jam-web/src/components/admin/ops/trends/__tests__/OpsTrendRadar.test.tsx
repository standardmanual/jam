/**
 * 읽은 트렌드 레이더의 초기 렌더 (티켓 20261026_2033 2회차)
 *
 * 저장소에 jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양을 고정한다:
 * 요약 줄, 빈 상태, 결과 칩(반영·보류·자동 제외 + 범주), 출처 칩(이름 있음·없음), 추이 막대(`style` 속성 없음), 연결 항목 링크 주소.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import type { RadarEntry } from '@/lib/admin/opsTrends/radar'
import { OpsTrendRadar, TREND_RADAR_EMPTY, trendLinkedItemsHref } from '../OpsTrendRadar'
import { OpsTrendSparkline, sparklineBars } from '../OpsTrendSparkline'

const flat = (node: ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')

function entry(overrides: Partial<RadarEntry['trend']> = {}, extra: Partial<RadarEntry> = {}): RadarEntry {
  return {
    bundleId: 'bundle-uuid-1',
    bundleTitle: '비 오는 날 러닝',
    week: '2026-W44',
    receivedAt: '2026-10-26T00:30:00Z',
    linkedItemCount: 2,
    trend: {
      index: 1,
      label: '러닝 크루',
      sourceNos: [1, 7],
      summary: '크루 모집 글이 늘고 있어요',
      series: null,
      outcome: 'used',
      outcomeReason: null,
      ...overrides,
    },
    ...extra,
  }
}

const summary = { used: 1, held: 0, excluded: 0 }
const names = new Map([[1, '러닝 해시태그']])

describe('OpsTrendRadar', () => {
  it('트렌드가 없으면 한 줄 안내만 보인다', () => {
    const out = flat(<OpsTrendRadar entries={[]} summary={{ used: 0, held: 0, excluded: 0 }} sourceNames={names} includeSample={false} />)
    expect(out).toContain(TREND_RADAR_EMPTY)
    expect(out).not.toContain('반영')
  })

  it('요약 줄에 반영·보류·자동 제외 건수가 글자로 나온다', () => {
    const out = flat(<OpsTrendRadar entries={[entry()]} summary={{ used: 3, held: 2, excluded: 1 }} sourceNames={names} includeSample={false} />)
    expect(out).toMatch(/반영 <span[^>]*>3<\/span>/)
    expect(out).toMatch(/보류 <span[^>]*>2<\/span>/)
    expect(out).toMatch(/자동 제외 <span[^>]*>1<\/span>/)
  })

  it('카드에 이름·요약·결과 칩·받은 기획 제목과 시각이 나온다', () => {
    const out = flat(<OpsTrendRadar entries={[entry()]} summary={summary} sourceNames={names} includeSample={false} />)
    expect(out).toContain('러닝 크루')
    expect(out).toContain('크루 모집 글이 늘고 있어요')
    expect(out).toContain('비 오는 날 러닝 · 10/26(월) 09:30')
  })

  it('출처 칩은 이름이 있으면 「출처 N · 이름」, 목록에 없으면 「출처 N」이다', () => {
    const out = flat(<OpsTrendRadar entries={[entry()]} summary={summary} sourceNames={names} includeSample={false} />)
    expect(out).toContain('출처 1 · 러닝 해시태그')
    expect(out).toMatch(/>출처 7</)
  })

  it('출처 목록을 못 읽어도(빈 지도) 번호 칩은 그려진다', () => {
    const out = flat(<OpsTrendRadar entries={[entry()]} summary={summary} sourceNames={new Map()} includeSample={false} />)
    expect(out).toMatch(/>출처 1</)
  })

  it('자동 제외는 범주를 한 줄로 보이고, 반영이 아니면 연결 항목 링크가 없다', () => {
    const out = flat(
      <OpsTrendRadar
        entries={[entry({ outcome: 'excluded', outcomeReason: '정치·사회 이슈' })]}
        summary={{ used: 0, held: 0, excluded: 1 }}
        sourceNames={names}
        includeSample={false}
      />
    )
    expect(out).toContain('제외 범주: 정치·사회 이슈')
    expect(out).not.toContain('연결 항목')
  })

  it('반영이면 「연결 항목 N건」이 걸러 보기 주소로 이어진다', () => {
    const out = flat(<OpsTrendRadar entries={[entry()]} summary={summary} sourceNames={names} includeSample={false} />)
    expect(out).toContain('href="/admin/ops-inbox/bundle-uuid-1?trend=1"')
    expect(out).toContain('연결 항목 2건')
  })

  it('시험 묶음 포함 중이면 링크에 sample=1이 붙는다', () => {
    expect(trendLinkedItemsHref(entry(), true)).toBe('/admin/ops-inbox/bundle-uuid-1?trend=1&sample=1')
    expect(trendLinkedItemsHref(entry(), false)).toBe('/admin/ops-inbox/bundle-uuid-1?trend=1')
  })

  it('연결 항목이 0건이면 링크 없이 글자만 보인다', () => {
    const out = flat(<OpsTrendRadar entries={[entry({}, { linkedItemCount: 0 })]} summary={summary} sourceNames={names} includeSample={false} />)
    expect(out).toContain('연결 항목 0건')
    expect(out).not.toContain('?trend=')
  })

  it('series가 있으면 SVG 막대를 그리고 style 속성은 쓰지 않는다', () => {
    const out = flat(<OpsTrendRadar entries={[entry({ series: [1, 2, 3, 4] })]} summary={summary} sourceNames={names} includeSample={false} />)
    expect(out).toContain('<svg')
    expect(out.match(/<rect/g)).toHaveLength(4)
    expect(out).not.toContain('style=')
  })

  it('series가 없으면 막대를 그리지 않는다', () => {
    const out = flat(<OpsTrendRadar entries={[entry()]} summary={summary} sourceNames={names} includeSample={false} />)
    expect(out).not.toContain('<svg')
  })
})

describe('OpsTrendSparkline', () => {
  it('값이 14개보다 적으면 오른쪽(최근)부터 채우고, 가장 큰 값이 가득 찬다', () => {
    const bars = sparklineBars([0, 5, 10])
    expect(bars).toHaveLength(3)
    expect(bars[2].height).toBe(24)
    expect(bars[1].height).toBe(12)
    expect(bars[0].height).toBe(1)
    expect(bars[2].x + bars[2].width).toBeCloseTo(84, 0)
  })

  it('모두 0 이하여도 바닥 선만 남기고 깨지지 않는다', () => {
    expect(sparklineBars([0, -3]).map((bar) => bar.height)).toEqual([1, 1])
  })

  it('접근 가능한 이름이 붙는다', () => {
    expect(flat(<OpsTrendSparkline series={[1, 2]} label="러닝 크루" />)).toContain('aria-label="러닝 크루 최근 14일 추이"')
  })
})
