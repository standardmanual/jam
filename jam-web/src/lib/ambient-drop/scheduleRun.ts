/**
 * 앰비언트 드랍 날짜 예약 실행기 (티켓 20261001_2051)
 *
 * - `runAmbientDropSpec`: 예약 내용 하나를 지금 놓는다. 행 없이도 돈다 — 새 폼의 「지금」 1회 배포(티켓
 *   20261001_2053)가 행 없이 부른다. `ambient_drop_config`는 **읽기만** 한다(등급 분포·지점당 한도).
 * - `runDueAmbientDropSchedules`: 매시 cron이 부른다. 놓친 예약을 표시하고, 도래한 예약을 한 건씩 선점해
 *   실행하고, 결과를 예약 행에 남긴다. 예약 하나가 실패해도 다음 예약과 매일 배포를 막지 않는다. 재시도하지 않는다.
 *
 * 실행 때 대상을 다시 판정한다(fail-closed) — 등록 뒤에 컬렉션이 내려가거나 아이템이 지워졌으면 그 대상은 놓지
 * 않고 사유를 결과에 남긴다. 결과는 `engine_decision_log`(`ambient_batch_result`, `trigger: 'scheduled'`)에도 남는다.
 *
 * 로직 문서: docs/service/badge-engine/BADGE_ENGINE_UNIFIED.md §3.12 「날짜 예약 배포」
 */
import { createServiceClient } from '@/lib/supabase/server'
import { getAmbientDropConfig } from './config'
import { logAmbientBatchResult, type AmbientDropSkipReason } from './index'
import { placeAmbientDrops, type SpawnedAmbientDrop } from './placement'
import { pickRandom, randomRarityDistribution, type RarityDistribution } from './rarity'
import { planScheduleDrops } from './schedulePlan'
import {
  claimDueAmbientDropSchedules,
  finishAmbientDropSchedule,
  markMissedAmbientDropSchedules,
} from './scheduleStore'
import { specFromRow, type AmbientDropScheduleSpec } from './scheduleSpec'
import { loadScheduleTargets, type ScheduleTargets } from './scheduleTargets'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 매시 cron 한 번에 예약을 처리하는 시간 예산(ms). Vercel 함수 제한(`maxDuration` 60초)보다 짧게 잡는다 — 임시값 */
export const AMBIENT_SCHEDULE_RUN_BUDGET_MS = 40_000

export interface AmbientSpecRunOptions {
  /** 이번 실행의 기준 시각 — 대상 판정(노출 중·유효기간)의 「지금」이다 */
  ranAt: Date
  trigger: 'scheduled' | 'manual'
  scheduleId?: string
}

export interface AmbientSpecRunOutcome {
  /** 하나라도 놓았으면 done, 놓을 대상이 없으면 skipped, 전부 실패했거나 조회가 실패했으면 failed */
  status: 'done' | 'skipped' | 'failed'
  reason?: AmbientDropSkipReason
  error?: string
  /** 놓으려고 한 드랍 수(지점 직접은 지점 수 × 지점당 개수, 종류+개수는 총 개수) */
  requested: number
  spawned: number
  failedCount: number
  /** 지점 직접 모드에서 이미 활성 시스템 드랍이 있는데 겹쳐 놓은 지점 수 */
  overlappedPoiCount: number
  eligiblePoiCount: number
  spawnedDrops: SpawnedAmbientDrop[]
  excluded: ScheduleTargets['excluded']
  effectiveCategorySlug: string | null
  effectiveCollectionIds: string[]
}

/** 예약 행의 `result` 칸에 남기는 요약 */
export type ScheduleResultSummary = {
  requested: number
  spawned: number
  failed: number
  reason: string | null
  error: string | null
  overlappedPoiCount: number
  excluded: ScheduleTargets['excluded']
  dropIds: string[]
}

export interface DueScheduleSummary {
  due: number
  done: number
  skipped: number
  failed: number
  missed: number
}

function requestedCount(spec: AmbientDropScheduleSpec): number {
  return spec.poiMode === 'list' ? spec.poiIds.length * spec.perPoiCount : spec.totalCount
}

