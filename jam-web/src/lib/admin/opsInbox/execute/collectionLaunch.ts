/**
 * 컬렉션 틀 핸들러 (티켓 20261004_2039, 상위 20260930_1500 ⑩-a). 규칙의 정본은 `docs/service/prd/ops-tool/PRD.md` §8.1·§8.2·§8.4다. 틀은 `jamBadge.ts`·`homeFeedCard.ts`다.
 *
 * 승인된 `collection_launch` 항목을 예약 등록 실행 때 `item_books` 행(공개 전, 틀만: 이름·설명·이야기·대표 이미지·보상 포인트·보상 배지·트라이브·공개/종료 시각)으로 만든다.
 * 컬렉션의 아이템 배지는 기존 어드민에서 공개 전에 채운다(Q4)라 예약 등록 때 새 컬렉션은 늘 비어 있다. 변환은 `toCollectionLaunchRegisterInput`(§8.4),
 * 등록 전 DB 검사는 `runCollectionDbChecks`, 되돌림·취소 전 참조 확인은 `findItemBookUndoReferences`를 감싼다.
 *
 * 순수 모듈 계약: `node:`·Supabase·서버 모듈을 값으로 가져오지 않는다(타입은 `import type`). 요약창이 사전 점검을 거쳐 이 파일을 끌어온다(`execute/__tests__/pureModules.test.ts`가 값 import를 끝까지 따라가 확인한다).
 * 응답·결정 기록·슬랙에 나가는 `reason`은 아래 고정 문장뿐이다. DB 오류 원문·컬렉션·배지·트라이브 ID·칼럼 이름은 `detail`(서버 로그)에만 둔다.
 * 단, 형식 오류는 변환 오류 문장(운영 항목에 붙은 오류)의 첫 문장을 그대로 싣는다.
 *
 * - `prepare`는 변환과 형식 검사다(이름·설명·공개 시각 필수, `reward_points` 형식, 종료 시각 순서). 연결로 채운 보상 배지 ID는 `linkedIds`로 받는다.
 * - `check`는 연결로 채운 칸을 뺀 사본(`withoutLinkedFields`)으로 이름 중복·트라이브 존재·보상 배지(존재·삭제·종류) 검사를 라벨별 고정 문장으로 바꾼다.
 *   같은 실행에서 만들 보상 배지(연결)는 존재 확인을 건너뛴다(생성 순서가 보장한다).
 * - `create`는 정한 ID(`prepared.id`)로 만들고 같은 ID를 돌려준다(`idFirst`). 오류 응답이면 같은 ID로 정리 delete를 한 번 시도한다.
 * - `undo`는 참조(아이템 배지·카드·유저 기록·포인트와 배열 칸)를 확인한 뒤 ID로 지운다. 시각 조건은 없다(멈춘 준비중 정리는 공개 시각 뒤에 올 수 있다).
 * - `cancel`은 컬렉션을 다시 읽어 공개 시각이 없거나 지났으면 막고, 참조를 확인한 뒤, 지울 때도 `valid_from > now` 조건을 함께 건다(읽은 뒤 공개 시각이 지나는 경합).
 * - `observe`(상태 맞추기, §8.6)는 `is_active`·`valid_from`·`valid_until`을 읽는다: 공개는 활성이고 공개 시각이 지났을 때(공개 시각이 없으면 이미 공개), 종료는 종료 시각이 있고 지금이 그 뒤일 때다.
 *   비활성은 `inactive`로만 알린다(밖에서 비활성이 돼도 상태는 유지하고 기록만 한다, ⑦-a 사용자 결정). 카드 `observe`와 같은 선례다.
 */
