/**
 * 요약창의 JAM! 배지 소급 미리 세기 (티켓 20261005_1607, 상위 20260930_1500 ⑨-b) — **서버 전용**이다. 규칙의 정본은 `docs/service/prd/ops-tool/PRD.md` §8.2 「요약창」이다.
 *
 * 예약 공개되는 JAM! 배지는 공개 시각에 옛 기록으로 소급 지급되고 회수할 수 없다. `previewBundleBadges`는 사전 점검의 「예약할 항목」(`ready`)에 든 `jam_badge`마다
 * 「공개되면 약 N명에게 P포인트」를 센다. **읽기 전용**이다(`previewUpcomingJamBadges`가 항상 dry-run이고, 이 파일은 DB에 쓰지 않는다).
 *
 * - 배지 정의는 실행과 같은 `JAM_BADGE_HANDLER.prepare`로 만든다(`id`는 운영 항목 ID, `linkedIds`는 실행과 같은 규칙으로 채우되 아직 만들지 않은 대상은 자리표시 UUID,
 *   `pointedBy`는 그룹의 `linkPlan`). DB 검사(`check`)는 부르지 않는다. 연결 도우미(`linkedIdsFor`·`pointedByOf`)는 `run.ts`에 있어 주입으로 받는다
 *   (`run.ts`가 이 파일을 가져오므로 이 파일이 `run.ts`를 가져오면 순환이다).
 * - 줄의 상태: 형식 오류(`formatInvalid`) → JAM! 행동 지표 키가 하나라도 있으면 센다(`counted`) → 같은 그룹 컬렉션의 완성 보상이면 `collectionReward` →
 *   `mission_reward: true`이거나 미션 보상이면 `missionReward` → 그 밖(사용량 지표 등)은 `notCountable`. 센 배지 가운데 센 도중 실패하면 `failed`다.
 * - `badgeIds`로 좁히지 않는다. 이 묶음의 센 배지 정의를 `candidateBadges`로 넘겨 DB 배지와 함께 판정하고(기존 계열에 새로 붙는 Lv.2 이상을 바르게 세려는 것이다),
 *   결과 `badges[]`에서 이 묶음 배지(운영 항목 ID)만 골라낸다. 여러 배지의 유저 수는 합치지 않는다.
 * - 유저가 많으면 표본으로 추정한다: 전체 유저 ID를 읽어 무작위 순서로 섞은 뒤 20명씩 센다. 다 셌거나, 센 유저가 500명에 닿았거나, 40초가 지나면 멈춘다.
 *   다 세지 못했으면 배지별 유저 수를 `센 유저 수 대비 전체 유저 수`로 환산한다(반올림). 첫 덩어리는 늘 센다. 센 배지가 없으면 유저를 읽지 않는다.
 * - 던지지 않는다. 덩어리 하나가 던지거나(배지 메타 조회 실패 등) 유저 ID를 읽지 못하면 센 배지 줄을 모두 `failed`로 한다. 유저 단위 오류(`errors[]`)는 `failedUsers`에 더하고
 *   센 유저 수에서 뺀다. 오류 원문은 서버 로그에만 남기고 응답에 싣지 않는다.
 */
import { JAM_ACTION_CONDITION_KEYS } from '@/lib/badge-engine/jamActionKeys'
import { asRecord } from '@/lib/admin/opsInbox/itemView'
import { fetchAllRows } from '@/lib/db/fetchAllRows'
import type { PreviewUpcomingJamBadgesResult } from '@/lib/badge-engine/reevaluateCatalog'
import type { BadgeRow } from '@/types/database'
import type { ExecuteItem, ExecuteLinkedIds, ExecuteOutcome, ExecuteServiceClient, PointedByEntry } from './handlers'
import { JAM_BADGE_HANDLER } from './jamBadge'
import type { PrecheckGroup, PrecheckResult } from './precheck'
import type { JamBadgeRegisterPayload } from '@/lib/admin/opsInbox/registerInput'

const LOG = '[ops-inbox/badge-preview]'

/** 센 유저가 이 수에 닿으면 멈춘다. */
export const BADGE_PREVIEW_MAX_USERS = 500
/** 이 시간(밀리초)이 지나면 다음 덩어리를 세지 않는다. 라우트의 `maxDuration` 60초 안에서 마지막 덩어리가 끝날 여유를 남긴다. */
export const BADGE_PREVIEW_TIME_BUDGET_MS = 40_000
/** 한 번에 세는 유저 수. */
export const BADGE_PREVIEW_CHUNK = 20

