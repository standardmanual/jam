/**
 * JAM! 배지 핸들러 (티켓 20261004_1756, 상위 20260930_1500 ⑨-a). 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8.1·§8.2·§8.4다. 틀은 `mission.ts`·`recipe.ts`다.
 *
 * 승인된 `jam_badge` 항목을 예약 등록 실행 때 `badges` 행(공개 전, `type = 'activity'`, `admin_category = 'jam'`)으로 만든다. 변환은 `toJamBadgeRegisterInput`(§8.4)과
 * 어드민 배지 생성 API의 변환(`buildBadgeInsertPayload`), 등록 전 DB 검사는 `runBadgeDbChecks`, 되돌림 전 참조 확인은 `findBadgeUndoReferences`를 감싼다.
 *
 * 순수 모듈 계약: `node:`·Supabase·서버 모듈을 값으로 가져오지 않는다(타입은 `import type`). 요약창이 사전 점검을 거쳐 이 파일을 끌어온다.
 * 어드민 배지 검증(`badge-validation.ts`)·등록 전 검사(`registerChecks/badge.ts`)가 서버 모듈을 거쳐 끌어오지 않도록 상수를 순수 파일로 옮겼다
 * (`drop-engine/cumulativeConditionFields.ts`, `badge-engine/jamActionKeys.ts`, `admin/familyKey.ts`). `execute/__tests__/pureModules.test.ts`가 값 import를 끝까지 따라가 확인한다.
 * 응답·결정 기록·슬랙에 나가는 `reason`은 아래 고정 문장뿐이다. DB 오류 원문·기존 배지나 레시피 ID·칼럼 이름은 `detail`(서버 로그)에만 둔다.
 * 단, 형식 오류는 변환 오류 문장(운영 항목에 붙은 오류)의 첫 문장을 그대로 싣는다.
 *
 * - `prepare`는 변환 뒤 조건 저장 규칙(`findBadgeConditionSaveError`)과 발급 조건 유무를 본다. 발급 조건이 없는 배지(`USAGE_METRIC_CONDITION_KEYS`·`JAM_ACTION_CONDITION_KEYS`·
 *   `recipe_first_success` 가운데 하나도 없고 `mission_reward: true`도 아닌 것)는 메인 엔진이 `admin_category = 'jam'`을 후보에서 빼므로 영원히 발급되지 않아 형식 오류다.
 * - `check`는 이름 중복 등 DB 검사(`runBadgeDbChecks`)를 라벨별 고정 문장으로 바꾸고, 연결 없이 `condition_json`에 직접 적은 레시피(`recipe_first_success`)가
 *   있으면 DB의 레시피를 읽어 같은 시각에 공개되는지 본다(§8.2의 「가장 먼저 성공 배지는 레시피와 같은 시각」). 같은 실행에서 만들 레시피(연결)는 존재 확인을 건너뛴다
 *   (생성 순서가 보장하고, 시각은 사전 점검이 항목으로 본다). `runBadgeDbChecks`는 레시피 ID를 읽지 않아 연결 칸을 뺀 사본이 필요 없다.
 * - `create`는 정한 ID(`prepared.id`)로 만들고 같은 ID를 돌려준다(`idFirst`). 오류 응답이면 같은 ID로 정리 delete를 한 번 시도한다.
 * - `undo`는 참조(획득 기록·연결·배열 칸)를 확인한 뒤 ID로 지운다. 하드 삭제다(등록 스크립트 `--undo`와 같다).
 * - `cancel`은 배지를 다시 읽어 공개됐으면 막고, 참조를 확인한 뒤, 지울 때도 `valid_from > now` 조건을 함께 건다(읽은 뒤 공개 시각이 지나는 경합). 미션 취소와 같은 흐름이다.
 * - `observe`(상태 맞추기, §8.6)는 `valid_from <= 지금 <= valid_until`(종료가 없으면 끝없음, 발급 엔진과 같은 양 끝 포함)로 공개 중, `지금 > valid_until`로 종료를 돌려준다.
 *   배지에는 비활성 칸이 없어 `inactive`는 늘 `false`다. 소프트 삭제된 배지(`deleted_at`)는 운영툴 밖에서 지워진 것으로 본다.
 */