import { toCollectionLaunchRegisterInput, withoutLinkedFields } from '@/lib/admin/opsInbox/registerInput'
import type { CollectionLaunchRegisterPayload, RegisterInputIssue } from '@/lib/admin/opsInbox/registerInput'
import { runCollectionDbChecks } from '@/lib/admin/registerChecks/collection'
import { findItemBookUndoReferences } from '@/lib/admin/registerChecks/references'
import type { RegisterCheck } from '@/lib/admin/registerChecks/shared'
import { endError, endNotPublished, endResourceNow } from './endColumn'
import { RESOURCE_KEY_BY_KIND, asRegisterChecksClient } from './handlers'
import type { CancelResult, EndResult, ExecuteFailure, ExecuteHandler, ExecuteOutcome, ExecutePrepared, ExecuteServiceClient, ResourceObservation } from './handlers'

/** 응답·결정 기록·슬랙에 나가는 사유(티켓 20261004_2039 가정 8). */
export const COLLECTION_LAUNCH_MESSAGES = {
  formatInvalid: '컬렉션 형식이 맞지 않아요',
  duplicate: '같은 이름의 컬렉션이 이미 있어요',
  tribeMissing: '트라이브를 찾을 수 없어요',
  rewardBadgeMissing: '보상으로 정한 배지가 없거나 삭제됐어요',
  rewardBadgeKind: '완성 보상 배지는 활동 배지여야 해요',
  checkReadFailed: '등록 전 확인 중 DB를 읽지 못했어요',
  checkFailed: '등록 전 확인을 통과하지 못했어요',
  createFailed: '컬렉션을 만들지 못했어요',
  undoBlocked: '아이템 배지나 유저 기록·연결이 있거나 확인하지 못해 컬렉션을 지우지 않았어요',
  undoFailed: '컬렉션을 지우지 못했어요',
  // 취소. 참조 확인과 지우기 실패 문장은 되돌림과 같은 것을 쓴다.
  cancelPublished: '공개 시각이 지나 취소할 수 없어요',
} as const

/** 읽은 컬렉션 행의 시각이 시각으로 읽히지 않을 때(상태 맞추기). 사유가 아니라 서버 로그용이다. */
const OBSERVE_BAD_TIME = '컬렉션 시각을 읽을 수 없어요'

/** 등록 전 DB 검사의 라벨(`registerChecks/collection.ts`) → 사유. */
const REASON_BY_CHECK_LABEL: Readonly<Record<string, string>> = {
  '이름 중복': COLLECTION_LAUNCH_MESSAGES.duplicate,
  '트라이브 존재': COLLECTION_LAUNCH_MESSAGES.tribeMissing,
  '보상 배지 존재': COLLECTION_LAUNCH_MESSAGES.rewardBadgeMissing,
  '보상 배지 종류': COLLECTION_LAUNCH_MESSAGES.rewardBadgeKind,
}

/** DB를 읽지 못했을 때 검사가 남기는 실패 문장의 앞부분(`registerChecks/shared.ts`·`collection.ts`). */
const DB_READ_FAILED_PREFIX = 'DB 조회에 실패했어요'

/** 취소·상태 맞추기가 다시 읽는 칸. 공개 판정에 필요한 것뿐이다. */
const READ_COLUMNS = 'id, is_active, valid_from, valid_until'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 처음 실패한 검사의 사유. DB를 읽지 못한 실패는 라벨보다 먼저 본다. */
function reasonOfCheck(check: RegisterCheck | undefined): string {
  if (!check) return COLLECTION_LAUNCH_MESSAGES.checkFailed
  if (check.detail.startsWith(DB_READ_FAILED_PREFIX)) return COLLECTION_LAUNCH_MESSAGES.checkReadFailed
  return REASON_BY_CHECK_LABEL[check.label] ?? COLLECTION_LAUNCH_MESSAGES.checkFailed
}

/** 변환 오류들을 형식 오류 사유로 바꾼다: 첫 문장과 「 (외 N건)」. 오류가 없으면 일반 문장이다. */
function formatFailure(issues: readonly RegisterInputIssue[]): ExecuteFailure {
  const [first, ...rest] = issues
  const more = rest.length > 0 ? ` (외 ${rest.length}건)` : ''
  const reason = first ? `${COLLECTION_LAUNCH_MESSAGES.formatInvalid}: ${first.message}${more}` : COLLECTION_LAUNCH_MESSAGES.formatInvalid
  return { reason, detail: issues.map((issue) => `${issue.path} ${issue.message}`).join(' / ') }
}

