/**
 * 주간 흐름 지도 계산 (티켓 20261026_2023 1회차, 어드민 상황판 PRD §6.2)
 *
 * 지키는 것: 열 7개와 「내 결정」 강조, 최근 5주 범위·정렬, 규칙 1(항목 상태로 정류장 놓기, 여러 정류장, 일부 실패),
 * 규칙 2(단계 기록·기록 없음), 규칙 3(시작 기록만 있는 주, 멈춤), 시험 묶음 제외·포함, 한 주에 묶음 여럿, 센 항목 제외 규칙.
 */
import { describe, expect, it } from 'vitest'
import { FLOW_COLUMNS, FLOW_COLUMN_KEYS, computeWeekFlow, weekStartOfRecord, type FlowColumnState } from '@/lib/admin/opsBoard/weekFlow'
import { NOW, WEEK_STARTS, makeBundle, makeItem, makeStage, makeStart } from './fixtures'

function column(columns: FlowColumnState[], key: string): FlowColumnState {
  const found = columns.find((c) => c.key === key)
  if (!found) throw new Error(`열 없음: ${key}`)
  return found
}

function thisWeek(input: Parameters<typeof computeWeekFlow>[0]) {
  return computeWeekFlow(input)[0]
}

describe('열 정의', () => {
  it('7개이고 「내 결정」 열만 강조한다', () => {
    expect(FLOW_COLUMNS.map((c) => c.key)).toEqual(['plan', 'world_review', 'balance_check', 'decision', 'schedule', 'live', 'result'])
    expect(FLOW_COLUMNS.map((c) => c.owner)).toEqual(['윤진', '윈터', '혜린', '나', '시스템', '시스템', '카즈하'])
    expect(FLOW_COLUMNS.filter((c) => c.emphasis).map((c) => c.key)).toEqual(['decision'])
  })
})

describe('5주 범위와 정렬', () => {
  it('이번 주부터 거꾸로 5행이고 행마다 열 7개다', () => {
    const rows = computeWeekFlow({ bundles: [], starts: [], now: NOW })
    expect(rows.map((r) => r.weekStart)).toEqual(WEEK_STARTS)
    expect(rows.map((r) => r.week)).toEqual(['2026-W44', '2026-W43', '2026-W42', '2026-W41', '2026-W40'])
    expect(rows[0].weekEnd).toBe('2026-11-01')
    for (const row of rows) expect(row.columns.map((c) => c.key)).toEqual([...FLOW_COLUMN_KEYS])
  })

  it('weeks로 주 수를 바꿀 수 있다', () => {
    expect(computeWeekFlow({ bundles: [], starts: [], now: NOW, weeks: 2 })).toHaveLength(2)
  })

  it('묶음도 시작 기록도 없는 주는 모든 열이 upcoming이다', () => {
    const [row] = computeWeekFlow({ bundles: [], starts: [], now: NOW })
    expect(row.title).toBeNull()
    expect(row.problemCount).toBe(0)
    expect(row.columns.every((c) => c.phase === 'upcoming' && c.count === null && c.screenState === null && c.note === null)).toBe(true)
  })

  it('5주 밖 묶음은 행에 나오지 않는다', () => {
    const old = makeBundle({ week: '2026-W39', statuses: ['arrived'] })
    const rows = computeWeekFlow({ bundles: [old], starts: [], now: NOW })
    expect(rows.every((r) => r.columns.every((c) => c.phase === 'upcoming'))).toBe(true)
  })

  it('week 칸이 틀리면 받은 시각의 주에 놓는다', () => {
    const bundle = makeBundle({ week: null, receivedAt: '2026-10-20T09:00:00+09:00', statuses: ['arrived'] })
    const rows = computeWeekFlow({ bundles: [bundle], starts: [], now: NOW })
    expect(column(rows[1].columns, 'decision').count).toBe(1)
  })

  it('weekStartOfRecord: ISO 주차를 월요일로 바꾼다', () => {
    expect(weekStartOfRecord('2026-W44', null)).toBe('2026-10-26')
    expect(weekStartOfRecord('2026-W01', null)).toBe('2025-12-29')
    expect(weekStartOfRecord('2026-W99', '2026-10-28T12:00:00+09:00')).toBe('2026-10-26')
    expect(weekStartOfRecord(null, null)).toBeNull()
  })
})