const JAM_BADGE_KIND = 'jam_badge'
const COLLECTION_LAUNCH_KIND = 'collection_launch'
const COLLECTION_REWARD_FIELD = 'reward_badge_id'
const MISSION_KIND = 'mission'
const MISSION_REWARD_FIELD = 'reward_badge_ids'

const JAM_ACTION_KEYS: ReadonlySet<string> = new Set<string>(JAM_ACTION_CONDITION_KEYS)

export type BadgePreviewStatus = 'counted' | 'collectionReward' | 'missionReward' | 'notCountable' | 'formatInvalid' | 'failed'

export interface BadgePreviewLine {
  /** 운영 항목 ID. */
  itemId: string
  status: BadgePreviewStatus
  /** `counted`일 때만 있다. 표본이면 환산한 값이다. */
  userCount?: number
  /** `counted`일 때만 있다. `userCount × 배지 포인트`. */
  points?: number
}

export interface BundleBadgePreview {
  /** 전체 유저 수. 센 배지가 없으면 유저를 읽지 않아 0이다. */
  totalUsers: number
  /** 유저 단위 오류 없이 센 유저 수. 환산 분모다. */
  evaluatedUsers: number
  /** 전체 유저를 다 세지 못해 환산했는지. */
  sampled: boolean
  /** 세다가 오류가 난 유저 수. 센 유저 수와 환산에서 빠진다. */
  failedUsers: number
  /** 예약할 JAM! 배지마다 한 줄(사전 점검의 예약할 항목 순서). */
  lines: BadgePreviewLine[]
}

type LinkedIdsFor = (byId: ReadonlyMap<string, ExecuteItem>, group: PrecheckGroup, item: ExecuteItem, resourceIds: ReadonlyMap<string, string>) => ExecuteOutcome<ExecuteLinkedIds>
type PointedByOf = (byId: ReadonlyMap<string, ExecuteItem>, group: PrecheckGroup, item: ExecuteItem) => PointedByEntry[]

export interface BadgePreviewDeps {
  /** 0 이상 1 미만. 유저 순서를 섞는다. */
  random: () => number
  /** 지금 시각(밀리초). 시간 예산을 잰다. */
  clock: () => number
  /** `prepare`가 받는 현재 시각. */
  now: () => Date
  /** 센 배지 정의로 한 덩어리 유저를 센다. 기본은 `previewUpcomingJamBadges`다. */
  preview: (service: ExecuteServiceClient, options: { userIds: string[]; candidateBadges: BadgeRow[] }) => Promise<PreviewUpcomingJamBadgesResult>
  /** 전체 유저 ID. */
  loadUserIds: (service: ExecuteServiceClient) => Promise<string[]>
  linkedIdsFor: LinkedIdsFor
  pointedByOf: PointedByOf
}

/** 연결 도우미만 필수다(`run.ts`가 넘긴다). 나머지는 기본값이 있고 테스트가 바꾼다. */
export type BadgePreviewInput = Partial<Omit<BadgePreviewDeps, 'linkedIdsFor' | 'pointedByOf'>> & Pick<BadgePreviewDeps, 'linkedIdsFor' | 'pointedByOf'>

/** 배지 엔진은 가져오는 파일이 많아서, 미리 세기를 실제로 부를 때만 불러온다(같은 `run.ts`를 가져오는 다른 라우트·테스트가 끌어오지 않는다). */
async function previewWithEngine(service: ExecuteServiceClient, options: { userIds: string[]; candidateBadges: BadgeRow[] }): Promise<PreviewUpcomingJamBadgesResult> {
  const { previewUpcomingJamBadges } = await import('@/lib/badge-engine/reevaluateCatalog')
  return previewUpcomingJamBadges(service, options)
}

async function loadAllUserIds(service: ExecuteServiceClient): Promise<string[]> {
  const rows = await fetchAllRows<{ id: string }>('users', 'id', () => service.from('users').select('id'))
  return rows.map((row) => row.id)
}

/**
 * `prepare`가 만든 `badges` insert 값을 판정이 읽는 `BadgeRow`로 채운다. 판정이 읽지 않는 칸(배경·이미지 제작 칸 등)은 DB 기본값과 같은 값이다.
 * 공개 전 배지라 `deleted_at`은 비어 있다.
 */