import { findBadgeConditionSaveError } from '@/lib/admin/badge-validation'
import { toJamBadgeRegisterInput, withoutSavePrefix, JAM_BADGE_RECIPE_LINK_FIELD } from '@/lib/admin/opsInbox/registerInput'
import type { JamBadgeRegisterPayload, RegisterInputIssue } from '@/lib/admin/opsInbox/registerInput'
import { asRecord } from '@/lib/admin/opsInbox/itemView'
import { runBadgeDbChecks } from '@/lib/admin/registerChecks/badge'
import { findBadgeUndoReferences } from '@/lib/admin/registerChecks/references'
import type { RegisterCheck, RegisterChecksClient, RegisterQueryResult, RegisterRow } from '@/lib/admin/registerChecks/shared'
import { isUuid } from '@/lib/admin/uuid'
import { USAGE_METRIC_CONDITION_KEYS } from '@/lib/badge-engine/conditionRegistry'
import { JAM_ACTION_CONDITION_KEYS } from '@/lib/badge-engine/jamActionKeys'
import type { BadgeCondition } from '@/types/database'
import { RESOURCE_KEY_BY_KIND, asRegisterChecksClient } from './handlers'
import type { CancelResult, ExecuteFailure, ExecuteHandler, ExecuteOutcome, ExecutePrepared, ExecuteServiceClient, ResourceObservation } from './handlers'

/** 응답·결정 기록·슬랙에 나가는 사유(티켓 20261004_1756 가정 7). */
export const JAM_BADGE_MESSAGES = {
  formatInvalid: '배지 형식이 맞지 않아요',
  duplicate: '같은 이름의 배지가 이미 있어요',
  checkinNamesMissing: '체크인 배지 이름 목록에 없는 이름이 있어요',
  recipeMissing: '가장 먼저 성공할 레시피가 없어요',
  recipeStartsDiffer: '가장 먼저 성공 배지는 레시피와 같은 시각에 공개돼야 해요',
  checkReadFailed: '등록 전 확인 중 DB를 읽지 못했어요',
  checkFailed: '등록 전 확인을 통과하지 못했어요',
  createFailed: '배지를 만들지 못했어요',
  undoBlocked: '획득 기록이나 연결이 있거나 확인하지 못해 배지를 지우지 않았어요',
  undoFailed: '배지를 지우지 못했어요',
  // 취소. 참조 확인과 지우기 실패 문장은 되돌림과 같은 것을 쓴다.
  cancelPublished: '공개 시각이 지나 취소할 수 없어요',
} as const

/** 읽은 배지 행의 시각이 시각으로 읽히지 않을 때(상태 맞추기). 사유가 아니라 서버 로그용이다. */
const OBSERVE_BAD_TIME = '배지 시각을 읽을 수 없어요'

/** 등록 전 DB 검사의 라벨(`registerChecks/badge.ts`) → 사유. 트라이브·컬렉션 검사는 이 변환이 칸을 읽지 않아 늘 「해당 없음」이다. */
const REASON_BY_CHECK_LABEL: Readonly<Record<string, string>> = {
  '이름 중복': JAM_BADGE_MESSAGES.duplicate,
  '체크인 배지 이름 목록': JAM_BADGE_MESSAGES.checkinNamesMissing,
}

/** DB를 읽지 못했을 때 검사가 남기는 실패 문장의 앞부분(`registerChecks/shared.ts`·`badge.ts`). */
const DB_READ_FAILED_PREFIX = 'DB 조회에 실패했어요'

/** 취소·상태 맞추기가 다시 읽는 칸. 공개 판정과 소프트 삭제 여부에 필요한 것뿐이다. */
const READ_COLUMNS = 'id, valid_from, valid_until, deleted_at'