describe('규칙 1: 묶음이 있는 주', () => {
  it('전부 도착이면 결정 열이 current(결정 필요)이고 앞 열은 done, 뒤 열은 upcoming이다', () => {
    const row = thisWeek({ bundles: [makeBundle({ statuses: ['arrived', 'arrived', 'reviewing'] })], starts: [], now: NOW })
    expect(column(row.columns, 'decision')).toMatchObject({ phase: 'current', count: 3, screenState: 'decide' })
    for (const key of ['plan', 'world_review', 'balance_check']) expect(column(row.columns, key).phase).toBe('done')
    for (const key of ['schedule', 'live', 'result']) expect(column(row.columns, key)).toMatchObject({ phase: 'upcoming', count: null })
  })

  it('승인됨·준비중·예약됨은 예약 열에 합쳐 센다', () => {
    const row = thisWeek({ bundles: [makeBundle({ statuses: ['approved', 'preparing', 'scheduled'] })], starts: [], now: NOW })
    expect(column(row.columns, 'decision')).toMatchObject({ phase: 'done', count: null })
    expect(column(row.columns, 'schedule')).toMatchObject({ phase: 'current', count: 3, screenState: 'progress' })
  })

  it('일부는 이미 게재중이면 두 열 모두 개수와 함께 current다', () => {
    const row = thisWeek({ bundles: [makeBundle({ statuses: ['scheduled', 'scheduled', 'live'] })], starts: [], now: NOW })
    expect(column(row.columns, 'schedule')).toMatchObject({ phase: 'current', count: 2, screenState: 'progress' })
    expect(column(row.columns, 'live')).toMatchObject({ phase: 'current', count: 1, screenState: 'live' })
    expect(column(row.columns, 'result').phase).toBe('upcoming')
  })

  it('앞쪽(결정)과 뒤쪽(게재)에 항목이 있고 사이가 비면 사이 열은 upcoming이다', () => {
    const row = thisWeek({ bundles: [makeBundle({ statuses: ['arrived', 'live'] })], starts: [], now: NOW })
    expect(column(row.columns, 'decision').phase).toBe('current')
    expect(column(row.columns, 'schedule').phase).toBe('upcoming')
    expect(column(row.columns, 'live').phase).toBe('current')
  })

  it('종료는 결과 열이고 그 앞 열은 done이다', () => {
    const row = thisWeek({ bundles: [makeBundle({ statuses: ['ended', 'ended'] })], starts: [], now: NOW })
    expect(column(row.columns, 'result')).toMatchObject({ phase: 'current', count: 2, screenState: 'done' })
    for (const key of ['decision', 'schedule', 'live']) expect(column(row.columns, key).phase).toBe('done')
  })

  it('반려·취소는 어느 열에도 세지 않는다', () => {
    const row = thisWeek({ bundles: [makeBundle({ statuses: ['arrived', 'rejected', 'cancelled'] })], starts: [], now: NOW })
    expect(column(row.columns, 'decision').count).toBe(1)
    expect(row.columns.reduce((sum, c) => sum + (c.count ?? 0), 0)).toBe(1)
  })

  it('센 항목이 하나도 없으면(전부 반려) 결정 열까지만 done이고 뒤는 upcoming이다', () => {
    const row = thisWeek({ bundles: [makeBundle({ statuses: ['rejected', 'rejected'] })], starts: [], now: NOW })
    expect(column(row.columns, 'decision')).toMatchObject({ phase: 'done', count: null })
    for (const key of ['schedule', 'live', 'result']) expect(column(row.columns, key).phase).toBe('upcoming')
  })

  it('일부 실패: 예약 열에 문제 정류장이 더해지고 행 문제 수가 센다', () => {
    const row = thisWeek({ bundles: [makeBundle({ statuses: ['scheduled', 'scheduled', 'failed'] })], starts: [], now: NOW })
    expect(column(row.columns, 'schedule')).toMatchObject({ phase: 'current', count: 2, screenState: 'progress', problemCount: 1 })
    expect(row.problemCount).toBe(1)
  })

  it('실패만 있어도 예약 열이 문제 정류장으로 current다', () => {
    const row = thisWeek({ bundles: [makeBundle({ statuses: ['failed', 'failed'] })], starts: [], now: NOW })
    expect(column(row.columns, 'schedule')).toMatchObject({ phase: 'current', count: null, screenState: 'problem', problemCount: 2 })
    expect(column(row.columns, 'decision').phase).toBe('done')
    expect(row.problemCount).toBe(2)
  })

  it('10개 밖 상태 값과 패턴 제안 항목은 세지 않는다', () => {
    const bundle = makeBundle({ statuses: ['arrived', 'weird'] })
    bundle.items.push(makeItem('arrived', { bundleId: bundle.id, kind: 'pattern_proposal' }))
    bundle.items.push(makeItem('failed', { bundleId: bundle.id, kind: 'pattern_proposal' }))
    const row = thisWeek({ bundles: [bundle], starts: [], now: NOW })
    expect(column(row.columns, 'decision').count).toBe(1)
    expect(row.problemCount).toBe(0)
  })
})

