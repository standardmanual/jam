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
 * - **"조용한 0건"을 구분할 수 있게 남긴다.** 단계마다 `scanned`(훑은 행 수)·
 *   `drafts`(생성 시도 수)·`durationMs`를 요약 로그에 싣는다. 생성 수만 보면
 *   "정상 0건"(#24는 최근 종료 미션이 없으면 0이 맞다)과 "판정이 깨져서 0건"이 똑같아 보인다.
 *
 * ### 단계별 `scanned`의 의미
 *
 * | 단계 | scanned |
 * |---|---|
 * | collections | 보유 현황이 잡힌 유저 수 |
 * | drop-spot | 활성 드랍 수 |
 * | missions | 미션 참가 행 수 |
 * | mission-rank | 활성 랭킹 미션 참가자 수 |
 * | following | 지난 24시간 이벤트 행 수 |
 * | sync-stalled | 스트라바 연결 수 |
 * | inventory-full | 인벤토리 수(전수) |
 */
import { buildCollectionDrafts } from './collections'
import { buildDropSpotDrafts } from './dropSpot'
import { buildMissionDrafts, buildMissionRankDrafts } from './missions'
import { buildFollowingDrafts } from './following'
import { buildInventoryFullDrafts, buildSyncStalledDrafts } from './account'
import {
  createBatchContext,
  runStep,
  type BatchContext,
  type BatchStepResult,
  type StepOutput,
} from './shared'

export * from './shared'

/**
 * 이 시간을 넘기면 경고를 남긴다. 라우트의 `maxDuration`이 60초라 그 전에 눈치채야 한다 —
 * 타임아웃되면 **요약 로그 자체가 남지 않아** 일부만 생성된 상태가 흔적 없이 지나간다.
 */
export const BATCH_SLOW_MS = 45_000

export interface NotificationBatchResult {
  startedAt: string
  durationMs: number
  /** 전 단계가 훑은 행 수 합 */
  scanned: number
  /** 전 단계가 만들려고 시도한 소식 수 합 */
  drafts: number
  created: number
  failed: number
  steps: BatchStepResult[]
}

const STEPS: { name: string; run: (ctx: BatchContext) => Promise<StepOutput> }[] = [
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
  // 실행 시간은 **주입된 `startedAt`이 아니라 실제 시계**로 잰다. 검증·수동 실행에서
  // 과거·미래 시각을 넣으면 `startedAt` 기준 차이는 음수가 되고 느린 실행 경고가 죽는다.
  const clockFrom = Date.now()
  const steps: BatchStepResult[] = []

  // 단계는 순차 실행한다 — 동시에 돌리면 service_role 커넥션과 RPC 왕복이 한꺼번에 몰린다.
  for (const step of STEPS) {
    steps.push(await runStep(step.name, () => step.run(ctx), ctx))
  }

  const created = steps.reduce((sum, s) => sum + s.created, 0)
  const failed = steps.reduce((sum, s) => sum + s.failed, 0)
  const scanned = steps.reduce((sum, s) => sum + s.scanned, 0)
  const drafts = steps.reduce((sum, s) => sum + s.drafts, 0)
  const durationMs = Date.now() - clockFrom

  if (durationMs >= BATCH_SLOW_MS) {
    console.warn(
      `[notifications-batch] 실행 시간 ${durationMs}ms — maxDuration 60초에 근접한다. ` +
        `타임아웃되면 요약 로그 없이 일부만 생성된 상태가 된다. 느린 단계: ` +
        steps
          .slice()
          .sort((a, b) => b.durationMs - a.durationMs)
          .slice(0, 3)
          .map((s) => `${s.step}=${s.durationMs}ms`)
          .join(', ')
    )
  }

  return {
    startedAt: ctx.startedAt.toISOString(),
    durationMs,
    scanned,
    drafts,
    created,
    failed,
    steps,
  }
}
