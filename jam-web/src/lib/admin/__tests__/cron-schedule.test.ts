/**
 * cronSchedule.ts — 어드민 메인 주간 캘린더의 크론 파싱·KST 변환 유닛테스트 (티켓 20260924_0904)
 *
 * 지키는 것:
 * 1. 매일 실행 크론은 KST hour 계산이 맞고 요일 7개 전부에 나타난다
 * 2. UTC→KST 변환에서 시(hour)가 24를 넘어 날짜 경계를 넘기면 요일이 하루 밀린다
 * 3. 매시간 크론(`0 * * * *`)은 시각을 나열하지 않고 요일당 한 줄(`hourly: true`)로 묶인다
 * 4. 해석할 수 없는 cron 식은 조용히 빈 배열을 반환한다(잘못된 값을 화면에 내보내지 않는다)
 * 5. 주 이동 유틸(월요일 계산 · 주간 범위 라벨)이 KST 달력 기준으로 정확하다
 * 6. 시 필드가 '*'이고 분 필드가 N분 간격인 크론(운영툴 상태 맞추기, 티켓 20261002_1814)은 하루 144번을 찍지 않고
 *    요일당 한 줄(`hourly: true`, `intervalMinutes: N`)로 묶여 「N분마다」로 보인다. N이 1~59의 정수가 아니면 건너뛴다
 */
import { describe, it, expect } from 'vitest'
import {
  cronToWeeklyOccurrences,
  getWeeklyCronOccurrences,
  formatOccurrenceTime,
  cronOccurrenceId,
  mondayOfWeek,
  normalizeWeekParam,
  formatWeekRangeLabel,
} from '../cronSchedule'

describe('cronToWeeklyOccurrences', () => {
  it('poi-cleanup(0 0 * * *) → 요일 7개 전부 KST 09:00', () => {
    const occ = cronToWeeklyOccurrences('/api/cron/poi-cleanup', '0 0 * * *')
    expect(occ).toHaveLength(7)
    expect(occ.every((o) => o.hour === 9 && o.minute === 0 && !o.hourly)).toBe(true)
    expect(new Set(occ.map((o) => o.weekday))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]))
  })

  it('external-inputs(0 21 * * *) → 날짜 경계를 넘겨 KST 06:00 (요일 순환은 그대로 7개 전부 유지)', () => {
    const occ = cronToWeeklyOccurrences('/api/cron/external-inputs', '0 21 * * *')
    expect(occ).toHaveLength(7)
    expect(occ.every((o) => o.hour === 6 && o.minute === 0 && !o.hourly)).toBe(true)
    expect(new Set(occ.map((o) => o.weekday))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]))
  })

  it('ambient-drop(0 * * * *) → 요일당 한 줄만 생성되고 hourly=true', () => {
    const occ = cronToWeeklyOccurrences('/api/cron/ambient-drop', '0 * * * *')
    expect(occ).toHaveLength(7)
    expect(occ.every((o) => o.hourly)).toBe(true)
    expect(occ.map((o) => formatOccurrenceTime(o))).toEqual(Array(7).fill('매시간'))
  })

  it('ops-reconcile(*/10 * * * *) → 요일당 한 줄만 생성되고 「10분마다」로 보인다', () => {
    const occ = cronToWeeklyOccurrences('/api/cron/ops-reconcile', '*/10 * * * *')
    expect(occ).toHaveLength(7)
    expect(occ.every((o) => o.hourly && o.intervalMinutes === 10)).toBe(true)
    expect(new Set(occ.map((o) => o.weekday))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]))
    expect(occ.map((o) => formatOccurrenceTime(o))).toEqual(Array(7).fill('10분마다'))
    expect(occ[0].label).toBe('운영 상태 맞추기')
  })

  it('요일이 지정된 N분 간격 크론(*/30 * * * 1)은 그 요일 한 줄만 「30분마다」', () => {
    const occ = cronToWeeklyOccurrences('/api/cron/example', '*/30 * * * 1')
    expect(occ).toHaveLength(1)
    expect(occ[0]).toMatchObject({ weekday: 1, hourly: true, intervalMinutes: 30 })
    expect(formatOccurrenceTime(occ[0])).toBe('30분마다')
  })

  it('N분 간격이 1~59의 정수가 아니면 빈 배열', () => {
    expect(cronToWeeklyOccurrences('/x', '*/0 * * * *')).toEqual([])
    expect(cronToWeeklyOccurrences('/x', '*/60 * * * *')).toEqual([])
    expect(cronToWeeklyOccurrences('/x', '*/abc * * * *')).toEqual([])
    expect(cronToWeeklyOccurrences('/x', '1-5/10 * * * *')).toEqual([])
  })

  it('요일이 지정된 크론(0 21 * * 1, UTC 월요일 21시)은 KST 화요일 06:00로 하루 밀린다', () => {
    const occ = cronToWeeklyOccurrences('/api/cron/example', '0 21 * * 1')
    expect(occ).toEqual([{ path: '/api/cron/example', label: '/api/cron/example', weekday: 2, hour: 6, minute: 0, hourly: false }])
  })

  it('날짜 경계를 넘기지 않는 요일 지정 크론(0 9 * * 3, UTC 수요일 9시)은 KST에서도 같은 요일', () => {
    const occ = cronToWeeklyOccurrences('/api/cron/example', '0 9 * * 3')
    expect(occ).toEqual([{ path: '/api/cron/example', label: '/api/cron/example', weekday: 3, hour: 18, minute: 0, hourly: false }])
  })

  it('필드 개수가 5개가 아니면 빈 배열', () => {
    expect(cronToWeeklyOccurrences('/x', '0 0 * *')).toEqual([])
  })

  it('범위·스텝처럼 해석할 수 없는 필드가 있으면 빈 배열', () => {
    expect(cronToWeeklyOccurrences('/x', '*/15 0 * * *')).toEqual([])
    expect(cronToWeeklyOccurrences('/x', '0 1-5 * * *')).toEqual([])
  })

  it('알 수 없는 경로는 경로 문자열 자체를 라벨로 쓴다', () => {
    const occ = cronToWeeklyOccurrences('/api/cron/unknown-path', '0 0 * * *')
    expect(occ[0].label).toBe('/api/cron/unknown-path')
  })
})

