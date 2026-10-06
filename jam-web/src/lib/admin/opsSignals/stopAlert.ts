/**
 * 중단 신호 매시 점검 (티켓 20261001_1154) — 서버 전용(`loadOpsSignals`가 서비스 클라이언트를 쓴다).
 *
 * 매시 도는 크론(`/api/cron/ops-stop-signals`)이 신호를 계산해 「중단」 가운데 예약 누락·루틴 실패가 **직전 한 시간 창에 새로 걸린 것만** `#jam-alert`에 한 번 알린다.
 * 이 점검은 DB를 쓰지 않는다(신호 계산은 읽기만 한다). 상태 맞추기(DB를 쓴다)는 크론 라우트가 이 함수보다 먼저 부른다.
 *
 * - **한 시간 창.** 끝 = 예약 슬롯 시각(정시 + `STOP_CHECK_SLOT_MINUTE`분, 지금이 그보다 이르면 한 시간 앞 슬롯), 창 = (끝 − 60분, 끝]. 호출이 몇 분 늦어도 이웃한 창이 겹치지도 비지도 않는다.
 * - **새로 걸린 것.** 수준 「중단」 신호 가운데 실행 실패를 뺀 결과 중 `onsetAt`(걸리기 시작한 시각)이 창 안이다. 이미 지난 창에서 걸린 것은 그때 알렸으니 다시 알리지 않는다.
 *   S7에서 기준값을 바꾼 직후에는 한 회차 겹치거나 놓칠 수 있다(운영툴 PRD §11.9).
 * - **실행 실패는 알리지 않는다.** 실행 실패·멈춘 준비중·밖에서 지워짐은 상태 맞추기(`notifyReconcile`)와 예약 등록이 이미 `#jam-alert`로 알린다.
 * - **시험 묶음은 어떤 경우에도 알리지 않는다.** 계산에서 빼고(`includeSample: false`), 결과의 시험 표식도 한 번 더 거른다.
 * - **묶음을 읽지 못하면 알리지 않는다.** 읽지 못한 것(`load_failed`)을 「새로 걸린 것이 없음」으로 보내거나 틀린 글을 올리지 않고 로그만 남기고 실패로 돌려준다.
 * - 한 회차에 글은 한 건이다. 슬랙 값이 없으면(`not_configured`) 오류 없이 건너뛰고 로그를 남긴다. 이 파일은 던지지 않는다.
 */
import type { OpsSignalKey, OpsSignalOutcome, OpsSignalResult } from '@/lib/admin/opsSignals/catalog'
import { loadOpsSignals } from '@/lib/admin/opsSignals/load'
import { formatStopSignalAlertMessage, postOpsSlack } from '@/lib/admin/opsInbox/slack'

const LOG = '[ops-stop-signals]'
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** 크론 일정(`jam-web/vercel.json`의 `5 * * * *`)의 분. 창의 끝이 이 슬롯 시각이라 일정을 바꾸면 이 값도 같이 바꾼다(`__tests__/stopAlert.test.ts`가 둘이 같은지 본다). */
export const STOP_CHECK_SLOT_MINUTE = 5

/** 알림에서 뺀 「중단」 신호: 상태 맞추기·예약 등록이 따로 알린다. */
const NOT_ALERTED_KEYS: ReadonlySet<OpsSignalKey> = new Set(['execution_failed'])

export interface HourlyWindow {
  /** 창의 시작(제외). */
  startMs: number
  /** 창의 끝(포함) = 이 회차의 예약 슬롯 시각. */
  endMs: number
}

/** 이 시각에 도는 점검이 보는 한 시간 창 (끝 − 60분, 끝]. 지금이 이번 정시의 슬롯보다 이르면 한 시간 앞 슬롯을 끝으로 삼는다. */
export function hourlyWindow(now: Date): HourlyWindow {
  const nowMs = now.getTime()
  let endMs = Math.floor(nowMs / HOUR_MS) * HOUR_MS + STOP_CHECK_SLOT_MINUTE * MINUTE_MS
  if (endMs > nowMs) endMs -= HOUR_MS
  return { startMs: endMs - HOUR_MS, endMs }
}

/** 신호 하나에서 창 안에 새로 걸린 결과들. */
export interface NewStopResults {
  key: OpsSignalKey
  name: string
  results: OpsSignalResult[]
}

function isInWindow(result: OpsSignalResult, window: HourlyWindow): boolean {
  if (result.isSample || result.onsetAt === null) return false
  const onsetMs = Date.parse(result.onsetAt)
  return !Number.isNaN(onsetMs) && onsetMs > window.startMs && onsetMs <= window.endMs
}

/**
 * 알릴 결과를 고른다. 수준 「중단」 신호 가운데 실행 실패를 뺀 것, 상태가 「뜸」, 시작 시각이 창 안, 시험 묶음이 아님. 걸린 것이 없는 신호는 돌려주지 않는다.
 * `skipKeys`에 든 신호는 건너뛴다(상태 맞추기가 실패한 회차의 예약 누락).
 */