export function toPreviewBadgeRow(payload: JamBadgeRegisterPayload, createdAt: string): BadgeRow {
  return {
    id: payload.id,
    name: payload.name,
    description: payload.description,
    type: 'activity',
    rarity: payload.rarity ?? null,
    level: payload.level ?? null,
    family_key: payload.family_key ?? null,
    sort_order: payload.sort_order ?? 0,
    image_url: payload.image_url ?? null,
    condition_json: (payload.condition_json ?? null) as BadgeRow['condition_json'],
    activity_types: (payload.activity_types ?? []) as BadgeRow['activity_types'],
    patch_available: payload.patch_available ?? false,
    patch_price_krw: payload.patch_price_krw ?? null,
    tribe_id: payload.tribe_id ?? null,
    item_book_id: payload.item_book_id ?? null,
    category: payload.category ?? null,
    admin_category: payload.admin_category ?? null,
    show_on_map: payload.show_on_map ?? true,
    drop_weight: payload.drop_weight ?? 1,
    drop_condition_json: (payload.drop_condition_json ?? null) as BadgeRow['drop_condition_json'],
    valid_from: payload.valid_from ?? null,
    valid_until: payload.valid_until ?? null,
    point_reward: payload.point_reward ?? 0,
    deleted_at: null,
    created_at: createdAt,
    drop_excluded: payload.drop_excluded ?? false,
    background_color: payload.background_color ?? null,
    background_shader_id: payload.background_shader_id ?? null,
    background_image_url: payload.background_image_url ?? null,
    background_video_url: payload.background_video_url ?? null,
    background_animation: (payload.background_animation ?? null) as BadgeRow['background_animation'],
    image_gen_params: (payload.image_gen_params ?? null) as BadgeRow['image_gen_params'],
    image_source: payload.image_source ?? null,
  }
}

/** Fisher–Yates. 원본은 바꾸지 않는다. */
function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const out = [...values]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(random() * (i + 1)))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown'
}

interface Countable {
  line: BadgePreviewLine
  row: BadgeRow
}

/** 예약할 JAM! 배지 하나의 정의를 만들고 줄의 상태를 정한다. 센 배지(`counted`)면 정의를 함께 돌려준다. */
function describeBadge(
  item: ExecuteItem,
  byId: ReadonlyMap<string, ExecuteItem>,
  precheck: PrecheckResult,
  input: Required<BadgePreviewInput>
): Countable | BadgePreviewLine {
  const group = precheck.groups.find((entry) => entry.executeIds.includes(item.id)) ?? { itemIds: [item.id], executeIds: [item.id], linkPlan: {} }
  // 아직 만들지 않은 대상은 자리표시 UUID다(검증 때 실행이 미리 정한 ID를 쓰는 것과 같다).
  const placeholders = new Map(group.executeIds.map((id) => [id, crypto.randomUUID()]))
  const linked = input.linkedIdsFor(byId, group, item, placeholders)
  if (!linked.ok) {
    console.error(`${LOG} 연결 칸을 채우지 못했어요:`, linked.failure.detail ?? linked.failure.reason)
    return { itemId: item.id, status: 'failed' }
  }

  const pointedBy = input.pointedByOf(byId, group, item)
  let prepared: ReturnType<typeof JAM_BADGE_HANDLER.prepare>
  try {
    // 행위자는 쓰이지 않는다(미리 세기는 아무것도 만들지 않는다).
    prepared = JAM_BADGE_HANDLER.prepare(item, { id: item.id, actorId: '', linkedIds: linked.value, now: input.now(), pointedBy })
  } catch (err) {
    console.error(`${LOG} 변환 중 오류:`, messageOf(err))
    return { itemId: item.id, status: 'formatInvalid' }
  }
  if (!prepared.ok) return { itemId: item.id, status: 'formatInvalid' }

  const { payload } = prepared.value
  const condition = asRecord(payload.condition_json) ?? {}
  if (Object.keys(condition).some((key) => JAM_ACTION_KEYS.has(key))) {
    return { line: { itemId: item.id, status: 'counted' }, row: toPreviewBadgeRow(payload, input.now().toISOString()) }
  }
  if (pointedBy.some((entry) => entry.kind === COLLECTION_LAUNCH_KIND && entry.field === COLLECTION_REWARD_FIELD)) return { itemId: item.id, status: 'collectionReward' }
  if (condition.mission_reward === true || pointedBy.some((entry) => entry.kind === MISSION_KIND && entry.field === MISSION_REWARD_FIELD)) {
    return { itemId: item.id, status: 'missionReward' }
  }
  return { itemId: item.id, status: 'notCountable' }
}

