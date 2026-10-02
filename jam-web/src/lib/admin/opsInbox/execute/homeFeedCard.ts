/**
 * 홈피드 카드 핸들러 (티켓 20261002_1255, 상위 20260930_1500 ④-a). 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8.1·§8.2·§8.4다.
 *
 * 승인된 `home_feed_card` 항목을 예약 등록 실행 때 `today_cards` 행(공개 전)으로 만든다. 변환은 `toTodayCardRegisterInput`(§8.4),
 * 등록 전 DB 검사는 `runHomeFeedDbChecks`, 되돌림 전 참조 확인은 `findHomeFeedUndoReferences`를 감싼다.
 *
 * 순수 모듈 계약: `node:`·Supabase·서버 모듈을 값으로 가져오지 않는다(타입은 `import type`). 요약창이 사전 점검을 거쳐 이 파일을 끌어온다.
 * 응답·결정 기록·슬랙에 나가는 `reason`은 아래 고정 문장뿐이다. DB 오류 원문·기존 카드 ID·칼럼 이름은 `detail`(서버 로그)에만 둔다.
 * 단, 형식 오류는 변환 오류 문장(운영 항목에 붙은 오류)의 첫 문장을 그대로 싣는다.
 *
 * - `create`는 정한 ID(`prepared.id`)로 만들고 같은 ID를 돌려준다(`idFirst`). 실행 뼈대는 돌려준 ID가 정한 ID와 같으면 `created_resource`를 다시 쓰지 않는다.
 * - `undo`는 노출·열람 기록을 확인한 뒤 ID로 지운다. 공개 전 여부 확인은 취소(④-b)가 하고, 되돌림은 방금 만든 카드만 지운다.
 */
import { toTodayCardRegisterInput, withoutLinkedFields } from '@/lib/admin/opsInbox/registerInput'
import type { TodayCardRegisterPayload } from '@/lib/admin/opsInbox/registerInput'
import { runHomeFeedDbChecks } from '@/lib/admin/registerChecks/homeFeed'
import { findHomeFeedUndoReferences } from '@/lib/admin/registerChecks/references'
import type { RegisterCheck } from '@/lib/admin/registerChecks/shared'
import { RESOURCE_KEY_BY_KIND, asRegisterChecksClient } from './handlers'
import type { ExecuteFailure, ExecuteHandler, ExecuteOutcome, ExecutePrepared, ExecuteServiceClient } from './handlers'

/** 응답·결정 기록·슬랙에 나가는 사유(티켓 20261002_1255 가정 3). */
const HOME_FEED_CARD_MESSAGES = {
  formatInvalid: '카드 형식이 맞지 않아요',
  duplicate: '같은 제목·같은 공개 시각의 카드가 이미 있어요',
  missionMissing: '연결한 미션을 찾을 수 없어요',
  collectionMissing: '연결한 컬렉션을 찾을 수 없어요',
  badgeMissing: '연결한 배지가 없거나 삭제됐어요',
  rankingModeMissing: '연결한 랭킹 모드를 찾을 수 없어요',
  checkReadFailed: '등록 전 확인 중 DB를 읽지 못했어요',
  checkFailed: '등록 전 확인을 통과하지 못했어요',
  createFailed: '카드를 만들지 못했어요',
  undoBlocked: '노출 기록이 있거나 확인하지 못해 카드를 지우지 않았어요',
  undoFailed: '카드를 지우지 못했어요',
} as const

/** 등록 전 DB 검사의 라벨(`registerChecks/homeFeed.ts`) → 사유. */
const REASON_BY_CHECK_LABEL: Readonly<Record<string, string>> = {
  '제목·시작 일시 중복': HOME_FEED_CARD_MESSAGES.duplicate,
  '미션 존재': HOME_FEED_CARD_MESSAGES.missionMissing,
  '컬렉션 존재': HOME_FEED_CARD_MESSAGES.collectionMissing,
  '배지 존재': HOME_FEED_CARD_MESSAGES.badgeMissing,
  '랭킹 모드 존재': HOME_FEED_CARD_MESSAGES.rankingModeMissing,
}