/** 발급 판정에 관여하는 조건 키. 어드민 배지 저장 검사의 「사용량 지표」와 JAM! 행동 지표를 합친 것이다(`recipe_first_success` 포함). */
const ISSUING_CONDITION_KEYS: ReadonlySet<string> = new Set<string>([...USAGE_METRIC_CONDITION_KEYS, ...JAM_ACTION_CONDITION_KEYS, 'recipe_first_success'])

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 처음 실패한 검사의 사유. DB를 읽지 못한 실패는 라벨보다 먼저 본다. */
function reasonOfCheck(check: RegisterCheck | undefined): string {
  if (!check) return JAM_BADGE_MESSAGES.checkFailed
  if (check.detail.startsWith(DB_READ_FAILED_PREFIX)) return JAM_BADGE_MESSAGES.checkReadFailed
  return REASON_BY_CHECK_LABEL[check.label] ?? JAM_BADGE_MESSAGES.checkFailed
}

/** 조건에 발급 판정이 읽는 키가 하나라도 있는지(미션 보상 표시 `mission_reward: true` 포함). */
function hasIssuingCondition(condition: Record<string, unknown>): boolean {
  return condition.mission_reward === true || Object.keys(condition).some((key) => ISSUING_CONDITION_KEYS.has(key))
}

/** `condition_json.recipe_first_success.recipe_id`. 없거나 문자열이 아니면 `undefined`다. */
function firstSuccessRecipeId(condition: Record<string, unknown> | null): string | undefined {
  const value = asRecord(condition?.recipe_first_success)?.recipe_id
  return typeof value === 'string' ? value : undefined
}

/** 변환이 통과한 뒤의 조건 형식 검사. 어드민 배지 저장 검사(`findBadgeConditionSaveError`)와 발급 조건 유무, 레시피 ID 형식이다. */
function conditionIssues(payload: JamBadgeRegisterPayload): RegisterInputIssue[] {
  const issues: RegisterInputIssue[] = []
  const condition = asRecord(payload.condition_json) ?? {}

  const saveError = findBadgeConditionSaveError({ name: payload.name, family_key: payload.family_key ?? null }, 'activity', condition as BadgeCondition)
  if (saveError) issues.push({ path: 'resource.condition_json', message: `badge.condition_json: ${withoutSavePrefix(saveError)}` })

  if (!hasIssuingCondition(condition)) {
    issues.push({
      path: 'resource.condition_json',
      message: 'badge.condition_json: 발급 조건이 없는 배지예요. JAM! 행동 지표(믹스·드랍·미션 등)나 미션 보상(mission_reward) 조건이 하나 있어야 발급돼요.',
    })
  }

  if ('recipe_first_success' in condition) {
    const recipeId = firstSuccessRecipeId(condition)
    if (recipeId === undefined || !isUuid(recipeId)) {
      issues.push({ path: 'resource.condition_json', message: 'badge.condition_json: recipe_first_success의 recipe_id가 레시피 ID(UUID) 형식이 아니에요.' })
    }
  }
  return issues
}

/**
 * 연결 없이 `condition_json`에 직접 적은 레시피를 확인한다: 레시피가 있고, 공개 시각(`valid_from`)이 배지와 같아야 한다(밀리초 비교).
 * 레시피가 이미 열려 있으면(`valid_from`이 비어 바로 공개) 배지가 나중에 열리므로 다르다. 읽지 못하면 통과시키지 않는다.
 */