export const COLLECTION_LAUNCH_HANDLER: ExecuteHandler<CollectionLaunchRegisterPayload> = {
  kind: 'collection_launch',
  resourceKey: RESOURCE_KEY_BY_KIND.collection_launch,
  idFirst: true,

  prepare(item, { id, linkedIds }): ExecuteOutcome<ExecutePrepared<CollectionLaunchRegisterPayload>> {
    // 정한 ID는 변환이 아니라 `create`가 더한다(`{ id, ...payload }`). `prepared.id`가 그 값이다.
    const result = toCollectionLaunchRegisterInput(item, { linkedIds })
    if (result.payload === null || result.errors.length > 0) return { ok: false, failure: formatFailure(result.errors) }
    return {
      ok: true,
      value: { item, id, payload: result.payload, linkFields: result.linkFields, linkedIds, warnings: result.warnings },
    }
  },

  async check(client, prepared): Promise<ExecuteFailure | null> {
    // 연결로 채운 보상 배지는 같은 실행에서 만들 ID라 존재 확인에서 뺀다(생성 순서가 존재를 보장한다).
    const { name, tribe_id, reward_badge_id } = withoutLinkedFields(prepared.payload, prepared.linkFields, prepared.linkedIds)
    const result = await runCollectionDbChecks({ supabase: client, collection: { name, tribe_id, reward_badge_id } })
    if (result.errors.length === 0) return null
    return { reason: reasonOfCheck(result.checks.find((check) => check.status === '실패')), detail: result.errors.join(' / ') }
  },

  async create(service: ExecuteServiceClient, prepared): Promise<ExecuteOutcome<{ id: string }>> {
    const inserted = await service.from('item_books').insert({ id: prepared.id, ...prepared.payload })
    if (!inserted.error) return { ok: true, value: { id: prepared.id } }

    // 오류 응답인데 행이 생긴 경우에 대비해 같은 ID로 한 번 지운다. 결과는 detail에만 적는다.
    let cleanup: string
    try {
      const removed = await service.from('item_books').delete().eq('id', prepared.id)
      cleanup = removed.error ? `정리 delete 실패: ${removed.error.message}` : '정리 delete 시도'
    } catch (err) {
      cleanup = `정리 delete 예외: ${messageOf(err)}`
    }
    return { ok: false, failure: { reason: COLLECTION_LAUNCH_MESSAGES.createFailed, detail: `insert 실패: ${inserted.error.message} / ${cleanup}` } }
  },

  async undo(service: ExecuteServiceClient, resourceId): Promise<ExecuteFailure | null> {
    try {
      await findItemBookUndoReferences(asRegisterChecksClient(service), resourceId)
    } catch (err) {
      return { reason: COLLECTION_LAUNCH_MESSAGES.undoBlocked, detail: messageOf(err) }
    }
    const removed = await service.from('item_books').delete().eq('id', resourceId)
    if (removed.error) return { reason: COLLECTION_LAUNCH_MESSAGES.undoFailed, detail: removed.error.message }
    return null
  },

  async cancel(service: ExecuteServiceClient, resourceId, { now }): Promise<CancelResult> {
    const failed = (detail: string): CancelResult => ({ ok: false, code: 'error', failure: { reason: COLLECTION_LAUNCH_MESSAGES.undoFailed, detail } })
    const published: CancelResult = { ok: false, code: 'published', failure: { reason: COLLECTION_LAUNCH_MESSAGES.cancelPublished } }

    const read = await service.from('item_books').select(READ_COLUMNS).eq('id', resourceId).maybeSingle()
    if (read.error) return failed(`컬렉션 조회 실패: ${read.error.message}`)
    if (!read.data) return { ok: true, missing: true }
    // 공개 시각이 없거나 읽을 수 없거나 지금 이전(정확히 지금 포함)이면 공개된 것으로 본다. 모르면 지우지 않는다.
    const fromMs = read.data.valid_from === null ? NaN : Date.parse(read.data.valid_from)
    if (!(fromMs > now.getTime())) return published

    try {
      await findItemBookUndoReferences(asRegisterChecksClient(service), resourceId)
    } catch (err) {
      return { ok: false, code: 'referenced', failure: { reason: COLLECTION_LAUNCH_MESSAGES.undoBlocked, detail: messageOf(err) } }
    }

    // 읽은 뒤 공개 시각이 지날 수 있어 지울 때도 같은 조건을 건다. 지운 행이 없으면 다시 읽어 공개됐는지, 그사이 없어졌는지 가른다.
    const removed = await service.from('item_books').delete().eq('id', resourceId).gt('valid_from', now.toISOString()).select('id')
    if (removed.error) return failed(`컬렉션 삭제 실패: ${removed.error.message}`)
    if (removed.data && removed.data.length > 0) return { ok: true, missing: false }

    const reread = await service.from('item_books').select('id').eq('id', resourceId).maybeSingle()
    if (reread.error) return failed(`삭제 뒤 컬렉션 재조회 실패: ${reread.error.message}`)
    return reread.data ? published : { ok: true, missing: true }
  },

  async end(service: ExecuteServiceClient, resourceId, { now }): Promise<EndResult> {
    const read = await service.from('item_books').select(READ_COLUMNS).eq('id', resourceId).maybeSingle()
    if (read.error) return endError(`컬렉션 조회 실패: ${read.error.message}`)
    if (!read.data) return { ok: true, state: 'missing' }

    // 공개 시각이 없으면 이미 공개, 종료 시각이 없으면 끝없다(`observe`와 같다). 값이 있는데 시각으로 읽히지 않으면 건드리지 않는다.
    const { valid_from: validFrom, valid_until: validUntil } = read.data
    const fromMs = validFrom === null ? null : Date.parse(validFrom)
    const untilMs = validUntil === null ? null : Date.parse(validUntil)
    if ((fromMs !== null && !Number.isFinite(fromMs)) || (untilMs !== null && !Number.isFinite(untilMs))) return endError(OBSERVE_BAD_TIME)
    if (untilMs !== null && now.getTime() > untilMs) return { ok: true, state: 'alreadyEnded' }
    if (fromMs !== null && fromMs > now.getTime()) return endNotPublished()
    return endResourceNow(service, { table: 'item_books', column: 'valid_until', resourceId, readValue: validUntil, now })
  },

  async observe(service: ExecuteServiceClient, resourceId, { now }): Promise<ResourceObservation> {
    const read = await service.from('item_books').select(READ_COLUMNS).eq('id', resourceId).maybeSingle()
    if (read.error) return { status: 'error', detail: `컬렉션 조회 실패: ${read.error.message}` }
    if (!read.data) return { status: 'missing' }

    // 공개 시각이 없으면 이미 공개, 종료 시각이 없으면 끝없다. 값이 있는데 시각으로 읽히지 않으면 읽지 못한 것이다.
    const { is_active: isActive, valid_from: validFrom, valid_until: validUntil } = read.data
    const fromMs = validFrom === null ? null : Date.parse(validFrom)
    const untilMs = validUntil === null ? null : Date.parse(validUntil)
    if ((fromMs !== null && !Number.isFinite(fromMs)) || (untilMs !== null && !Number.isFinite(untilMs))) return { status: 'error', detail: OBSERVE_BAD_TIME }

    const nowMs = now.getTime()
    const started = fromMs === null || fromMs <= nowMs
    const ended = untilMs !== null && nowMs > untilMs
    return {
      status: 'present',
      published: isActive && started && !ended,
      ended,
      startsAt: validFrom,
      endsAt: validUntil,
      inactive: !isActive,
    }
  },
}
