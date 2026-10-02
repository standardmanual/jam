/**
 * 드랍 예약 핸들러 (티켓 20261002_2306, 상위 20260930_1500 ⑧-b). 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8.1·§8.2·§8.4·§8.5·§8.6·§8.7이다. 틀은 `recipe.ts`다.
 *
 * 승인된 `drop_schedule` 항목을 예약 등록 실행 때 `ambient_drop_schedules` 행(`scheduled`)으로 만든다. 놓는 일은 이 파일이 하지 않는다 — 예정 시각에 드랍 실행기가 놓는다.
 * 변환은 `toDropScheduleRegisterInput`(§8.4)과 `parseAmbientDropScheduleInput`, 만들기·공개 전 취소·상태 읽기는 드랍 서버 함수
 * (`createAmbientDropSchedule`·`cancelScheduledAmbientDrop`·`getAmbientDropSchedule`), 등록 전 대상 판정은 `loadScheduleTargets`를 감싼다.
 *
 * 순수 모듈 계약: `node:`·Supabase·서버 모듈을 값으로 가져오지 않는다(타입은 `import type`). 요약창이 사전 점검을 거쳐 이 파일을 끌어온다.
 * 드랍 서버 함수는 서비스 클라이언트를 인자로 받고, 페이징 도우미를 순수 파일(`lib/db/fetchAllRows.ts`)에서 가져와 값 import에 서버 모듈이 없다(티켓 20261002_2306 가정 1).
 * 응답·결정 기록·슬랙에 나가는 `reason`은 아래 고정 문장과, 드랍 파서·대상 판정이 돌려주는 쉬운 문장(`parseAmbientDropScheduleInput`·`describeScheduleTargetProblems`)뿐이다.
 * DB 오류 원문·예약·지점·배지·컬렉션 ID·칼럼 이름은 `detail`(서버 로그)에만 둔다. 단, 형식 오류는 변환·파서 오류 문장을 그대로 싣는다.
 *
 * - `prepare`는 변환 뒤 `parseAmbientDropScheduleInput(payload, now)`로 형식(지점·아이템 방식, 개수, 정시이고 미래인 공개 시각)을 본다. 현재 시각은 실행이 넘긴다(`now`). `created_by`는 실행한 관리자 ID다(카드와 같다).
 * - `check`는 지점 종류 확인 → 예정 시각 기준 대상 판정(`loadScheduleTargets` → `describeScheduleTargetProblems`) 순서다. 읽지 못하면 실패다. 같은 묶음의 컬렉션 항목이 만들 컬렉션은 아직 DB에 없어 걸린다(컬렉션 핸들러 ⑩이 다룬다).
 * - `create`는 정한 ID(`prepared.id`)로 만들고 같은 ID를 돌려준다(`idFirst`). 서버 오류(500)면 같은 ID로 정리 delete(`status = 'scheduled'` 조건)를 한 번 시도한다.
 * - `undo`는 방금 만든 예약이라 기록 없이 `status = 'scheduled'` 조건으로 지운다. 지운 행이 없을 때 이미 실행이 시작·끝났으면 지우지 않고 실패다.
 * - `cancel`은 지우지 않고 서버 함수로 「취소」 상태를 남긴다. 서버 함수는 예정 시각이 지났는지 보지 않으므로 이 핸들러가 먼저 막는다. 서버 함수의 문장은 어드민 화면용이라 사유로 쓰지 않는다.
 * - `observe`(상태 맞추기, §8.6)는 파생 상태(`missed`·`stalled` 포함)로 나눈다: 놓음 → 종료, 놓지 못함(`skipped`·`failed`·`missed`) → 실패, 취소 → 없음, 그 밖 → 공개 전. 놓인 드랍은 내리지 않아 종료 시각과 `inactive`는 없다.
 */
