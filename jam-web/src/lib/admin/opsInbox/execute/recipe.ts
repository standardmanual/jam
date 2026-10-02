/**
 * 레시피 핸들러 (티켓 20261002_2221, 상위 20260930_1500 ⑧-a). 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8.1·§8.2·§8.4·§8.5다. 틀은 `mission.ts`다.
 *
 * 승인된 `recipe` 항목을 예약 등록 실행 때 `combination_recipes` 행(공개 전)과 슬롯으로 만든다. 변환은 `toRecipeRegisterInput`(§8.4)과 `normalizeRecipePayload`,
 * 등록 전 검증은 레시피 서버 함수 `buildRecipeRow`와 `findUnlaunchedCollectionBadges`, 만들기·공개 전 취소는 `createRecipeWithSlots`·`cancelScheduledRecipe`를 감싼다.
 *
 * 순수 모듈 계약: `node:`·Supabase·서버 모듈을 값으로 가져오지 않는다(타입은 `import type`). 요약창이 사전 점검을 거쳐 이 파일을 끌어온다.
 * 레시피 서버 함수(`lib/admin/recipe-write.ts`)는 서비스 클라이언트를 인자로 받고 값 import에 서버 모듈이 없어 이 계약을 지킨다.
 * 응답·결정 기록·슬랙에 나가는 `reason`은 아래 고정 문장과, 레시피 서버 함수가 돌려주는 쉬운 문장(`buildRecipeRow`·`assertValidPeriod`의 오류)뿐이다.
 * DB 오류 원문·기존 레시피나 배지·컬렉션 ID·칼럼 이름은 `detail`(서버 로그)에만 둔다. 단, 형식 오류는 변환 오류 문장의 첫 문장을 그대로 싣는다.
 *
 * - `prepare`는 변환 뒤 `normalizeRecipePayload(payload, now)`로 형식(슬롯·보상·시각 형식, 공개 시각이 미래인지)을 본다. 현재 시각은 실행이 넘긴다(`now`, 티켓 20261002_2221 가정 4).
 * - `check`는 슬롯 후보·보상 배지의 존재와 타입(`buildRecipeRow`) → 공개·종료 시각 순서(`assertValidPeriod`) → 아직 열리지 않은 컬렉션의 배지가 없는지 순서로 본다.
 *   컬렉션 검사는 레시피 공개 시각(`valid_from`) 기준이고, 컬렉션을 읽지 못하면 실패다. 사전 점검은 DB를 읽지 않아 이 검사를 하지 못한다(§8.4).
 * - `create`는 정한 ID(`prepared.id`)로 만들고 같은 ID를 돌려준다(`idFirst`). 서버 오류(500)면 같은 ID로 정리 delete를 한 번 시도한다(슬롯은 CASCADE).
 * - `undo`는 이 레시피를 가리키는 배지(`recipe_first_success`)를 확인한 뒤 ID로 지운다. 시각 조건은 걸지 않는다(상태 맞추기의 멈춘 준비중 정리는 공개 시각이 지난 뒤에 올 수 있다).
 * - `cancel`은 레시피를 다시 읽어 공개됐으면 막고, 지우기는 `cancelScheduledRecipe`(참조 확인·`valid_from > now` 조건)에 맡긴다. 서버 함수의 문장은 어드민 화면용이라 사유로 쓰지 않는다.
 * - `observe`(상태 맞추기, §8.6)는 `recipeReleaseState`로 공개 중·종료를 돌려준다. 레시피에는 비활성 칸이 없어 `inactive`는 늘 `false`다.
 */
import { collectRecipeReferences } from '@/lib/admin/recipe-references'
import { assertValidPeriod, buildRecipeRow, cancelScheduledRecipe, createRecipeWithSlots } from '@/lib/admin/recipe-write'
import { toRecipeRegisterInput } from '@/lib/admin/opsInbox/registerInput'
import type { RecipeRegisterPayload, RegisterInputIssue } from '@/lib/admin/opsInbox/registerInput'
import { findUnlaunchedCollectionBadges } from '@/lib/admin/registerChecks/recipe'
import type { RegisterChecksClient } from '@/lib/admin/registerChecks/shared'
import { normalizeRecipePayload } from '@/lib/combine/recipe-payload'
import { recipeReleaseState } from '@/lib/combine/visibility'
import { RESOURCE_KEY_BY_KIND } from './handlers'
import type { CancelResult, ExecuteFailure, ExecuteHandler, ExecuteOutcome, ExecutePrepared, ExecuteServiceClient, ResourceObservation } from './handlers'