function isCountable(value: Countable | BadgePreviewLine): value is Countable {
  return 'row' in value
}

/**
 * 사전 점검의 「예약할 항목」에 든 JAM! 배지마다 공개되면 받게 될 유저 수와 포인트를 센다. 던지지 않는다.
 * `items`는 이 묶음의 모든 항목, `precheck`는 같은 항목으로 만든 사전 점검 결과다.
 */
export async function previewBundleBadges(
  service: ExecuteServiceClient,
  items: readonly ExecuteItem[],
  precheck: PrecheckResult,
  deps: BadgePreviewInput
): Promise<BundleBadgePreview> {
  const input: Required<BadgePreviewInput> = {
    random: Math.random,
    clock: Date.now,
    now: () => new Date(),
    preview: previewWithEngine,
    loadUserIds: loadAllUserIds,
    ...deps,
  }
  const startedAt = input.clock()
  const byId = new Map(items.map((item) => [item.id, item]))

  const described = precheck.ready
    .map((id) => byId.get(id))
    .filter((item): item is ExecuteItem => item !== undefined && item.kind === JAM_BADGE_KIND)
    .map((item) => describeBadge(item, byId, precheck, input))
  const lines = described.map((entry) => (isCountable(entry) ? entry.line : entry))
  const countable = described.filter(isCountable)

  const result = (counts: Omit<BundleBadgePreview, 'lines'>): BundleBadgePreview => ({ ...counts, lines })
  // 센 도중 실패하면 센 배지 줄은 모두 실패다(일부만 믿을 수 없다).
  const failCounted = (counts: Omit<BundleBadgePreview, 'lines'>): BundleBadgePreview => {
    for (const { line } of countable) {
      line.status = 'failed'
      delete line.userCount
      delete line.points
    }
    return result(counts)
  }

  // 센 배지가 없으면 유저를 읽지 않는다.
  if (countable.length === 0) return result({ totalUsers: 0, evaluatedUsers: 0, sampled: false, failedUsers: 0 })

  let userIds: string[]
  try {
    userIds = shuffled([...new Set(await input.loadUserIds(service))], input.random)
  } catch (err) {
    console.error(`${LOG} 유저 목록 조회 실패:`, messageOf(err))
    return failCounted({ totalUsers: 0, evaluatedUsers: 0, sampled: false, failedUsers: 0 })
  }

  const totalUsers = userIds.length
  const candidateBadges = countable.map((entry) => entry.row)
  const rawCounts = new Map<string, number>()
  let attempted = 0
  let evaluated = 0
  let failedUsers = 0

  // 첫 덩어리는 늘 센다. 그 뒤로는 상한이나 시간 예산에 닿으면 멈춘다.
  while (attempted < totalUsers) {
    if (attempted > 0 && (attempted >= BADGE_PREVIEW_MAX_USERS || input.clock() - startedAt >= BADGE_PREVIEW_TIME_BUDGET_MS)) break
    const chunk = userIds.slice(attempted, attempted + Math.min(BADGE_PREVIEW_CHUNK, BADGE_PREVIEW_MAX_USERS - attempted))
    try {
      const counted = await input.preview(service, { userIds: chunk, candidateBadges })
      for (const badge of counted.badges) rawCounts.set(badge.badgeId, (rawCounts.get(badge.badgeId) ?? 0) + badge.userCount)
      failedUsers += counted.errors.length
      evaluated += Math.max(0, chunk.length - counted.errors.length)
      attempted += chunk.length
    } catch (err) {
      console.error(`${LOG} 미리 세기 실패:`, messageOf(err))
      return failCounted({ totalUsers, evaluatedUsers: evaluated, sampled: attempted < totalUsers, failedUsers })
    }
  }

  const sampled = attempted < totalUsers
  const counts = { totalUsers, evaluatedUsers: evaluated, sampled, failedUsers }
  // 센 유저가 한 명도 없으면 환산할 수 없다(0명으로 보이면 안 센 것을 「없다」고 말하게 된다).
  if (totalUsers > 0 && evaluated === 0) return failCounted(counts)

  for (const { line, row } of countable) {
    const raw = rawCounts.get(row.id) ?? 0
    const userCount = sampled ? Math.round((raw * totalUsers) / evaluated) : raw
    line.userCount = userCount
    line.points = userCount * row.point_reward
  }
  return result(counts)
}
