/**
 * T2 배치 오케스트레이션 — 소식 11종 (티켓 20260825_002)
 * 스펙: PRD §4 T2 표 / §4-1 KST 18:00 하루 1회
 *
 * | 소식 | 단계 |
 * |---|---|
 * | 9·10   | collections |
 * | 18     | drop-spot |
 * | 21·24  | missions |
 * | 23     | mission-rank |
 * | 29·30·31 | following (하루 상한 2건) |
 * | 41     | sync-stalled |
 * | 42     | inventory-full |
 *
 * ## 설계 원칙
 *
 * - **시각은 한 번만 캡처한다.** `createBatchContext()`가 만든 `startedAt`을 모든 단계가
 *   공유한다. 단계마다 `new Date()`를 부르면 KST 자정을 걸치는 순간 group_key가 갈린다.
 * - **단계는 서로를 죽이지 않는다.** 한 단계가 던져도 `runStep`이 잡아 `console.error`로
 *   남기고 나머지 단계는 그대로 실행된다(§3-8).
 * - **재실행해도 중복이 생기지 않는다.** 11종 전부 `group_key`를 갖고 `merge`가 아니라
 *   `once`로 만든다 — DB의 `notifications_group_uniq`가 막으므로 배치가 SELECT로 존재를
 *   확인할 필요가 없다(§3-7).
 */
import { buildCollectionDrafts } from './collections'
import { buildDropSpotDrafts } from './dropSpot'
import { buildMissionDrafts, buildMissionRankDrafts } from './missions'
import { buildFollowingDrafts } from './following'
import { buildInventoryFullDrafts, buildSyncStalledDrafts } from './account'
import { createBatchContext, runStep, type BatchContext, type BatchStepResult } from './shared'

export * from './shared'

export interface NotificationBatchResult {
  startedAt: string
  durationMs: number
  created: number
  failed: number
  steps: BatchStepResult[]
}

const STEPS: { name: string; run: (ctx: BatchContext) => Promise<import('./shared').NotificationDraft[]> }[] = [
  { name: 'collections', run: buildCollectionDrafts },
  { name: 'drop-spot', run: buildDropSpotDrafts },
  { name: 'missions', run: buildMissionDrafts },
  { name: 'mission-rank', run: buildMissionRankDrafts },
  { name: 'following', run: buildFollowingDrafts },
  { name: 'sync-stalled', run: buildSyncStalledDrafts },
  { name: 'inventory-full', run: buildInventoryFullDrafts },
]

export async function runNotificationBatch(startedAt: Date = new Date()): Promise<NotificationBatchResult> {
  const ctx = createBatchContext(startedAt)
  const steps: BatchStepResult[] = []

  // 단계는 순차 실행한다 — 동시에 돌리면 service_role 커넥션과 RPC 왕복이 한꺼번에 몰린다.
  for (const step of STEPS) {
    steps.push(await runStep(step.name, () => step.run(ctx), ctx))
  }

  const created = steps.reduce((sum, s) => sum + s.created, 0)
  const failed = steps.reduce((sum, s) => sum + s.failed, 0)

  return {
    startedAt: ctx.startedAt.toISOString(),
    durationMs: Date.now() - ctx.startedAt.getTime(),
    created,
    failed,
    steps,
  }
}
