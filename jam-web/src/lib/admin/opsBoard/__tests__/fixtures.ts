/** 운영 상황판 시험용 입력 만들기 (티켓 20261026_2023 1회차). */
import type { OpsRoutineStageRecord } from '@/lib/admin/opsInbox/query'
import type { OpsRationaleKind } from '@/lib/admin/opsInbox/constants'
import type { BoardBundleInput, BoardItemInput, BoardRoutineStartInput } from '@/lib/admin/opsBoard/types'

/** 기준 시각: 2026-10-28(수) 12:00 KST. 그 주 월요일은 2026-10-26, ISO 주차 `2026-W44`다. */
export const NOW = new Date('2026-10-28T12:00:00+09:00')

/** 최근 5주 월요일: 이번 주(W44)부터 거꾸로. */
export const WEEK_STARTS = ['2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05', '2026-09-28']

let seq = 0
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}-${seq}`
}

export function makeItem(status: string, overrides: Partial<BoardItemInput> & { rationaleKinds?: OpsRationaleKind[] } = {}): BoardItemInput {
  const { rationaleKinds = [], ...rest } = overrides
  return {
    id: nextId('item'),
    bundleId: 'bundle',
    status,
    kind: 'home_feed_card',
    rationales: rationaleKinds.map((kind) => ({ kind, label: kind, note: null, sourceId: null })),
    ...rest,
  }
}

export function makeBundle(overrides: Partial<BoardBundleInput> & { statuses?: string[] } = {}): BoardBundleInput {
  const { statuses = [], ...rest } = overrides
  const id = rest.id ?? nextId('bundle')
  return {
    id,
    week: '2026-W44',
    isSample: false,
    receivedAt: '2026-10-26T10:00:00+09:00',
    title: null,
    stages: [],
    items: statuses.map((status) => makeItem(status, { bundleId: id })),
    ...rest,
  }
}

export function makeStage(stage: OpsRoutineStageRecord['stage'], overrides: Partial<OpsRoutineStageRecord> = {}): OpsRoutineStageRecord {
  return { agent: '에이전트', stage, startedAt: null, endedAt: null, inCount: null, outCount: null, excludedCount: null, ...overrides }
}

export function makeStart(overrides: Partial<BoardRoutineStartInput> = {}): BoardRoutineStartInput {
  return {
    id: nextId('start'),
    runKey: nextId('run'),
    week: '2026-W44',
    author: '윤진',
    agents: ['윤진'],
    startedAt: '2026-10-28T11:30:00+09:00',
    bundleId: null,
    ...overrides,
  }
}