async function checkDirectRecipe(client: RegisterChecksClient, recipeId: string, badgeValidFrom: string | null | undefined): Promise<ExecuteFailure | null> {
  let read: RegisterQueryResult<RegisterRow>
  try {
    read = await client.from('combination_recipes').select('id, valid_from').eq('id', recipeId).maybeSingle()
  } catch (err) {
    return { reason: JAM_BADGE_MESSAGES.checkReadFailed, detail: `레시피 조회 예외: ${messageOf(err)}` }
  }
  if (read.error) return { reason: JAM_BADGE_MESSAGES.checkReadFailed, detail: `레시피 조회 실패: ${read.error.message}` }
  if (!read.data) return { reason: JAM_BADGE_MESSAGES.recipeMissing, detail: `레시피 ${recipeId}를 찾을 수 없어요` }

  const recipeFrom = read.data.valid_from
  const badgeMs = Date.parse(String(badgeValidFrom))
  if (recipeFrom === null || recipeFrom === undefined) {
    return { reason: JAM_BADGE_MESSAGES.recipeStartsDiffer, detail: `레시피 ${recipeId}는 이미 공개 중이에요(valid_from 없음)` }
  }
  const recipeMs = typeof recipeFrom === 'string' ? Date.parse(recipeFrom) : NaN
  if (!Number.isFinite(recipeMs) || !Number.isFinite(badgeMs)) {
    return { reason: JAM_BADGE_MESSAGES.checkReadFailed, detail: `레시피 ${recipeId}의 공개 시각을 읽을 수 없어요(${String(recipeFrom)})` }
  }
  if (recipeMs !== badgeMs) {
    return { reason: JAM_BADGE_MESSAGES.recipeStartsDiffer, detail: `배지 공개 ${String(badgeValidFrom)} / 레시피 ${recipeId} 공개 ${recipeFrom}` }
  }
  return null
}