import { toDropScheduleRegisterInput } from '@/lib/admin/opsInbox/registerInput'
import type { DropScheduleRegisterPayload, RegisterInputIssue } from '@/lib/admin/opsInbox/registerInput'
import { parseAmbientDropScheduleInput } from '@/lib/ambient-drop/scheduleSpec'
import { cancelScheduledAmbientDrop, createAmbientDropSchedule, getAmbientDropSchedule } from '@/lib/ambient-drop/scheduleStore'
import { describeScheduleTargetProblems, loadScheduleTargets } from '@/lib/ambient-drop/scheduleTargets'
import { SCHEDULE_STATE_LABEL } from '@/lib/ambient-drop/scheduleView'
import type { RegisterChecksClient } from '@/lib/admin/registerChecks/shared'
import { RESOURCE_KEY_BY_KIND } from './handlers'
import type { CancelResult, ExecuteFailure, ExecuteHandler, ExecuteOutcome, ExecutePrepared, ExecuteServiceClient, ResourceObservation } from './handlers'

/** `prepare`가 만든 값. 변환 결과(드랍 서버 함수 입력)에 예약을 등록한 관리자 ID를 더했다. 서버 함수는 모르는 키를 읽지 않는다. */
export type DropSchedulePayload = DropScheduleRegisterPayload & { created_by: string }

/** 응답·결정 기록·슬랙에 나가는 사유(티켓 20261002_2306 가정 3). */
const DROP_MESSAGES = {
  formatInvalid: '드랍 예약 형식이 맞지 않아요',
  poiCategoryNotFound: '지점 종류를 찾을 수 없어요',
  targetReadFailed: '드랍 대상을 확인하지 못했어요',
  createFailed: '드랍 예약을 만들지 못했어요',
  undoStarted: '이미 실행이 시작돼 드랍 예약을 지우지 않았어요',
  undoFailed: '드랍 예약을 지우지 못했어요',
  // 취소. 서버 오류 문장은 취소 실패 한 가지로 쓴다.
  cancelPublished: '공개 시각이 지나 취소할 수 없어요',
  cancelFailed: '드랍 예약을 취소하지 못했어요',
} as const

/** 읽은 예약의 예정 시각이 시각으로 읽히지 않을 때. 사유가 아니라 서버 로그용이다. */
const BAD_SCHEDULED_AT = '드랍 예약의 예정 시각을 읽을 수 없어요'

const TABLE = 'ambient_drop_schedules'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 등록 전 확인이 대상 판정(`loadScheduleTargets`)에 넘길 클라이언트. `check`가 받는 `RegisterChecksClient`는 실행 경로가 서비스 클라이언트를
 * `asRegisterChecksClient`로 좁혀 넘긴 것이라 실체가 같다. 서버 함수는 서비스 클라이언트 타입을 요구해서 되돌리는 이 캐스트를 한 곳에만 둔다(레시피 핸들러와 같다).
 */
function asServiceClient(client: RegisterChecksClient): ExecuteServiceClient {
  return client as unknown as ExecuteServiceClient
}