describe('cronOccurrenceId', () => {
  it('시 필드가 쉼표로 여러 값인 크론(0 6,18 * * *)은 같은 날짜에 서로 다른 id를 만든다(티켓 20260924_0930)', () => {
    // weekday='*'이므로 매 요일마다 전날 18시(dayShift로 하루 밀림)와 당일 6시가 겹쳐
    // 같은 weekday에 시각이 다른 occurrence 2개가 생긴다(cronToWeeklyOccurrences의 dayShift 계산).
    const occ = cronToWeeklyOccurrences('/api/cron/example', '0 6,18 * * *')
    const sameWeekday = occ.filter((o) => o.weekday === 1) // 월요일 칸
    expect(sameWeekday).toHaveLength(2)
    expect(new Set(sameWeekday.map((o) => o.hour)).size).toBe(2) // 시각이 서로 다르다

    const date = '2026-09-21'
    const ids = sameWeekday.map((o) => cronOccurrenceId(o, date))
    expect(new Set(ids).size).toBe(2) // id가 겹치지 않는다
  })

  it('기존 크론 4개는 id에 경로·날짜·시각이 그대로 들어간다(표시되는 시각·라벨·순서는 바뀌지 않는다)', () => {
    const date = '2026-09-22'
    const poiCleanup = cronToWeeklyOccurrences('/api/cron/poi-cleanup', '0 0 * * *')[0]
    expect(cronOccurrenceId(poiCleanup, date)).toBe('/api/cron/poi-cleanup-2026-09-22-09:00')

    const ambientDrop = cronToWeeklyOccurrences('/api/cron/ambient-drop', '0 * * * *')[0]
    expect(cronOccurrenceId(ambientDrop, date)).toBe('/api/cron/ambient-drop-2026-09-22-매시간')
  })

  it('N분 간격 크론도 id에 「N분마다」가 들어가 같은 날짜의 다른 크론과 겹치지 않는다', () => {
    const date = '2026-09-22'
    const opsReconcile = cronToWeeklyOccurrences('/api/cron/ops-reconcile', '*/10 * * * *')[0]
    expect(cronOccurrenceId(opsReconcile, date)).toBe('/api/cron/ops-reconcile-2026-09-22-10분마다')
  })
})

describe('getWeeklyCronOccurrences', () => {
  it('vercel.json의 crons 5개를 모두 변환한다(매일 3개 + 매시간 1개 + 10분마다 1개, 각 요일 7개)', () => {
    const occ = getWeeklyCronOccurrences()
    const paths = new Set(occ.map((o) => o.path))
    expect(paths).toEqual(
      new Set([
        '/api/cron/poi-cleanup',
        '/api/cron/notifications',
        '/api/cron/ambient-drop',
        '/api/cron/external-inputs',
        '/api/cron/ops-reconcile',
      ])
    )
    // 매일 실행 크론 3개(7개씩) + 매시간 크론 1개(7개) + 10분마다 크론 1개(7개) = 35개
    expect(occ).toHaveLength(35)
  })

  it('vercel.json의 ops-reconcile 크론은 달력에서 「10분마다」 한 줄로 보인다(하루 144번을 찍지 않는다)', () => {
    const occ = getWeeklyCronOccurrences().filter((o) => o.path === '/api/cron/ops-reconcile')
    expect(occ).toHaveLength(7)
    expect(occ.map((o) => formatOccurrenceTime(o))).toEqual(Array(7).fill('10분마다'))
    expect(occ.every((o) => o.label === '운영 상태 맞추기')).toBe(true)
  })
})

describe('mondayOfWeek', () => {
  it('목요일(2026-09-24)이 속한 주의 월요일은 2026-09-21', () => {
    expect(mondayOfWeek('2026-09-24')).toBe('2026-09-21')
  })
  it('일요일(2026-09-27)이 속한 주의 월요일은 2026-09-21', () => {
    expect(mondayOfWeek('2026-09-27')).toBe('2026-09-21')
  })
  it('월요일 자기 자신은 그대로 반환', () => {
    expect(mondayOfWeek('2026-09-21')).toBe('2026-09-21')
  })
})

describe('normalizeWeekParam', () => {
  it('유효한 날짜가 오면 그 주의 월요일로 정규화', () => {
    expect(normalizeWeekParam('2026-09-24')).toBe('2026-09-21')
  })
  it('값이 없거나 잘못되면 기준 시각이 속한 주의 월요일로 대체', () => {
    const now = new Date('2026-09-24T00:00:00Z') // KST 2026-09-24(목)
    expect(normalizeWeekParam(undefined, now)).toBe('2026-09-21')
    expect(normalizeWeekParam('not-a-date', now)).toBe('2026-09-21')
  })
})

describe('formatWeekRangeLabel', () => {
  it('월요일 날짜로 "N년 N월 N일 ~ N월 N일" 라벨을 만든다', () => {
    expect(formatWeekRangeLabel('2026-09-21')).toBe('2026년 9월 21일 ~ 9월 27일')
  })
})
