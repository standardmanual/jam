/**
 * 앰비언트 드랍 날짜 예약 — 화면용 순수 규칙 (티켓 20261001_2052)
 *
 * 상태 라벨 8개, 취소·시각 수정 버튼 열림 행렬(취소는 DB 상태, 시각 수정은 파생 상태), 결과 사유 문장,
 * 요청 수, 한국 시각 표기를 검증한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/schedule-view.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { AmbientDropScheduleStatus } from '@/types/database'
import type { AmbientDropScheduleState } from '../scheduleSpec'
import {
  SCHEDULE_STATE_LABEL,
  describeScheduleOutcome,
  formatScheduleAt,
  scheduleActions,
  scheduleRequestedCount,
  scheduleStateBadgeClass,
  type ScheduleOutcomeView,
} from '../scheduleView'

const STATES: AmbientDropScheduleState[] = ['scheduled', 'running', 'stalled', 'done', 'skipped', 'failed', 'canceled', 'missed']

function outcome(overrides: Partial<ScheduleOutcomeView> = {}): ScheduleOutcomeView {
  return {
    requested: 4,
    spawned: 4,
    failed: 0,
    reason: null,
    failureKind: null,
    overlappedPoiCount: 0,
    excludedSummary: null,
    ...overrides,
  }
}

describe('상태 라벨·배지 색', () => {
  it('8개 상태 라벨이 정해진 말이다', () => {
    expect(SCHEDULE_STATE_LABEL).toEqual({
      scheduled: '예약됨',
      running: '실행 중',
      stalled: '멈춤',
      done: '완료',
      skipped: '건너뜀',
      failed: '실패',
      canceled: '취소',
      missed: '놓침',
    })
  })

  it('모든 상태에 배경·글자 색 클래스가 있다', () => {
    for (const state of STATES) expect(scheduleStateBadgeClass(state)).toMatch(/^bg-\S+ text-\S+$/)
  })
})

describe('scheduleActions — 버튼 규칙', () => {
  const RUNNING = '드랍하는 중인 예약이라 바꿀 수 없어요.'
  const EXECUTED = '이미 실행된 예약이에요. 다시 드랍하려면 새 예약을 등록해 주세요.'
  const MISSED = '드랍 시각에서 3시간이 지나 놓친 예약이에요. 다시 드랍하려면 새 예약을 등록해 주세요.'

  it.each<[string, AmbientDropScheduleStatus, AmbientDropScheduleState, boolean, boolean, string | null]>([
    ['예약됨', 'scheduled', 'scheduled', true, true, null],
    ['실행 중', 'running', 'running', false, false, RUNNING],
    ['멈춤', 'running', 'stalled', false, false, RUNNING],
    ['완료', 'done', 'done', false, false, EXECUTED],
    ['건너뜀', 'skipped', 'skipped', false, false, EXECUTED],
    ['실패', 'failed', 'failed', false, false, EXECUTED],
    ['취소', 'canceled', 'canceled', false, false, '취소한 예약이에요.'],
    // DB는 아직 scheduled인데 예정 시각 + 3시간이 지나 놓침으로 읽히는 예약 — 취소는 열리고 시각 수정은 막힌다
    ['놓침(DB scheduled)', 'scheduled', 'missed', true, false, MISSED],
    ['놓침(DB missed)', 'missed', 'missed', false, false, MISSED],
  ])('%s', (_name, status, state, canCancel, canReschedule, blockedReason) => {
    expect(scheduleActions({ status, state })).toEqual({ canCancel, canReschedule, blockedReason })
  })

  it('막힌 이유는 모두 해요체 문장이다', () => {
    for (const state of STATES) {
      const { blockedReason } = scheduleActions({ status: state === 'stalled' ? 'running' : (state as AmbientDropScheduleStatus), state })
      if (blockedReason) expect(blockedReason).toMatch(/요\.$/)
    }
  })
})

describe('describeScheduleOutcome — 결과 문장', () => {
  it('아직 실행 전이면 null이다', () => {
    expect(describeScheduleOutcome({ state: 'scheduled', outcome: null })).toBeNull()
  })

  it('done: 놓은 수와 요청 수', () => {
    expect(describeScheduleOutcome({ state: 'done', outcome: outcome() })).toBe('4개를 드랍했어요(요청 4개).')
  })

  it('done: 실패·겹침·빠진 대상을 차례로 덧붙인다', () => {
    const text = describeScheduleOutcome({
      state: 'done',
      outcome: outcome({
        requested: 6,
        spawned: 4,
        failed: 2,
        overlappedPoiCount: 1,
        excludedSummary: '운영이 끝난 지점 1건, 노출 중이 아닌 컬렉션 2건',
      }),
    })
    expect(text).toBe(
      '4개를 드랍했어요(요청 6개). 2개는 만들지 못했어요. 이미 드랍이 있던 지점 1곳에 겹쳐 드랍했어요. 실행 때 빠진 대상: 운영이 끝난 지점 1건, 노출 중이 아닌 컬렉션 2건.'
    )
  })

  it('done: 결과 요약이 없으면 그 사실만 알린다', () => {
    expect(describeScheduleOutcome({ state: 'done', outcome: null })).toBe('드랍을 마쳤어요. 결과 요약이 남아 있지 않아요.')
  })

  it.each([
    ['no_eligible_poi', '드랍하지 않았어요. 실행 시각에 드랍할 수 있는 지점이 없었어요. 지점을 바꿔 새 예약을 등록해 주세요.'],
    ['no_candidate_badges', '드랍하지 않았어요. 실행 시각에 유효한 아이템이 없었어요. 아이템을 바꿔 새 예약을 등록해 주세요.'],
    ['no_eligible_collection', '드랍하지 않았어요. 실행 시각에 노출 중인 컬렉션이 없었어요. 컬렉션을 바꿔 새 예약을 등록해 주세요.'],
  ])('skipped · %s', (reason, sentence) => {
    expect(describeScheduleOutcome({ state: 'skipped', outcome: outcome({ spawned: 0, reason }) })).toBe(sentence)
  })

  it('skipped: 모르는 사유도 같은 해요체 문장으로 받는다', () => {
    const text = describeScheduleOutcome({ state: 'skipped', outcome: outcome({ spawned: 0, reason: 'something_new' }) })
    expect(text).toMatch(/^드랍하지 않았어요\./)
    expect(text).toMatch(/요\.$/)
  })

  it.each([
    ['target_lookup', '드랍하지 못했어요. 실행 때 지점·아이템 정보를 읽지 못했어요. 잠시 뒤 같은 내용으로 새 예약을 등록해 주세요.'],
    ['insert', '드랍하지 못했어요. 지점에 드랍을 만드는 중 오류가 났어요. 같은 일이 반복되면 개발팀에 알려 주세요.'],
    ['unexpected', '드랍하지 못했어요. 실행 중 예기치 못한 오류가 났어요. 개발팀에 알리고 새 예약을 등록해 주세요.'],
  ] as const)('failed · %s', (failureKind, sentence) => {
    expect(describeScheduleOutcome({ state: 'failed', outcome: outcome({ spawned: 0, failureKind }) })).toBe(sentence)
  })

  it('failed: 분류를 모르거나 결과가 없으면 예기치 못한 오류 문장이다', () => {
    const unexpected = '드랍하지 못했어요. 실행 중 예기치 못한 오류가 났어요. 개발팀에 알리고 새 예약을 등록해 주세요.'
    expect(describeScheduleOutcome({ state: 'failed', outcome: outcome({ failureKind: null }) })).toBe(unexpected)
    expect(describeScheduleOutcome({ state: 'failed', outcome: null })).toBe(unexpected)
  })

  it.each([
    ['missed', '드랍하지 않았어요. 드랍 시각에서 3시간이 지나도록 실행되지 않았어요. 다시 드랍하려면 새 예약을 등록해 주세요.'],
    ['stalled', '실행이 30분 넘게 끝나지 않았어요. 실행 도중 멈췄을 수 있어요. 개발팀에 확인을 요청해 주세요.'],
    ['running', '드랍하는 중이에요. 끝나면 결과가 여기에 보여요.'],
    ['canceled', '취소한 예약이에요. 드랍하지 않았어요.'],
  ] as const)('%s', (state, sentence) => {
    expect(describeScheduleOutcome({ state, outcome: null })).toBe(sentence)
  })

  it('완료 문장을 뺀 모든 문장은 「요.」로 끝난다', () => {
    // 완료 문장은 「(요청 N개).」로 끝나고, 빠진 대상 요약이 붙으면 「N건.」으로 끝난다(표에 적힌 그대로)
    for (const state of STATES.filter((s) => s !== 'done')) {
      for (const view of [null, outcome({ failureKind: 'insert' }), outcome({ reason: 'no_eligible_poi' })]) {
        const text = describeScheduleOutcome({ state, outcome: view })
        if (text) expect(text).toMatch(/요\.$/)
      }
    }
  })
})

describe('scheduleRequestedCount·formatScheduleAt', () => {
  it('지점 직접은 지점 수 × 지점당 개수, 종류+개수는 총 개수다', () => {
    expect(scheduleRequestedCount({ poiMode: 'list', poiIds: ['a', 'b', 'c'], perPoiCount: 2 })).toBe(6)
    expect(scheduleRequestedCount({ poiMode: 'category', totalCount: 5 })).toBe(5)
  })

  it('칸이 비어 있으면 0이다', () => {
    expect(scheduleRequestedCount({ poiMode: 'list', poiIds: ['a'], perPoiCount: null })).toBe(0)
    expect(scheduleRequestedCount({ poiMode: 'category', totalCount: null })).toBe(0)
  })

  it('시각은 한국 시각으로 쓴다', () => {
    expect(formatScheduleAt('2026-10-05T00:00:00.000Z')).toBe('2026.10.05 09:00')
    expect(formatScheduleAt('2026-10-05T15:00:00.000Z')).toBe('2026.10.06 00:00')
  })
})