export const DROP_SCHEDULE_HANDLER: ExecuteHandler<DropSchedulePayload> = {
  kind: 'drop_schedule',
  resourceKey: RESOURCE_KEY_BY_KIND.drop_schedule,
  idFirst: true,

  prepare(item, { id, actorId, linkedIds, now }): ExecuteOutcome<ExecutePrepared<DropSchedulePayload>> {
    const result = toDropScheduleRegisterInput(item, { linkedIds })
    const issues: RegisterInputIssue[] = [...result.errors]
    // 변환이 통과한 뒤에야 형식 검사를 한다(변환 오류가 있으면 payload가 없다).
    if (result.payload !== null && issues.length === 0) {
      const parsed = parseAmbientDropScheduleInput(result.payload, now)
      if (!parsed.ok) issues.push({ path: 'drop_schedule', message: parsed.error })
    }
    if (result.payload === null || issues.length > 0) {
      const [first, ...rest] = issues
      const more = rest.length > 0 ? ` (외 ${rest.length}건)` : ''
      const reason = first ? `${DROP_MESSAGES.formatInvalid}: ${first.message}${more}` : DROP_MESSAGES.formatInvalid
      return { ok: false, failure: { reason, detail: issues.map((issue) => `${issue.path} ${issue.message}`).join(' / ') } }
    }
    return {
      ok: true,
      value: { item, id, payload: { ...result.payload, created_by: actorId }, linkFields: result.linkFields, linkedIds, warnings: result.warnings },
    }
  },

  async check(client, prepared, { now }): Promise<ExecuteFailure | null> {
    // `prepare`와 같은 `now`라 통과한 입력이 여기서 실패하지 않는다. 그래도 파서의 쉬운 문장을 그대로 돌려준다.
    const parsed = parseAmbientDropScheduleInput(prepared.payload, now)
    if (!parsed.ok) return { reason: parsed.error, detail: parsed.error }
    const { spec } = parsed
    const scheduledAt = parsed.scheduledAt as string // allowNow가 아니면 항상 값이 있다
    const service = asServiceClient(client)

    // 지점 종류. 종류가 없으면 놓을 지점도 없다. 읽지 못하면 통과시키지 않는다.
    if (spec.poiMode === 'category' && spec.poiCategory) {
      const read = await service.from('poi_categories').select('slug').eq('slug', spec.poiCategory).maybeSingle()
      if (read.error) return { reason: DROP_MESSAGES.targetReadFailed, detail: `지점 종류 확인 실패: ${read.error.message}` }
      if (!read.data) return { reason: DROP_MESSAGES.poiCategoryNotFound, detail: '지점 종류 행이 없어요' }
    }

    // 예정 시각 기준 대상 판정. 걸린 대상이 하나라도 있거나 놓을 대상이 없으면 그 문장이 사유다(쉬운 문장, ID 없음).
    try {
      const problem = describeScheduleTargetProblems(await loadScheduleTargets(service, spec, scheduledAt))
      return problem ? { reason: problem, detail: problem } : null
    } catch (err) {
      return { reason: DROP_MESSAGES.targetReadFailed, detail: `드랍 대상 확인 실패: ${messageOf(err)}` }
    }
  },

  async create(service: ExecuteServiceClient, prepared, { now }): Promise<ExecuteOutcome<{ id: string }>> {
    const { created_by: createdBy, ...input } = prepared.payload
    const created = await createAmbientDropSchedule(service, input, createdBy, now, { id: prepared.id })
    if (created.ok) return { ok: true, value: { id: prepared.id } }

    // 검증 오류(400)는 쉬운 문장이라 그대로 싣는다. 서버 오류(500)는 고정 문장이고 원문은 detail에만 둔다.
    if (created.status === 400) return { ok: false, failure: { reason: created.error, detail: created.error } }

    // 오류 응답인데 행이 생긴 경우에 대비해 같은 ID로 한 번 지운다. 이미 시작된 예약은 건드리지 않는다. 결과는 detail에만 적는다.
    let cleanup: string
    try {
      const removed = await service.from(TABLE).delete().eq('id', prepared.id).eq('status', 'scheduled')
      cleanup = removed.error ? `정리 delete 실패: ${removed.error.message}` : '정리 delete 시도'
    } catch (err) {
      cleanup = `정리 delete 예외: ${messageOf(err)}`
    }
    return { ok: false, failure: { reason: DROP_MESSAGES.createFailed, detail: `생성 실패: ${created.error} / ${cleanup}` } }
  },

  async undo(service: ExecuteServiceClient, resourceId): Promise<ExecuteFailure | null> {
    // 방금 만든 예약이라 기록 없이 지운다. 실행이 시작된 예약은 조건에 걸려 지워지지 않는다.
    const removed = await service.from(TABLE).delete().eq('id', resourceId).eq('status', 'scheduled').select('id')
    if (removed.error) return { reason: DROP_MESSAGES.undoFailed, detail: removed.error.message }
    if ((removed.data ?? []).length > 0) return null

    // 지운 행이 없다. 이미 없으면 성공이고, 실행이 시작됐거나 끝났으면 지우지 않은 것이다. 밖에서 취소된 예약은 놓이지 않으니 없는 것으로 본다(`cancel`·`observe`와 같다).
    const reread = await service.from(TABLE).select('id, status').eq('id', resourceId).maybeSingle()
    if (reread.error) return { reason: DROP_MESSAGES.undoFailed, detail: `지운 뒤 예약 재조회 실패: ${reread.error.message}` }
    if (!reread.data || reread.data.status === 'canceled') return null
    return { reason: DROP_MESSAGES.undoStarted, detail: `예약 상태가 ${reread.data.status}예요` }
  },

  async cancel(service: ExecuteServiceClient, resourceId, { now }): Promise<CancelResult> {
    const failed = (detail: string): CancelResult => ({ ok: false, code: 'error', failure: { reason: DROP_MESSAGES.cancelFailed, detail } })
    const published = (detail?: string): CancelResult => ({ ok: false, code: 'published', failure: { reason: DROP_MESSAGES.cancelPublished, ...(detail ? { detail } : {}) } })

    const read = await getAmbientDropSchedule(service, resourceId, now)
    if (!read.ok) return read.status === 404 ? { ok: true, missing: true } : failed(`드랍 예약 조회 실패: ${read.error}`)
    // 밖에서 이미 취소됐다. 없는 것과 같다.
    if (read.state === 'canceled') return { ok: true, missing: true }
    const scheduledMs = Date.parse(read.schedule.scheduled_at)
    if (!Number.isFinite(scheduledMs)) return failed(BAD_SCHEDULED_AT)
    // 실행이 시작됐거나 끝났거나 놓쳤으면 막는다. 서버 함수는 예정 시각이 지났는지 보지 않으므로 아직 `scheduled`인 예약도 시각이 지났으면 여기서 막는다.
    if (read.state !== 'scheduled' || scheduledMs <= now.getTime()) return published()

    // `status = 'scheduled'` 조건의 상태 변경은 서버 함수가 한다. 서버 함수의 문장은 어드민 화면용이라 상태 코드만 쓴다.
    const cancelled = await cancelScheduledAmbientDrop(service, resourceId, now)
    if (cancelled.ok) return { ok: true, missing: false }
    if (cancelled.status === 404) return { ok: true, missing: true }
    if (cancelled.status === 500) return failed(`드랍 예약 취소 실패: ${cancelled.error}`)

    // 409는 그사이 실행이 시작됐거나 밖에서 취소된 경우다. 다시 읽어 가른다.
    const reread = await getAmbientDropSchedule(service, resourceId, now)
    if (!reread.ok) return reread.status === 404 ? { ok: true, missing: true } : failed(`취소 뒤 드랍 예약 재조회 실패: ${reread.error}`)
    if (reread.state === 'canceled') return { ok: true, missing: true }
    return published(cancelled.error)
  },

  async observe(service: ExecuteServiceClient, resourceId, { now }): Promise<ResourceObservation> {
    const read = await getAmbientDropSchedule(service, resourceId, now)
    if (!read.ok) return read.status === 404 ? { status: 'missing' } : { status: 'error', detail: `드랍 예약 조회 실패: ${read.error}` }

    // 읽을 수 없는 시각은 상태 판정이 한쪽으로 기울어 닫히므로, 상태를 바꾸지 않도록 먼저 가른다.
    const { scheduled_at: startsAt } = read.schedule
    if (!Number.isFinite(Date.parse(startsAt))) return { status: 'error', detail: BAD_SCHEDULED_AT }

    switch (read.state) {
      case 'canceled':
        // 운영툴 밖에서 취소됐다. 자원이 없는 것과 같다.
        return { status: 'missing' }
      case 'done':
        // 놓았다. 놓인 드랍은 그대로 둔다. 종료 시각이 없어 이때가 끝이다.
        return { status: 'present', published: true, ended: true, startsAt, endsAt: null, inactive: false }
      case 'skipped':
      case 'failed':
      case 'missed':
        return { status: 'failed', reason: `드랍을 놓지 못했어요(${SCHEDULE_STATE_LABEL[read.state]})` }
      default:
        // `scheduled`·`running`·`stalled`. 게재중으로 넘기면 뒤의 실패가 무시되므로(`reconcile.ts`) 놓기 전까지는 공개 전이다.
        return { status: 'present', published: false, ended: false, startsAt, endsAt: null, inactive: false }
    }
  },
}