/** DB를 읽지 못했을 때 검사가 남기는 실패 문장의 앞부분(`registerChecks/shared.ts`·`homeFeed.ts`). */
const DB_READ_FAILED_PREFIX = 'DB 조회에 실패했어요'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 처음 실패한 검사의 사유. DB를 읽지 못한 실패는 라벨보다 먼저 본다. */
function reasonOfCheck(check: RegisterCheck | undefined): string {
  if (!check) return HOME_FEED_CARD_MESSAGES.checkFailed
  if (check.detail.startsWith(DB_READ_FAILED_PREFIX)) return HOME_FEED_CARD_MESSAGES.checkReadFailed
  return REASON_BY_CHECK_LABEL[check.label] ?? HOME_FEED_CARD_MESSAGES.checkFailed
}

export const HOME_FEED_CARD_HANDLER: ExecuteHandler<TodayCardRegisterPayload> = {
  kind: 'home_feed_card',
  resourceKey: RESOURCE_KEY_BY_KIND.home_feed_card,
  idFirst: true,

  prepare(item, { id, actorId, linkedIds }): ExecuteOutcome<ExecutePrepared<TodayCardRegisterPayload>> {
    const result = toTodayCardRegisterInput(item, { id, actorId, linkedIds })
    if (result.payload === null || result.errors.length > 0) {
      const [first, ...rest] = result.errors
      const more = rest.length > 0 ? ` (외 ${rest.length}건)` : ''
      const reason = first ? `${HOME_FEED_CARD_MESSAGES.formatInvalid}: ${first.message}${more}` : HOME_FEED_CARD_MESSAGES.formatInvalid
      return { ok: false, failure: { reason, detail: result.errors.map((issue) => `${issue.path} ${issue.message}`).join(' / ') } }
    }
    return {
      ok: true,
      value: { item, id, payload: result.payload, linkFields: result.linkFields, linkedIds, warnings: result.warnings },
    }
  },

  async check(client, prepared): Promise<ExecuteFailure | null> {
    // 연결로 채운 칸은 같은 실행에서 만들 ID라 존재 확인에서 뺀다(생성 순서가 존재를 보장한다).
    const { title, starts_at, mission_id, item_book_id, badge_ids, ranking_mode_id } = withoutLinkedFields(
      prepared.payload,
      prepared.linkFields,
      prepared.linkedIds
    )
    const result = await runHomeFeedDbChecks({ supabase: client, payload: { title, starts_at, mission_id, item_book_id, badge_ids, ranking_mode_id } })
    if (result.errors.length === 0) return null
    return { reason: reasonOfCheck(result.checks.find((check) => check.status === '실패')), detail: result.errors.join(' / ') }
  },

  async create(service: ExecuteServiceClient, prepared): Promise<ExecuteOutcome<{ id: string }>> {
    const inserted = await service.from('today_cards').insert(prepared.payload)
    if (!inserted.error) return { ok: true, value: { id: prepared.id } }

    // 오류 응답인데 행이 생긴 경우에 대비해 같은 ID로 한 번 지운다. 결과는 detail에만 적는다.
    let cleanup: string
    try {
      const removed = await service.from('today_cards').delete().eq('id', prepared.id)
      cleanup = removed.error ? `정리 delete 실패: ${removed.error.message}` : '정리 delete 시도'
    } catch (err) {
      cleanup = `정리 delete 예외: ${messageOf(err)}`
    }
    return { ok: false, failure: { reason: HOME_FEED_CARD_MESSAGES.createFailed, detail: `insert 실패: ${inserted.error.message} / ${cleanup}` } }
  },

  async undo(service: ExecuteServiceClient, resourceId): Promise<ExecuteFailure | null> {
    try {
      await findHomeFeedUndoReferences(asRegisterChecksClient(service), resourceId)
    } catch (err) {
      return { reason: HOME_FEED_CARD_MESSAGES.undoBlocked, detail: messageOf(err) }
    }
    const removed = await service.from('today_cards').delete().eq('id', resourceId)
    if (removed.error) return { reason: HOME_FEED_CARD_MESSAGES.undoFailed, detail: removed.error.message }
    return null
  },
}