const NO_EXCLUDED: ScheduleTargets['excluded'] = { pois: [], badges: [], collections: [] }

export function summarizeSpecRun(outcome: AmbientSpecRunOutcome): ScheduleResultSummary {
  return {
    requested: outcome.requested,
    spawned: outcome.spawned,
    failed: outcome.failedCount,
    reason: outcome.reason ?? null,
    error: outcome.error ?? null,
    overlappedPoiCount: outcome.overlappedPoiCount,
    excluded: outcome.excluded,
    dropIds: outcome.spawnedDrops.map((d) => d.id),
  }
}

/**
 * 예약 내용 하나를 `ranAt` 기준으로 놓는다.
 * 대상 읽기 → (필요할 때만) 설정 읽기 → 배치 계획 → 놓기 → 결과 로그. 이 함수는 설정을 쓰지 않는다.
 * 대상 조회가 실패하면 던지지 않고 `failed`로 돌려준다(놓지 않는다).
 */
export async function runAmbientDropSpec(
  supabase: ServiceClient,
  spec: AmbientDropScheduleSpec,
  opts: AmbientSpecRunOptions
): Promise<AmbientSpecRunOutcome> {
  const ranAtIso = opts.ranAt.toISOString()
  const requested = requestedCount(spec)
  const effectiveCategorySlug = spec.poiMode === 'category' ? spec.poiCategory : null

  const finish = async (
    outcome: Omit<AmbientSpecRunOutcome, 'requested' | 'effectiveCategorySlug'>
  ): Promise<AmbientSpecRunOutcome> => {
    const full: AmbientSpecRunOutcome = { requested, effectiveCategorySlug, ...outcome }
    await logAmbientBatchResult(
      {
        trigger: opts.trigger,
        ...(opts.scheduleId ? { scheduleId: opts.scheduleId } : {}),
        ranAt: ranAtIso,
        effectiveCategorySlug,
        effectiveCollectionIds: full.effectiveCollectionIds,
        ...(full.excluded.collections.length > 0 ? { excludedCollectionIds: full.excluded.collections.map((c) => c.id) } : {}),
        ...(full.excluded.pois.length > 0 ? { excludedPois: full.excluded.pois } : {}),
        ...(full.excluded.badges.length > 0 ? { excludedBadges: full.excluded.badges } : {}),
        requested,
        eligiblePoiCount: full.eligiblePoiCount,
        overlappedPoiCount: full.overlappedPoiCount,
        spawned: full.spawned,
        failedCount: full.failedCount,
        ...(full.reason ? { reason: full.reason } : {}),
      },
      full.error
    )
    return full
  }

  let targets: ScheduleTargets
  try {
    targets = await loadScheduleTargets(supabase, spec, ranAtIso)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[ambient-drop-schedule] 대상 조회 실패 — 놓지 않아요:', message)
    return finish({
      status: 'failed',
      error: `대상 조회 실패: ${message}`,
      spawned: 0,
      failedCount: 0,
      overlappedPoiCount: 0,
      eligiblePoiCount: 0,
      spawnedDrops: [],
      excluded: NO_EXCLUDED,
      effectiveCollectionIds: [],
    })
  }

  const skipped = (reason: AmbientDropSkipReason, eligiblePoiCount: number): Promise<AmbientSpecRunOutcome> =>
    finish({
      status: 'skipped',
      reason,
      spawned: 0,
      failedCount: 0,
      overlappedPoiCount: 0,
      eligiblePoiCount,
      spawnedDrops: [],
      excluded: targets.excluded,
      effectiveCollectionIds: targets.effectiveCollectionIds,
    })

  if (targets.reason) return skipped(targets.reason, targets.pois.length)

  // 설정은 읽기만 한다 — 컬렉션 모드의 등급 분포, 종류+개수 모드의 지점당 한도
  const needsConfig = spec.itemMode === 'collections' || spec.poiMode === 'category'
  const config = needsConfig ? await getAmbientDropConfig() : null
  let distribution: RarityDistribution | undefined
  if (config && spec.itemMode === 'collections') {
    distribution =
      config.all_random || config.rarity_mode === 'random'
        ? randomRarityDistribution()
        : {
            common: config.rarity_common,
            rare: config.rarity_rare,
            epic: config.rarity_epic,
            mystic: config.rarity_mystic,
          }
  }

  const plan = planScheduleDrops({
    spec,
    targets,
    rarity: distribution ? { distribution } : undefined,
    maxActivePerPoi: config?.max_active_per_poi,
    pick: pickRandom,
  })
  if (plan.rows.length === 0) return skipped(plan.reason ?? 'no_candidate_badges', plan.eligiblePoiCount)

  const { spawned, failedCount } = await placeAmbientDrops(supabase, plan.rows)
  const common = {
    failedCount,
    overlappedPoiCount: plan.overlappedPoiCount,
    eligiblePoiCount: plan.eligiblePoiCount,
    spawnedDrops: spawned,
    excluded: targets.excluded,
    effectiveCollectionIds: targets.effectiveCollectionIds,
  }
  if (spawned.length === 0) {
    return finish({
      status: 'failed',
      reason: 'insert_failed',
      error: '개체 선발급+배치 전부 실패',
      spawned: 0,
      ...common,
    })
  }
  return finish({ status: 'done', spawned: spawned.length, ...common })
}