describe('규칙 2: 기획·세계관 검수·밸런스 점검 열', () => {
  it('단계 기록이 있으면 done이고 제외 건수가 있으면 「N건 뺌」이다', () => {
    const bundle = makeBundle({
      statuses: ['arrived'],
      stages: [makeStage('plan', { outCount: 60 }), makeStage('world_review', { outCount: 58, excludedCount: 2 }), makeStage('balance_check', { outCount: 57, excludedCount: 0 })],
    })
    const row = thisWeek({ bundles: [bundle], starts: [], now: NOW })
    expect(column(row.columns, 'plan')).toMatchObject({ phase: 'done', note: '60건' })
    expect(column(row.columns, 'world_review')).toMatchObject({ phase: 'done', note: '2건 뺌' })
    // 제외 0건이면 「0건 뺌」이 아니라 남은 건수를 쓴다.
    expect(column(row.columns, 'balance_check')).toMatchObject({ phase: 'done', note: '57건' })
  })

  it('기록은 있는데 건수가 둘 다 없으면 note는 null이다', () => {
    const bundle = makeBundle({ statuses: ['arrived'], stages: [makeStage('plan')] })
    expect(column(thisWeek({ bundles: [bundle], starts: [], now: NOW }).columns, 'plan')).toMatchObject({ phase: 'done', note: null })
  })

  it('단계 기록이 없는 옛 묶음은 세 열이 done + 「기록 없음」이다', () => {
    const row = thisWeek({ bundles: [makeBundle({ statuses: ['arrived'] })], starts: [], now: NOW })
    for (const key of ['plan', 'world_review', 'balance_check']) expect(column(row.columns, key)).toMatchObject({ phase: 'done', note: '기록 없음', count: null })
  })
})

