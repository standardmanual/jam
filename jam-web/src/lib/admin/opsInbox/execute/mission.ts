/**
 * 미션 핸들러 (티켓 20261002_1944, 상위 20260930_1500 ⑥). 규칙의 정본은 `docs/service/prd/ops-tool/PRD.md` §8.1·§8.2·§8.4다. 틀은 `homeFeedCard.ts`다.
 *
 * 승인된 `mission` 항목을 예약 등록 실행 때 `missions` 행(공개 전)으로 만든다. 변환은 `toMissionRegisterInput`(§8.4),
 * 등록 전 DB 검사는 `runMissionDbChecks`, 되돌림 전 참조 확인은 `findMissionUndoReferences`를 감싼다.
 *
 * 순수 모듈 계약: `node:`·Supabase·서버 모듈을 값으로 가져오지 않는다(타입은 `import type`). 요약창이 사전 점검을 거쳐 이 파일을 끌어온다.
 * 그래서 공개 판정은 순수 모듈 `lib/missions/visibility.ts`의 `isMissionExposed`를 쓰고, `lib/missions/checker.ts`(서비스 클라이언트를 값으로 가져온다)는 가져오지 않는다.
 * 응답·결정 기록·슬랙에 나가는 `reason`은 아래 고정 문장뿐이다. DB 오류 원문·기존 미션 ID·칼럼 이름은 `detail`(서버 로그)에만 둔다.
 * 단, 형식 오류는 변환 오류 문장(운영 항목에 붙은 오류)의 첫 문장을 그대로 싣는다.
 *
 * - `check`는 「제목 중복」을 기간이 겹칠 때만 건다(사용자 결정 2026-10-02, 등록 스크립트도 같은 규칙). 같은 실행에서 앞 그룹이 만든 미션은 DB에 이미 있어 이 검사가 잡는다.
 * - `create`는 정한 ID(`prepared.id`)로 만들고 같은 ID를 돌려준다(`idFirst`). 오류 응답이면 같은 ID로 정리 delete를 한 번 시도한다.
 * - `undo`는 사용자 데이터·연결 참조를 확인한 뒤 ID로 지운다. 등록 스크립트의 `undoMissionRegistration`은 `image_source` 조건이 있어 쓰지 않는다(운영툴 미션의 `image_source`는 null).
 * - `cancel`은 미션을 다시 읽어 공개됐으면 막고, 참조를 확인한 뒤, 지울 때도 `starts_at > now` 조건을 함께 건다(읽은 뒤 공개 시각이 지나는 경합). 카드 취소와 같은 흐름이다.
 * - `end`(티켓 20261006_0950, ⑪-a)는 게재 중인 미션을 지금 끝낸다: 미션을 다시 읽어 없으면 `missing`, `ends_at`이 지났으면 `alreadyEnded`, 시작 시각(`missionStartIso`)이 지금보다 뒤면
 *   `not_published`, 그 밖에는 `ends_at`을 지금으로 바꾼다(읽은 `ends_at`을 조건으로 건다). `ends_at`이 null인 상시 미션도 끝낸다(상시는 끝나지 않은 것이다).
 *   운영툴 밖에서 숨긴(`hidden`) 게재 중 미션도 끝낼 수 있다(티켓 20261006_1038 결정 1): 공개 판정(`isMissionExposed`)이 아니라 시작 시각으로 가른다. `observe`는 바꾸지 않는다.
 * - `observe`(상태 맞추기, §8.6)는 `exposure_mode`·`exposure_at`·`starts_at`·`ends_at`으로 유저 화면의 공개 판정(`isMissionExposed`)과 종료 여부를 돌려준다.
 *   `exposure_mode = 'hidden'`은 카드의 `is_active = false`와 같게 `inactive`로 알린다(밖에서 바뀜으로 기록만 하고 상태는 유지).
 */
