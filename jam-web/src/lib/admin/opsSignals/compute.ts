/**
 * 운영 신호 계산 (티켓 20261001_1155, 순수 함수 — DB 접근 없음).
 *
 * `computeOpsSignals`는 조회 함수(`load.ts`)가 읽어 온 재료를 받아 신호 13종을 `catalog`의 순서로 돌려준다. 재료마다 `null`은
 * 「읽지 못함」이다. 읽지 못한 재료에 기대는 신호만 「확인하지 못했어요」(`load_failed`)가 되고 나머지는 계산한다(A11). 신호가 안 뜬
 * 것(`clear`)과 확인하지 못한 것을 섞지 않는다.
 *
 * - 「비어 있는 컨텐츠」는 날짜 구성 검사 외에 「예약됨」·「게재중」 컬렉션 항목이 만든 컬렉션에 아이템 배지가 없으면 한 건을 더한다(검사 날짜와 무관, 티켓 20261004_2242).
 *   그 데이터(`collectionItemCounts`)를 읽지 못했으면(`null`) 이 신호 전체가 「확인하지 못했어요」다.
 * - 시험 묶음(`isSample`)은 기본으로 모든 계산에서 뺀다. `includeSample`을 주면 들어가고 결과에 `isSample` 표식이 붙는다.
 *   루틴 실패는 스위치와 관계없이 시험 묶음을 세지 않는다.
 * - 11종(실행 실패·예약 누락·루틴 실패·형식 오류·비어 있는 컨텐츠·새 컨텐츠가 없는 날·승인 마감 임박·에이전트가 뺀 항목·겹침·
 *   단조로운 흐름·행동 횟수 급증)은 규칙까지 만들었다.
 * - 획득 경로가 막힌 컬렉션은 진행 중인 컬렉션만 센다(티켓 20261008_1301). 얻을 길 계산은 서버 전용 모듈이라 `load.ts`가 하고, 여기에는 막힌 컬렉션 목록만 온다.
 * - 밸런스 경고 1종(티켓 20260930_1459)은 「아직 확인하지 않아요」(`not_built`)의 자리만 둔다. 계산 규칙은 그 티켓이 채운다.
 * - 루틴 실패는 점검 시작 시각(기준값 `routineCheckStartsAt`)이 정해지기 전까지 「아직 확인하지 않아요」(`not_started`)다.
 */