export const JAM_BADGE_HANDLER: ExecuteHandler<JamBadgeRegisterPayload> = {
  kind: 'jam_badge',
  resourceKey: RESOURCE_KEY_BY_KIND.jam_badge,
  idFirst: true,

  prepare(item, { id, linkedIds }): ExecuteOutcome<ExecutePrepared<JamBadgeRegisterPayload>> {
    const result = toJamBadgeRegisterInput(item, { id, linkedIds })
    const issues: RegisterInputIssue[] = [...result.errors]
    // 변환이 통과한 뒤에야 조건 검사를 한다(변환 오류가 있으면 payload가 없다).
    if (result.payload !== null && issues.length === 0) issues.push(...conditionIssues(result.payload))
    if (result.payload === null || issues.length > 0) {
      const [first, ...rest] = issues
      const more = rest.length > 0 ? ` (외 ${rest.length}건)` : ''
      const reason = first ? `${JAM_BADGE_MESSAGES.formatInvalid}: ${first.message}${more}` : JAM_BADGE_MESSAGES.formatInvalid
      return { ok: false, failure: { reason, detail: issues.map((issue) => `${issue.path} ${issue.message}`).join(' / ') } }
    }
    return {
      ok: true,
      value: { item, id, payload: result.payload, linkFields: result.linkFields, linkedIds, warnings: result.warnings },
    }
  },

  async check(client, prepared): Promise<ExecuteFailure | null> {
    const condition = asRecord(prepared.payload.condition_json)
    // 트라이브·컬렉션은 이 변환이 읽지 않아 null이다(검사는 「해당 없음」). 연결로 채운 레시피 ID는 이 검사가 읽지 않는다.
    const result = await runBadgeDbChecks({
      supabase: client,
      badge: { name: prepared.payload.name, tribe_id: null, item_book_id: null, condition_json: condition as BadgeCondition | null },
    })
    if (result.errors.length > 0) {
      return { reason: reasonOfCheck(result.checks.find((check) => check.status === '실패')), detail: result.errors.join(' / ') }
    }

    // 연결로 채운 레시피는 같은 실행(또는 이전 실행)이 만든 것이라 건너뛴다. 직접 적은 레시피만 본다.
    if (prepared.linkFields.includes(JAM_BADGE_RECIPE_LINK_FIELD)) return null
    const recipeId = firstSuccessRecipeId(condition)
    return recipeId === undefined ? null : checkDirectRecipe(client, recipeId, prepared.payload.valid_from)
  },

  async create(service: ExecuteServiceClient, prepared): Promise<ExecuteOutcome<{ id: string }>> {
    const inserted = await service.from('badges').insert(prepared.payload)
    if (!inserted.error) return { ok: true, value: { id: prepared.id } }

    // 오류 응답인데 행이 생긴 경우에 대비해 같은 ID로 한 번 지운다. 결과는 detail에만 적는다.
    let cleanup: string
    try {
      const removed = await service.from('badges').delete().eq('id', prepared.id)
      cleanup = removed.error ? `정리 delete 실패: ${removed.error.message}` : '정리 delete 시도'
    } catch (err) {
      cleanup = `정리 delete 예외: ${messageOf(err)}`
    }
    return { ok: false, failure: { reason: JAM_BADGE_MESSAGES.createFailed, detail: `insert 실패: ${inserted.error.message} / ${cleanup}` } }
  },

  async undo(service: ExecuteServiceClient, resourceId): Promise<ExecuteFailure | null> {
    try {
      await findBadgeUndoReferences(asRegisterChecksClient(service), resourceId)
    } catch (err) {
      return { reason: JAM_BADGE_MESSAGES.undoBlocked, detail: messageOf(err) }
    }
    const removed = await service.from('badges').delete().eq('id', resourceId)
    if (removed.error) return { reason: JAM_BADGE_MESSAGES.undoFailed, detail: removed.error.message }
    return null
  },

  async cancel(service: ExecuteServiceClient, resourceId, { now }): Promise<CancelResult> {
    const failed = (detail: string): CancelResult => ({ ok: false, code: 'error', failure: { reason: JAM_BADGE_MESSAGES.undoFailed, detail } })
    const published: CancelResult = { ok: false, code: 'published', failure: { reason: JAM_BADGE_MESSAGES.cancelPublished } }

    const read = await service.from('badges').select(READ_COLUMNS).eq('id', resourceId).maybeSingle()
    if (read.error) return failed(`배지 조회 실패: ${read.error.message}`)
    // 행이 없거나 소프트 삭제됐으면 운영툴 밖에서 지워진 것이다.
    if (!read.data || read.data.deleted_at) return { ok: true, missing: true }
    // 공개 시각이 없거나 읽을 수 없거나 지금 이전(정확히 지금 포함)이면 공개된 것으로 본다. 모르면 지우지 않는다.
    const fromMs = read.data.valid_from === null ? NaN : Date.parse(read.data.valid_from)
    if (!(fromMs > now.getTime())) return published

    try {
      await findBadgeUndoReferences(asRegisterChecksClient(service), resourceId)
    } catch (err) {
      return { ok: false, code: 'referenced', failure: { reason: JAM_BADGE_MESSAGES.undoBlocked, detail: messageOf(err) } }
    }

    // 읽은 뒤 공개 시각이 지날 수 있어 지울 때도 같은 조건을 건다. 지운 행이 없으면 다시 읽어 공개됐는지, 그사이 없어졌는지 가른다.
    const removed = await service.from('badges').delete().eq('id', resourceId).gt('valid_from', now.toISOString()).select('id')
    if (removed.error) return failed(`배지 삭제 실패: ${removed.error.message}`)
    if (removed.data && removed.data.length > 0) return { ok: true, missing: false }

    const reread = await service.from('badges').select('id, deleted_at').eq('id', resourceId).maybeSingle()
    if (reread.error) return failed(`삭제 뒤 배지 재조회 실패: ${reread.error.message}`)
    return reread.data && !reread.data.deleted_at ? published : { ok: true, missing: true }
  },

  async observe(service: ExecuteServiceClient, resourceId, { now }): Promise<ResourceObservation> {
    const read = await service.from('badges').select(READ_COLUMNS).eq('id', resourceId).maybeSingle()
    if (read.error) return { status: 'error', detail: `배지 조회 실패: ${read.error.message}` }
    if (!read.data || read.data.deleted_at) return { status: 'missing' }

    const row = read.data
    const fromMs = row.valid_from === null ? NaN : Date.parse(row.valid_from)
    const untilMs = row.valid_until === null ? null : Date.parse(row.valid_until)
    if (!Number.isFinite(fromMs) || (untilMs !== null && !Number.isFinite(untilMs))) return { status: 'error', detail: OBSERVE_BAD_TIME }

    // 발급 엔진과 같게 양 끝을 포함한다(`valid_from <= 지금 <= valid_until`). 종료 시각이 없으면 끝없다.
    const nowMs = now.getTime()
    const ended = untilMs !== null && nowMs > untilMs
    return {
      status: 'present',
      published: fromMs <= nowMs && !ended,
      ended,
      startsAt: row.valid_from,
      endsAt: row.valid_until,
      inactive: false,
    }
  },
}
