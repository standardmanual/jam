/**
 * 밸런스 설정 «최근 변경» 목록 (티켓 20261022_1132 1회) — 서버 렌더(`renderToStaticMarkup`)로 그린 모양만 고정한다. 지키는 것:
 * - 한 줄에 누가(표시 이름) · 언제(KST), 바꾼 칸의 «이름: 이전 → 새 값», 메모가 보인다. 값에는 단위가 붙고 천 단위 쉼표가 있다
 * - 이름을 모르면 «알 수 없음», 확률 안내에 반영된 칸이 있으면 칩이 보인다
 * - 이력이 없으면 안내 문장, 읽지 못했으면(null) 불러오기 실패 문장
 * - 어드민 ID·이메일은 어디에도 나오지 않는다
 * - 제목 ID는 구역 키가 들어가 구역이 여럿이어도 겹치지 않는다. 한국어 요소에 줄바꿈 클래스가 붙어 있다
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BalanceHistoryEntry } from '@/lib/admin/balance/history'
import { BalanceHistory, DISCLOSURE_CHIP_LABEL, HISTORY_EMPTY_MESSAGE, HISTORY_FAILED_MESSAGE } from '../BalanceHistory'

const LABELS = { intensity_normal: '강도 배율 · 보통', mass_earn_alert_no_history_amount: '대량 수령 경보 기준 · 지난 기록이 없을 때 기준' }
const UNITS = { intensity_normal: '배', mass_earn_alert_no_history_amount: '잼' }

function entry(overrides: Partial<BalanceHistoryEntry> = {}): BalanceHistoryEntry {
  return {
    id: 'h-1',
    sectionKey: 'jam',
    changes: [{ field: 'intensity_normal', from: 2, to: 4 }],
    note: null,
    affectsDisclosure: false,
    changedByName: 'karina',
    // 2026-10-22 01:30 UTC = 10:30 KST
    createdAt: '2026-10-22T01:30:00.000+00:00',
    ...overrides,
  }
}

const html = (entries: BalanceHistoryEntry[] | null) =>
  renderToStaticMarkup(<BalanceHistory sectionId="jam" entries={entries} labels={LABELS} units={UNITS} />).replace(/<!-- -->/g, '')

describe('BalanceHistory', () => {
  it('누가 · 언제(KST), 바꾼 칸의 이전 → 새 값이 보인다', () => {
    const out = html([entry()])
    expect(out).toContain('karina · 2026.10.22 10:30')
    expect(out).toContain('강도 배율 · 보통: 2배 → 4배')
  })

  it('여러 칸과 메모가 한 줄 안에 보이고 큰 수는 쉼표가 있다', () => {
    const out = html([
      entry({
        changes: [
          { field: 'intensity_normal', from: 2, to: 3 },
          { field: 'mass_earn_alert_no_history_amount', from: 1200, to: 2400 },
        ],
        note: '주말 이벤트',
      }),
    ])
    expect(out).toContain('강도 배율 · 보통: 2배 → 3배')
    expect(out).toContain('지난 기록이 없을 때 기준: 1,200잼 → 2,400잼')
    expect(out).toContain('메모: 주말 이벤트')
    expect([...out.matchAll(/<li class="space-y-1/g)]).toHaveLength(1)
  })

  it('이름을 모르면 «알 수 없음», 메모가 없으면 메모 줄이 없다', () => {
    const out = html([entry({ changedByName: null })])
    expect(out).toContain('알 수 없음 · 2026.10.22 10:30')
    expect(out).not.toContain('메모:')
  })

  it('확률 안내에 반영된 칸이 있는 저장에만 칩이 있다', () => {
    expect(html([entry()])).not.toContain(DISCLOSURE_CHIP_LABEL)
    expect(html([entry({ affectsDisclosure: true })])).toContain(DISCLOSURE_CHIP_LABEL)
  })

  it('라벨에 없는 칸 이름은 그대로 보인다', () => {
    expect(html([entry({ changes: [{ field: 'chapter:3', from: 110, to: 120 }] })])).toContain('chapter:3: 110 → 120')
  })

  it('이력이 없으면 안내, 읽지 못했으면 실패 문장이다', () => {
    expect(html([])).toContain(HISTORY_EMPTY_MESSAGE)
    expect(html(null)).toContain(HISTORY_FAILED_MESSAGE)
    expect(html([])).not.toContain(HISTORY_FAILED_MESSAGE)
    expect(html(null)).not.toContain(HISTORY_EMPTY_MESSAGE)
  })

  it('어드민 ID·이메일은 어디에도 나오지 않는다', () => {
    const out = html([entry()])
    expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
    expect(out).not.toContain('@')
  })

  it('제목 ID에 구역 키가 들어가 있다', () => {
    expect(html([])).toContain('id="balance-jam-history-title"')
    expect(html([])).toContain('aria-labelledby="balance-jam-history-title"')
  })

  it('이름·시각·칸·메모·안내 문장에 줄바꿈 클래스가 붙어 있다', () => {
    const out = html([entry({ note: '메모 문장', affectsDisclosure: true })])
    for (const text of ['최근 변경', 'karina', '강도 배율 · 보통', '메모: 메모 문장', DISCLOSURE_CHIP_LABEL]) {
      const match = out.match(new RegExp(`<(h3|p|li|span)[^>]*class="([^"]*)"[^>]*>(?:[^<]*)${text}`))
      expect(match, text).not.toBeNull()
      expect(match?.[2], text).toContain('break-keep')
      expect(match?.[2], text).toContain('wrap-break-word')
    }
  })
})