import {
  OPS_SIGNAL_CATALOG,
  sortSignalResults,
  type OpsSignalKey,
  type OpsSignalOutcome,
  type OpsSignalResult,
  type OpsSignalUncheckedReason,
} from '@/lib/admin/opsSignals/catalog'
import { evaluateActionSpike, type ActionCounts } from '@/lib/admin/opsSignals/actionSpike'
import {
  buildDayCompositions,
  isoWeekOfDate,
  signalScanDates,
  type DayComposition,
  type SignalBundleInput,
  type SignalCardInput,
  type SignalMissionInput,
} from '@/lib/admin/opsSignals/composition'
import { evaluateDayRules } from '@/lib/admin/opsSignals/dayRules'
import {
  evaluateApprovalDeadline,
  evaluateBlockedCollections,
  evaluateEmptyCollections,
  evaluateExcludedItems,
  evaluateExecutionFailed,
  evaluateFormatError,
  evaluateMissedSchedule,
  evaluateRoutineFailed,
  type BlockedCollectionInput,
} from '@/lib/admin/opsSignals/statusRules'
import { resolveThresholdValues, type OpsSignalThresholdValues } from '@/lib/admin/opsSignals/thresholds'
import { mondayOfWeek } from '@/lib/admin/cronSchedule'
import { shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'

/** 계산 재료. `null`은 그 재료를 읽지 못했다는 뜻이다. */
export interface ComputeOpsSignalsInput {
  cards: readonly SignalCardInput[] | null
  missions: readonly SignalMissionInput[] | null
  bundles: readonly SignalBundleInput[] | null
  actions: ActionCounts | null
  /**
   * 컬렉션 ID(소문자)별 아이템 배지 수(티켓 20261004_2242). 「비어 있는 컨텐츠」의 「아이템이 없는 컬렉션」 검사가 쓴다.
   * 없으면(넘기지 않음) 그 검사를 하지 않고, `null`이면 읽지 못한 것이라 「비어 있는 컨텐츠」 전체가 「확인하지 못했어요」다.
   */
  collectionItemCounts?: ReadonlyMap<string, number> | null
  /**
   * 얻을 길이 모두 닫힌 아이템이 있는 진행 중 컬렉션(티켓 20261008_1301). 「획득 경로가 막힌 컬렉션」이 쓴다.
   * 없으면(넘기지 않음) 빈 목록으로 계산해 「안 뜸」이고, `null`이면 읽지 못한 것이라 「확인하지 못했어요」다.
   */
  blockedCollections?: readonly BlockedCollectionInput[] | null
}

export interface ComputeOpsSignalsOptions {
  now: Date
  /** 시험 묶음을 포함해서 계산할지. 기본은 `false`다(상위 티켓 Q2). */
  includeSample?: boolean
  /** 기본값 위에 얹을 값. S7에서 바꾼 값(`load.ts`가 `overrides.ts`로 읽어 넘긴다)이나 시험이 기준값을 바꿔 볼 때 쓴다. 없으면 `thresholds.ts`의 값 그대로다. */
  thresholds?: Partial<OpsSignalThresholdValues>
}

export interface OpsSignalsComputation {
  /** 신호 13종. `catalog`의 순서다. */
  signals: OpsSignalOutcome[]
  /** 신호를 검사한 날짜(KST, 오름차순). */
  scanDates: string[]
  /** 날짜별 구성. 검사 날짜와 그 앞 `monotonyWindowDays - 1`일을 담는다(날짜 오름차순). 일정표(②·③)가 쓴다. */
  compositions: DayComposition[]
  includeSample: boolean
}

type Decision = { state: 'raised' | 'clear' | 'unchecked'; reason: OpsSignalUncheckedReason | null; results: OpsSignalResult[] }

function decided(results: OpsSignalResult[]): Decision {
  return { state: results.length > 0 ? 'raised' : 'clear', reason: null, results }
}

function unchecked(reason: OpsSignalUncheckedReason): Decision {
  return { state: 'unchecked', reason, results: [] }
}

/** 다음 주 월요일이 속한 ISO 주(`YYYY-Www`). 묶음의 `week` 칸과 같은 표기다. */
function nextWeekIso(now: Date): string {
  return isoWeekOfDate(shiftDateStr(mondayOfWeek(todayKstDateString(now)), 7))
}

export function computeOpsSignals(input: ComputeOpsSignalsInput, options: ComputeOpsSignalsOptions): OpsSignalsComputation {
  const thresholds = resolveThresholdValues(options.thresholds)
  const includeSample = options.includeSample === true
  const now = options.now

  const bundles = input.bundles === null ? null : input.bundles.filter((bundle) => includeSample || !bundle.isSample)

  // 검사 범위와 날짜별 구성
  const nextWeekArrived = bundles !== null && bundles.some((bundle) => bundle.week === nextWeekIso(now))
  const scanDates = signalScanDates(now, {
    nextWeekArrived,
    nextWeekCheckFromWeekday: thresholds.nextWeekCheckFromWeekday,
  })
  const compositionDates: string[] = []
  const lastScanDate = scanDates[scanDates.length - 1]
  for (let date = shiftDateStr(scanDates[0], -(thresholds.monotonyWindowDays - 1)); date <= lastScanDate; date = shiftDateStr(date, 1)) {
    compositionDates.push(date)
  }
  const compositions = buildDayCompositions(
    { cards: input.cards ?? [], missions: input.missions ?? [], bundles: bundles ?? [] },
    compositionDates
  )

  const decisions = new Map<OpsSignalKey, Decision>()

  // 항목·묶음 상태 신호: 묶음을 읽어야 계산한다.
  if (bundles === null) {
    for (const key of [
      'execution_failed',
      'missed_schedule',
      'routine_failed',
      'format_error',
      'approval_deadline',
      'excluded_items',
    ] as const) {
      decisions.set(key, unchecked('load_failed'))
    }
  } else {
    const ctx = { now, bundles, thresholds }
    decisions.set('execution_failed', decided(sortSignalResults(evaluateExecutionFailed(ctx))))
    decisions.set('missed_schedule', decided(sortSignalResults(evaluateMissedSchedule(ctx))))
    const routine = evaluateRoutineFailed(ctx)
    decisions.set('routine_failed', routine === null ? unchecked('not_started') : decided(routine))
    decisions.set('format_error', decided(evaluateFormatError(ctx)))
    decisions.set('approval_deadline', decided(sortSignalResults(evaluateApprovalDeadline(ctx))))
    decisions.set('excluded_items', decided(evaluateExcludedItems(ctx)))
  }

  // 날짜 구성 신호: 카드와 묶음을 모두 읽어야 계산한다.
  if (input.cards === null || bundles === null) {
    for (const key of ['empty_content', 'no_new_content', 'overlap', 'monotony'] as const) {
      decisions.set(key, unchecked('load_failed'))
    }
  } else {
    const dayResults = evaluateDayRules({ compositions, scanDates, thresholds })
    // 「비어 있는 컨텐츠」는 날짜 구성 검사에 「아이템이 없는 컬렉션」 검사를 더한다. 컬렉션 쪽 데이터를 읽지 못했으면 이 신호 전체를 확인하지 못한 것으로 둔다.
    if (input.collectionItemCounts === null) {
      decisions.set('empty_content', unchecked('load_failed'))
    } else {
      const emptyCollections =
        input.collectionItemCounts === undefined ? [] : evaluateEmptyCollections(bundles, input.collectionItemCounts)
      decisions.set('empty_content', decided(sortSignalResults([...dayResults.empty_content, ...emptyCollections])))
    }
    decisions.set('no_new_content', decided(dayResults.no_new_content))
    decisions.set('overlap', decided(dayResults.overlap))
    decisions.set('monotony', decided(dayResults.monotony))
  }

  // 행동 횟수 급증: 행동 건수를 읽어야 계산한다.
  decisions.set(
    'action_spike',
    input.actions === null ? unchecked('load_failed') : decided(evaluateActionSpike(input.actions, thresholds))
  )

  // 획득 경로가 막힌 컬렉션: 얻을 길 계산 결과를 읽어야 계산한다.
  decisions.set(
    'blocked_collection',
    input.blockedCollections === null
      ? unchecked('load_failed')
      : decided(evaluateBlockedCollections(input.blockedCollections ?? []))
  )

  // 계산 규칙을 아직 만들지 않은 1종(자리만 둔다)
  decisions.set('balance_warning', unchecked('not_built'))

  const signals = OPS_SIGNAL_CATALOG.map((definition): OpsSignalOutcome => {
    const decision = decisions.get(definition.key) as Decision
    return {
      key: definition.key,
      name: definition.name,
      level: definition.level,
      state: decision.state,
      uncheckedReason: decision.reason,
      results: decision.results,
    }
  })

  return { signals, scanDates, compositions, includeSample }
}