/**
 * 매시 cron이 부른다. 놓친 예약 표시 → 도래한 예약을 한 건씩 선점 → 실행 → 결과 기록.
 *
 * - 건마다 try/catch로 격리한다. 던지면 그 예약만 `failed`+오류 메시지다
 * - 새 예약을 선점하기 전에 경과 시간이 `budgetMs`를 넘으면 멈춘다. 남은 예약은 `scheduled`로 남아 다음 정시에
 *   처리되고, 3시간을 넘기면 `missed`가 된다
 * - 재시도하지 않는다 — `failed`는 운영자가 확인하고 새로 등록한다
 */
export async function runDueAmbientDropSchedules(
  now: Date = new Date(),
  budgetMs: number = AMBIENT_SCHEDULE_RUN_BUDGET_MS
): Promise<DueScheduleSummary> {
  const supabase = createServiceClient()
  const startedAt = Date.now()
  const summary: DueScheduleSummary = { due: 0, done: 0, skipped: 0, failed: 0, missed: 0 }

  try {
    summary.missed = await markMissedAmbientDropSchedules(supabase, now)
  } catch (err) {
    // 놓친 표시가 실패해도 도래한 예약 처리는 계속한다
    console.error('[ambient-drop-schedule] 놓친 예약 표시 실패:', err)
  }

  for (;;) {
    if (Date.now() - startedAt >= budgetMs) {
      console.warn('[ambient-drop-schedule] 시간 예산을 넘어 남은 예약은 다음 정시로 넘겨요')
      break
    }

    const [claimed] = await claimDueAmbientDropSchedules(supabase, now, 1)
    if (!claimed) break
    summary.due += 1

    let status: AmbientSpecRunOutcome['status']
    let result: ScheduleResultSummary
    try {
      const outcome = await runAmbientDropSpec(supabase, specFromRow(claimed), {
        ranAt: now,
        trigger: 'scheduled',
        scheduleId: claimed.id,
      })
      status = outcome.status
      result = summarizeSpecRun(outcome)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[ambient-drop-schedule] 예약 실행 중 오류:', claimed.id, message)
      status = 'failed'
      result = {
        requested: 0,
        spawned: 0,
        failed: 0,
        reason: null,
        error: message,
        overlappedPoiCount: 0,
        excluded: NO_EXCLUDED,
        dropIds: [],
      }
    }
    summary[status] += 1

    // 결과 기록이 실패해도 다음 예약으로 넘어간다 — 이 예약은 running으로 남아 30분 뒤 stalled로 읽힌다
    try {
      await finishAmbientDropSchedule(supabase, claimed.id, status, result, now)
    } catch (err) {
      console.error('[ambient-drop-schedule] 예약 결과 기록 중 오류:', claimed.id, err)
    }
  }

  return summary
}