export function pickNewStopResults(
  signals: readonly OpsSignalOutcome[],
  window: HourlyWindow,
  skipKeys: ReadonlySet<OpsSignalKey> = new Set()
): NewStopResults[] {
  const picked: NewStopResults[] = []
  for (const signal of signals) {
    if (signal.level !== 'stop' || NOT_ALERTED_KEYS.has(signal.key) || skipKeys.has(signal.key)) continue
    if (signal.state !== 'raised') continue
    const results = signal.results.filter((result) => isInWindow(result, window))
    if (results.length > 0) picked.push({ key: signal.key, name: signal.name, results })
  }
  return picked
}

/** 알림 대상 신호 가운데 데이터를 읽지 못한(`load_failed`) 것이 있는가. 점검 시작 전(`not_started`)은 읽지 못한 것이 아니다. */
function hasLoadFailure(signals: readonly OpsSignalOutcome[]): boolean {
  return signals.some(
    (signal) =>
      signal.level === 'stop' && !NOT_ALERTED_KEYS.has(signal.key) && signal.state === 'unchecked' && signal.uncheckedReason === 'load_failed'
  )
}

export interface StopSignalCheckOptions {
  /** 계산 기준 시각. 기본은 지금이다. */
  now?: Date
  /** 예약 누락 알림을 건너뛴다. 상태 맞추기가 실패해 정상 공개된 항목이 「예약됨」에 남았을 수 있을 때 쓴다(루틴 실패는 상태 맞추기와 관계없다). */
  skipMissedSchedule?: boolean
}

/** 글을 올린 결과. `none`은 새로 걸린 것이 없어 올리지 않았다는 뜻이고, `not_configured`는 슬랙 값이 없어 건너뛰었다는 뜻이다. */
export type StopSignalPostState = 'sent' | 'none' | 'not_configured' | 'failed'

export interface StopSignalCounts {
  missedSchedule: number
  routineFailed: number
}

export type StopSignalCheckResult =
  | { ok: true; counts: StopSignalCounts; post: StopSignalPostState }
  /** `load_failed`: 묶음을 읽지 못했다(글을 올리지 않았다). `slack_failed`: 글을 올리지 못했다(슬랙 값은 있었다). */
  | { ok: false; error: 'load_failed' | 'slack_failed'; counts: StopSignalCounts }

const EMPTY_COUNTS: StopSignalCounts = { missedSchedule: 0, routineFailed: 0 }

function countsOf(picked: readonly NewStopResults[]): StopSignalCounts {
  const countOf = (key: OpsSignalKey) => picked.find((entry) => entry.key === key)?.results.length ?? 0
  return { missedSchedule: countOf('missed_schedule'), routineFailed: countOf('routine_failed') }
}

/**
 * 점검 한 회차. 신호를 계산해(시험 묶음 제외) 직전 한 시간 창에 새로 걸린 예약 누락·루틴 실패를 한 건으로 `#jam-alert`에 올린다.
 * 던지지 않는다 — 읽지 못하면 `load_failed`, 글을 올리지 못하면 `slack_failed`로 돌려주고 사유는 로그에 남긴다.
 */
export async function runStopSignalCheck(options: StopSignalCheckOptions = {}): Promise<StopSignalCheckResult> {
  const now = options.now ?? new Date()

  let signals: OpsSignalOutcome[]
  try {
    signals = (await loadOpsSignals({ now, includeSample: false })).signals
  } catch (error) {
    console.error(`${LOG} 신호를 계산하지 못했어요:`, error instanceof Error ? error.message : String(error))
    return { ok: false, error: 'load_failed', counts: EMPTY_COUNTS }
  }

  if (hasLoadFailure(signals)) {
    console.error(`${LOG} 묶음을 읽지 못해 이번 회차는 알리지 않았어요`)
    return { ok: false, error: 'load_failed', counts: EMPTY_COUNTS }
  }

  const picked = pickNewStopResults(signals, hourlyWindow(now), new Set<OpsSignalKey>(options.skipMissedSchedule ? ['missed_schedule'] : []))
  const counts = countsOf(picked)
  if (picked.length === 0) return { ok: true, counts, post: 'none' }

  const text = formatStopSignalAlertMessage({
    groups: picked.map((entry) => ({ label: entry.name, messages: entry.results.map((result) => result.message) })),
  })
  const posted = await postOpsSlack('alert', text)
  if (posted.ok) return { ok: true, counts, post: 'sent' }

  if (posted.error === 'not_configured') {
    console.warn(`${LOG} 슬랙 값이 없어 알림을 건너뛰었어요(예약 누락 ${counts.missedSchedule}건, 루틴 실패 ${counts.routineFailed}건)`)
    return { ok: true, counts, post: 'not_configured' }
  }
  console.error(`${LOG} 슬랙에 올리지 못했어요(${posted.error ?? 'unknown'}). 예약 누락 ${counts.missedSchedule}건, 루틴 실패 ${counts.routineFailed}건`)
  return { ok: false, error: 'slack_failed', counts }
}