import { toMissionRegisterInput, withoutLinkedFields } from '@/lib/admin/opsInbox/registerInput'
import type { MissionRegisterPayload } from '@/lib/admin/opsInbox/registerInput'
import { asRecord } from '@/lib/admin/opsInbox/itemView'
import { runMissionDbChecks } from '@/lib/admin/registerChecks/mission'
import { findMissionUndoReferences } from '@/lib/admin/registerChecks/references'
import type { RegisterCheck } from '@/lib/admin/registerChecks/shared'
import { isMissionExposed } from '@/lib/missions/visibility'
import type { MissionExposureMode } from '@/types/database'
import { endError, endNotPublished, endResourceNow } from './endColumn'
import { RESOURCE_KEY_BY_KIND, asRegisterChecksClient } from './handlers'
import type { CancelResult, EndResult, ExecuteFailure, ExecuteHandler, ExecuteOutcome, ExecutePrepared, ExecuteServiceClient, ResourceObservation } from './handlers'

/** 응답·결정 기록·슬랙에 나가는 사유(티켓 20261002_1944 가정 3). */
const MISSION_MESSAGES = {
  formatInvalid: '미션 형식이 맞지 않아요',
  duplicate: '같은 제목의 미션이 이미 있고 기간이 겹쳐요',
  rewardBadgeMissing: '보상으로 정한 배지가 없거나 삭제됐어요',
  conditionBadgeMissing: '달성 조건의 배지가 없거나 삭제됐어요',
  conditionPoiMissing: '달성 조건의 장소를 찾을 수 없어요',
  checkReadFailed: '등록 전 확인 중 DB를 읽지 못했어요',
  checkFailed: '등록 전 확인을 통과하지 못했어요',
  createFailed: '미션을 만들지 못했어요',
  undoBlocked: '참여 기록이나 연결이 있거나 확인하지 못해 미션을 지우지 않았어요',
  undoFailed: '미션을 지우지 못했어요',
  // 취소. 참조 확인과 지우기 실패 문장은 되돌림과 같은 것을 쓴다.
  cancelPublished: '공개 시각이 지나 취소할 수 없어요',
} as const

/** 읽은 미션 행의 시각이 시각으로 읽히지 않을 때(상태 맞추기). 사유가 아니라 서버 로그용이다. */
const OBSERVE_BAD_TIME = '미션 시각을 읽을 수 없어요'

/** 등록 전 DB 검사의 라벨(`registerChecks/mission.ts`) → 사유. */
const REASON_BY_CHECK_LABEL: Readonly<Record<string, string>> = {
  '제목 중복': MISSION_MESSAGES.duplicate,
  '보상 배지 존재': MISSION_MESSAGES.rewardBadgeMissing,
  '조건 배지 존재': MISSION_MESSAGES.conditionBadgeMissing,
  '조건 장소 존재': MISSION_MESSAGES.conditionPoiMissing,
}

/** DB를 읽지 못했을 때 검사가 남기는 실패 문장의 앞부분(`registerChecks/shared.ts`·`mission.ts`). */
const DB_READ_FAILED_PREFIX = 'DB 조회에 실패했어요'

/** 취소·상태 맞추기가 다시 읽는 칸. 공개 판정(`isMissionExposed`)과 종료 여부에 필요한 것뿐이다. */
const READ_COLUMNS = 'id, starts_at, ends_at, exposure_mode, exposure_at'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 처음 실패한 검사의 사유. DB를 읽지 못한 실패는 라벨보다 먼저 본다. */
function reasonOfCheck(check: RegisterCheck | undefined): string {
  if (!check) return MISSION_MESSAGES.checkFailed
  if (check.detail.startsWith(DB_READ_FAILED_PREFIX)) return MISSION_MESSAGES.checkReadFailed
  return REASON_BY_CHECK_LABEL[check.label] ?? MISSION_MESSAGES.checkFailed
}

/** 읽은 행을 공개 판정이 받는 모양으로 좁힌다. DB의 `exposure_mode`는 문자열로 읽힌다. */
function exposureOf(row: { starts_at: string; exposure_mode: string; exposure_at: string | null }) {
  return { starts_at: row.starts_at, exposure_mode: row.exposure_mode as MissionExposureMode, exposure_at: row.exposure_at }
}