/** 응답·결정 기록·슬랙에 나가는 사유(티켓 20261002_2221 가정 5). */
const RECIPE_MESSAGES = {
  formatInvalid: '레시피 형식이 맞지 않아요',
  collectionNotLaunched: '아직 열리지 않은 컬렉션의 배지가 들어 있어요',
  checkReadFailed: '등록 전 확인 중 DB를 읽지 못했어요',
  createFailed: '레시피를 만들지 못했어요',
  undoBlocked: '연결된 배지가 있거나 확인하지 못해 레시피를 지우지 않았어요',
  undoFailed: '레시피를 지우지 못했어요',
  // 취소. 지우기 실패 문장은 되돌림과 같은 것을 쓴다.
  cancelPublished: '공개 시각이 지나 취소할 수 없어요',
  cancelReferenced: '가장 먼저 성공 배지가 이 레시피를 가리키고 있거나 확인하지 못해 지우지 않았어요',
} as const

/** 읽은 레시피 행의 시각이 시각으로 읽히지 않을 때(상태 맞추기). 사유가 아니라 서버 로그용이다. */
const OBSERVE_BAD_TIME = '레시피 시각을 읽을 수 없어요'

/** 취소·상태 맞추기가 다시 읽는 칸. 공개 판정(`recipeReleaseState`)에 필요한 것뿐이다. */
const READ_COLUMNS = 'id, valid_from, valid_until'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 등록 전 확인이 레시피 서버 함수(`buildRecipeRow`)에 넘길 클라이언트. `check`가 받는 `RegisterChecksClient`는 실행 경로가 서비스 클라이언트를
 * `asRegisterChecksClient`로 좁혀 넘긴 것이라 실체가 같다. 서버 함수는 서비스 클라이언트 타입을 요구해서 되돌리는 이 캐스트를 한 곳에만 둔다(티켓 20261002_2221 가정 4).
 */
function asServiceClient(client: RegisterChecksClient): ExecuteServiceClient {
  return client as unknown as ExecuteServiceClient
}

/** 공개 판정(`recipeReleaseState`)이 읽는 시각 두 칸. */
type RecipeTimes = { valid_from: string | null; valid_until: string | null }

/** 두 시각 칸이 시각으로 읽히는지(비어 있으면 읽을 필요가 없다). */
function timesReadable(row: RecipeTimes): boolean {
  return [row.valid_from, row.valid_until].every((value) => value === null || Number.isFinite(Date.parse(value)))
}