describe('규칙 3: 묶음 없이 시작 기록만 있는 주', () => {
  it('기획 열이 current + 진행 중 + 「시작 후 N분」이다', () => {
    const row = thisWeek({ bundles: [], starts: [makeStart({ startedAt: '2026-10-28T11:30:00+09:00' })], now: NOW })
    expect(column(row.columns, 'plan')).toMatchObject({ phase: 'current', screenState: 'progress', note: '시작 후 30분' })
    for (const key of FLOW_COLUMN_KEYS.filter((k) => k !== 'plan')) expect(column(row.columns, key).phase).toBe('upcoming')
  })

  it('3시간이 지나도 묶음이 안 오면 문제 + 「루틴이 멈췄어요」다', () => {
    const row = thisWeek({ bundles: [], starts: [makeStart({ startedAt: '2026-10-28T08:00:00+09:00' })], now: NOW })
    expect(column(row.columns, 'plan')).toMatchObject({ phase: 'current', screenState: 'problem', note: '루틴이 멈췄어요' })
  })

  it('묶음과 이어진 시작 기록은 규칙 3에 쓰지 않는다', () => {
    const row = thisWeek({ bundles: [], starts: [makeStart({ bundleId: 'some-bundle' })], now: NOW })
    expect(row.columns.every((c) => c.phase === 'upcoming')).toBe(true)
  })

  it('같은 주에 묶음이 있으면 규칙 1이 이긴다', () => {
    const row = thisWeek({ bundles: [makeBundle({ statuses: ['arrived'] })], starts: [makeStart()], now: NOW })
    expect(column(row.columns, 'plan').note).toBe('기록 없음')
  })
})

describe('시험 묶음', () => {
  const sample = makeBundle({ isSample: true, statuses: ['arrived', 'arrived'] })

  it('기본은 세지 않는다', () => {
    const row = thisWeek({ bundles: [sample], starts: [], now: NOW })
    expect(row.columns.every((c) => c.phase === 'upcoming')).toBe(true)
  })

  it('includeSample이면 센다', () => {
    const row = thisWeek({ bundles: [sample], starts: [], now: NOW, includeSample: true })
    expect(column(row.columns, 'decision').count).toBe(2)
  })
})

describe('한 주에 묶음이 여럿', () => {
  it('항목을 합쳐 한 행으로 세고 제목은 가장 늦게 받은 묶음의 제목이다', () => {
    const early = makeBundle({ title: '먼저 온 기획', receivedAt: '2026-10-26T09:00:00+09:00', statuses: ['arrived', 'arrived'], stages: [makeStage('plan', { outCount: 30 })] })
    const late = makeBundle({ title: '나중 온 기획', receivedAt: '2026-10-27T09:00:00+09:00', statuses: ['arrived', 'scheduled', 'failed'], stages: [makeStage('plan', { outCount: 10 })] })
    const rows = computeWeekFlow({ bundles: [early, late], starts: [], now: NOW })
    expect(rows[0].title).toBe('나중 온 기획')
    expect(column(rows[0].columns, 'decision').count).toBe(3)
    expect(column(rows[0].columns, 'schedule')).toMatchObject({ count: 1, problemCount: 1 })
    expect(column(rows[0].columns, 'plan').note).toBe('40건')
    expect(rows[0].problemCount).toBe(1)
  })

  it('가장 늦게 받은 묶음에 제목이 없으면 제목은 null이다', () => {
    const early = makeBundle({ title: '제목 있음', receivedAt: '2026-10-26T09:00:00+09:00', statuses: ['arrived'] })
    const late = makeBundle({ title: null, receivedAt: '2026-10-27T09:00:00+09:00', statuses: ['arrived'] })
    expect(computeWeekFlow({ bundles: [early, late], starts: [], now: NOW })[0].title).toBeNull()
  })
})

describe('세 주차 시나리오(완료 조건): 도착, 예약됨, 일부 실패', () => {
  it('주차마다 단계에 맞는 정류장과 화면 상태가 나온다', () => {
    const rows = computeWeekFlow({
      bundles: [
        makeBundle({ week: '2026-W44', statuses: ['arrived', 'arrived'] }),
        makeBundle({ week: '2026-W43', statuses: ['scheduled', 'scheduled'] }),
        makeBundle({ week: '2026-W42', statuses: ['scheduled', 'failed'] }),
      ],
      starts: [],
      now: NOW,
    })
    expect(column(rows[0].columns, 'decision').screenState).toBe('decide')
    expect(column(rows[1].columns, 'schedule').screenState).toBe('progress')
    expect(column(rows[2].columns, 'schedule')).toMatchObject({ screenState: 'progress', problemCount: 1 })
    expect(rows.map((r) => r.problemCount)).toEqual([0, 0, 1, 0, 0])
  })
})