/**
 * 미션의 시작 시각. 노출일 지정(`scheduled`)이고 `exposure_at`이 있으면 `exposure_at`, 그 밖(`start_date`·`hidden`·null)은 `starts_at`이다.
 * 종료(`end`)가 「아직 공개 전」을 가르는 데 쓴다. 숨김 여부는 보지 않는다.
 */
function missionStartIso(row: { starts_at: string; exposure_mode: string; exposure_at: string | null }): string {
  return row.exposure_mode === 'scheduled' && row.exposure_at ? row.exposure_at : row.starts_at
}

export const MISSION_HANDLER: ExecuteHandler<MissionRegisterPayload> = {
  kind: 'mission',
  resourceKey: RESOURCE_KEY_BY_KIND.mission,
  idFirst: true,

  prepare(item, { id, linkedIds }): ExecuteOutcome<ExecutePrepared<MissionRegisterPayload>> {
    const result = toMissionRegisterInput(item, { id, linkedIds })
    if (result.payload === null || result.errors.length > 0) {
      const [first, ...rest] = result.errors
      const more = rest.length > 0 ? ` (외 ${rest.length}건)` : ''
      const reason = first ? `${MISSION_MESSAGES.formatInvalid}: ${first.message}${more}` : MISSION_MESSAGES.formatInvalid
      return { ok: false, failure: { reason, detail: result.errors.map((issue) => `${issue.path} ${issue.message}`).join(' / ') } }
    }
    return {
      ok: true,
      value: { item, id, payload: result.payload, linkFields: result.linkFields, linkedIds, warnings: result.warnings },
    }
  },

  async check(client, prepared): Promise<ExecuteFailure | null> {
    // 연결로 채운 보상 배지는 같은 실행에서 만들 ID라 존재 확인에서 뺀다(생성 순서가 존재를 보장한다).
    const { title, mission_type, condition_json, reward_badge_ids, starts_at, ends_at } = withoutLinkedFields(
      prepared.payload,
      prepared.linkFields,
      prepared.linkedIds
    )
    const result = await runMissionDbChecks({
      supabase: client,
      mission: { title, mission_type, condition_json: asRecord(condition_json), reward_badge_ids, starts_at, ends_at },
    })
    if (result.errors.length === 0) return null
    return { reason: reasonOfCheck(result.checks.find((check) => check.status === '실패')), detail: result.errors.join(' / ') }
  },

  async create(service: ExecuteServiceClient, prepared): Promise<ExecuteOutcome<{ id: string }>> {
    const inserted = await service.from('missions').insert(prepared.payload)
    if (!inserted.error) return { ok: true, value: { id: prepared.id } }

    // 오류 응답인데 행이 생긴 경우에 대비해 같은 ID로 한 번 지운다. 결과는 detail에만 적는다.
    let cleanup: string
    try {
      const removed = await service.from('missions').delete().eq('id', prepared.id)
      cleanup = removed.error ? `정리 delete 실패: ${removed.error.message}` : '정리 delete 시도'
    } catch (err) {
      cleanup = `정리 delete 예외: ${messageOf(err)}`
    }
    return { ok: false, failure: { reason: MISSION_MESSAGES.createFailed, detail: `insert 실패: ${inserted.error.message} / ${cleanup}` } }
  },

  async undo(service: ExecuteServiceClient, resourceId): Promise<ExecuteFailure | null> {
    try {
      await findMissionUndoReferences(asRegisterChecksClient(service), resourceId)
    } catch (err) {
      return { reason: MISSION_MESSAGES.undoBlocked, detail: messageOf(err) }
    }
    const removed = await service.from('missions').delete().eq('id', resourceId)
    if (removed.error) return { reason: MISSION_MESSAGES.undoFailed, detail: removed.error.message }
    return null
  },

  async cancel(service: ExecuteServiceClient, resourceId, { now }): Promise<CancelResult> {
    const failed = (detail: string): CancelResult => ({ ok: false, code: 'error', failure: { reason: MISSION_MESSAGES.undoFailed, detail } })
    const published: CancelResult = { ok: false, code: 'published', failure: { reason: MISSION_MESSAGES.cancelPublished } }

    const read = await service.from('missions').select(READ_COLUMNS).eq('id', resourceId).maybeSingle()
    if (read.error) return failed(`미션 조회 실패: ${read.error.message}`)
    if (!read.data) return { ok: true, missing: true }
    if (isMissionExposed(exposureOf(read.data), now)) return published

    try {
      await findMissionUndoReferences(asRegisterChecksClient(service), resourceId)
    } catch (err) {
      return { ok: false, code: 'referenced', failure: { reason: MISSION_MESSAGES.undoBlocked, detail: messageOf(err) } }
    }

    // 읽은 뒤 공개 시각이 지날 수 있어 지울 때도 같은 조건을 건다. 지운 행이 없으면 다시 읽어 공개됐는지, 그사이 없어졌는지 가른다.
    const removed = await service.from('missions').delete().eq('id', resourceId).gt('starts_at', now.toISOString()).select('id')
    if (removed.error) return failed(`미션 삭제 실패: ${removed.error.message}`)
    if (removed.data && removed.data.length > 0) return { ok: true, missing: false }

    const reread = await service.from('missions').select('id').eq('id', resourceId).maybeSingle()
    if (reread.error) return failed(`삭제 뒤 미션 재조회 실패: ${reread.error.message}`)
    return reread.data ? published : { ok: true, missing: true }
  },

  async end(service: ExecuteServiceClient, resourceId, { now }): Promise<EndResult> {
    const read = await service.from('missions').select(READ_COLUMNS).eq('id', resourceId).maybeSingle()
    if (read.error) return endError(`미션 조회 실패: ${read.error.message}`)
    if (!read.data) return { ok: true, state: 'missing' }

    const row = read.data
    const endsMs = row.ends_at === null ? null : Date.parse(row.ends_at)
    const startMs = Date.parse(missionStartIso(row))
    if (!Number.isFinite(Date.parse(row.starts_at)) || !Number.isFinite(startMs) || (endsMs !== null && !Number.isFinite(endsMs))) return endError(OBSERVE_BAD_TIME)
    if (endsMs !== null && now.getTime() > endsMs) return { ok: true, state: 'alreadyEnded' }
    // 「아직 공개 전」은 시작 시각으로만 가른다. `isMissionExposed`는 운영툴 밖에서 숨긴 게재 중 미션(`hidden`)도 거짓이라 쓰지 않는다.
    // 운영툴 밖에서 꺼진 카드(`is_active = false`)를 끝낼 수 있는 것과 같게 한다(티켓 20261006_1038 결정 1).
    if (startMs > now.getTime()) return endNotPublished()
    return endResourceNow(service, { table: 'missions', column: 'ends_at', resourceId, readValue: row.ends_at, now })
  },

  async observe(service: ExecuteServiceClient, resourceId, { now }): Promise<ResourceObservation> {
    const read = await service.from('missions').select(READ_COLUMNS).eq('id', resourceId).maybeSingle()
    if (read.error) return { status: 'error', detail: `미션 조회 실패: ${read.error.message}` }
    if (!read.data) return { status: 'missing' }

    const row = read.data
    // 노출일 지정(`scheduled`)이면 공개 시각은 `exposure_at`이고, 그 밖에는 `starts_at`이다. 종료 시각이 없으면 상시다.
    const startsAt = row.exposure_mode === 'scheduled' ? row.exposure_at : row.starts_at
    const endsMs = row.ends_at === null ? null : Date.parse(row.ends_at)
    if (!Number.isFinite(Date.parse(row.starts_at)) || (startsAt !== null && !Number.isFinite(Date.parse(startsAt))) || (endsMs !== null && !Number.isFinite(endsMs))) {
      return { status: 'error', detail: OBSERVE_BAD_TIME }
    }

    const ended = endsMs !== null && now.getTime() > endsMs
    return {
      status: 'present',
      published: isMissionExposed(exposureOf(row), now) && !ended,
      ended,
      startsAt,
      endsAt: row.ends_at,
      inactive: row.exposure_mode === 'hidden',
    }
  },
}