export const RECIPE_HANDLER: ExecuteHandler<RecipeRegisterPayload> = {
  kind: 'recipe',
  resourceKey: RESOURCE_KEY_BY_KIND.recipe,
  idFirst: true,

  prepare(item, { id, linkedIds, now }): ExecuteOutcome<ExecutePrepared<RecipeRegisterPayload>> {
    const result = toRecipeRegisterInput(item)
    const issues: RegisterInputIssue[] = [...result.errors]
    // 변환이 통과한 뒤에야 형식 검사를 한다(변환 오류가 있으면 payload가 없다).
    if (result.payload !== null && issues.length === 0) {
      const normalized = normalizeRecipePayload(result.payload, now)
      if (!normalized.ok) issues.push({ path: 'recipe', message: normalized.error })
    }
    if (result.payload === null || issues.length > 0) {
      const [first, ...rest] = issues
      const more = rest.length > 0 ? ` (외 ${rest.length}건)` : ''
      const reason = first ? `${RECIPE_MESSAGES.formatInvalid}: ${first.message}${more}` : RECIPE_MESSAGES.formatInvalid
      return { ok: false, failure: { reason, detail: issues.map((issue) => `${issue.path} ${issue.message}`).join(' / ') } }
    }
    return {
      ok: true,
      value: { item, id, payload: result.payload, linkFields: result.linkFields, linkedIds, warnings: result.warnings },
    }
  },

  async check(client, prepared, { now }): Promise<ExecuteFailure | null> {
    // 형식·슬롯 후보·보상 배지의 존재와 타입. 오류 문장은 이미 쉬운 문장이라 사유로 그대로 쓴다(DB 오류 원문은 서버 함수가 로그에만 남긴다).
    const built = await buildRecipeRow(asServiceClient(client), prepared.payload, now)
    if (!built.ok) return { reason: built.error, detail: built.error }

    const period = assertValidPeriod(null, built.row.valid_from, built.row.valid_until)
    if (!period.ok) return { reason: period.error, detail: period.error }

    // 레시피가 열리는 순간에 아직 열리지 않은 컬렉션의 배지가 슬롯이나 보상에 있으면 막는다. 읽지 못하면 통과시키지 않는다.
    const badgeIds = [...built.slots.flatMap((slot) => slot.allowed_badge_ids), ...built.row.reward_badge_ids]
    try {
      const unlaunched = await findUnlaunchedCollectionBadges(client, badgeIds, built.row.valid_from ?? now.toISOString())
      if (unlaunched.length === 0) return null
      return {
        reason: RECIPE_MESSAGES.collectionNotLaunched,
        detail: unlaunched.map((entry) => `배지 ${entry.badgeId}(컬렉션 ${entry.itemBookId})`).join(' / '),
      }
    } catch (err) {
      return { reason: RECIPE_MESSAGES.checkReadFailed, detail: messageOf(err) }
    }
  },

  async create(service: ExecuteServiceClient, prepared, { now }): Promise<ExecuteOutcome<{ id: string }>> {
    const created = await createRecipeWithSlots(service, prepared.payload, now, { id: prepared.id })
    if (created.ok) return { ok: true, value: { id: prepared.id } }

    // 검증 오류(400)는 쉬운 문장이라 그대로 싣는다. 서버 오류(500)는 고정 문장이고 원문은 detail에만 둔다.
    if (created.status === 400) return { ok: false, failure: { reason: created.error, detail: created.error } }

    // 오류 응답인데 행이 생긴 경우에 대비해 같은 ID로 한 번 지운다. 슬롯은 레시피 삭제 때 함께 지워진다. 결과는 detail에만 적는다.
    let cleanup: string
    try {
      const removed = await service.from('combination_recipes').delete().eq('id', prepared.id)
      cleanup = removed.error ? `정리 delete 실패: ${removed.error.message}` : '정리 delete 시도'
    } catch (err) {
      cleanup = `정리 delete 예외: ${messageOf(err)}`
    }
    return { ok: false, failure: { reason: RECIPE_MESSAGES.createFailed, detail: `생성 실패: ${created.error} / ${cleanup}` } }
  },

  async undo(service: ExecuteServiceClient, resourceId): Promise<ExecuteFailure | null> {
    // 이 레시피를 가리키는 배지가 있거나 확인하지 못하면 지우지 않는다. 시각 조건은 걸지 않는다.
    const references = await collectRecipeReferences(service, [resourceId])
    if (references.error) return { reason: RECIPE_MESSAGES.undoBlocked, detail: `참조 확인 실패: ${references.error}` }
    if (references.total > 0) return { reason: RECIPE_MESSAGES.undoBlocked, detail: `이 레시피를 가리키는 배지가 ${references.total}개 있어요` }

    const removed = await service.from('combination_recipes').delete().eq('id', resourceId)
    if (removed.error) return { reason: RECIPE_MESSAGES.undoFailed, detail: removed.error.message }
    return null
  },

  async cancel(service: ExecuteServiceClient, resourceId, { now }): Promise<CancelResult> {
    const failed = (detail: string): CancelResult => ({ ok: false, code: 'error', failure: { reason: RECIPE_MESSAGES.undoFailed, detail } })
    const published: CancelResult = { ok: false, code: 'published', failure: { reason: RECIPE_MESSAGES.cancelPublished } }

    const read = await service.from('combination_recipes').select(READ_COLUMNS).eq('id', resourceId).maybeSingle()
    if (read.error) return failed(`레시피 조회 실패: ${read.error.message}`)
    if (!read.data) return { ok: true, missing: true }
    if (recipeReleaseState(read.data, now) !== 'scheduled') return published

    // 참조 확인과 `valid_from > now` 조건의 삭제는 서버 함수가 한다. 서버 함수의 문장은 어드민 화면용이라 상태 코드만 쓴다.
    const cancelled = await cancelScheduledRecipe(service, resourceId, now)
    if (cancelled.ok) return { ok: true, missing: false }
    if (cancelled.status === 404) return { ok: true, missing: true }
    if (cancelled.status === 500) return failed(`레시피 취소 실패: ${cancelled.error}`)

    // 409는 「참조 있음」과 「그사이 공개됨」 두 경우에 쓰인다. 다시 읽어 가른다.
    const reread = await service.from('combination_recipes').select(READ_COLUMNS).eq('id', resourceId).maybeSingle()
    if (reread.error) return failed(`취소 뒤 레시피 재조회 실패: ${reread.error.message}`)
    if (!reread.data) return { ok: true, missing: true }
    if (recipeReleaseState(reread.data, now) !== 'scheduled') return published
    return { ok: false, code: 'referenced', failure: { reason: RECIPE_MESSAGES.cancelReferenced, detail: cancelled.error } }
  },

  async observe(service: ExecuteServiceClient, resourceId, { now }): Promise<ResourceObservation> {
    const read = await service.from('combination_recipes').select(READ_COLUMNS).eq('id', resourceId).maybeSingle()
    if (read.error) return { status: 'error', detail: `레시피 조회 실패: ${read.error.message}` }
    if (!read.data) return { status: 'missing' }

    // 읽을 수 없는 시각은 서버 함수의 판정이 「공개 전」·「종료」로 기울어 닫히므로, 상태를 바꾸지 않도록 먼저 가른다.
    const row: RecipeTimes = { valid_from: read.data.valid_from, valid_until: read.data.valid_until }
    if (!timesReadable(row)) return { status: 'error', detail: OBSERVE_BAD_TIME }

    const state = recipeReleaseState(row, now)
    return {
      status: 'present',
      published: state === 'released',
      ended: state === 'ended',
      startsAt: row.valid_from,
      endsAt: row.valid_until,
      inactive: false,
    }
  },
}
