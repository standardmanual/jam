/**
 * 예약 등록의 종류별 핸들러 계약 (티켓 20261002_1122, 상위 20260930_1500 ③-a). 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8이다.
 *
 * 이 파일은 타입과 공용 도우미만 둔다. DB를 부르지 않고, Supabase는 타입으로만 가져온다(값 import 없음). 실제 핸들러는
 * 종류마다 파일을 따로 두고(④ 카드는 `homeFeedCard.ts`) `registry.ts`의 `EXECUTE_HANDLERS`에 붙인다. 이 파일은 핸들러를 가져오지 않는다(순환 import 방지).
 * 레지스트리에 없는 종류는 사전 점검(`precheck.ts`)이 「아직 연결하지 않은 종류예요」로 막는다(예약 등록 대상 6종은 ⑩-a로 모두 붙었다. 분기는 가짜 레지스트리 테스트와 앞으로의 종류를 위해 남긴다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import type { OpsItemKind } from '@/lib/admin/opsInbox/constants'
import type { ViewableItem } from '@/lib/admin/opsInbox/itemView'
import type { CardLinkedIds, CollectionLaunchLinkedIds, JamBadgeLinkedIds, MissionLinkedIds, RegisterInputIssue } from '@/lib/admin/opsInbox/registerInput'
import type { RegisterChecksClient } from '@/lib/admin/registerChecks/shared'

/** 예약 등록이 읽는 항목 행(`ops_bundle_items`). 값 칸은 수정본이 있으면 수정본, 없으면 제출 원본이다(`ViewableItem`). */
export interface ExecuteItem extends ViewableItem {
  id: string
  bundle_id: string
  /** 제출 순서. 같은 종류끼리의 생성 순서다(§8.3). */
  position: number
  /** 제출자가 정한 값. 유일 제약이 없어 겹칠 수 있다. */
  item_key: string | null
  kind: string | null
  status: string
  starts_at: string | null
  ends_at: string | null
  pattern_no: string | null
  /** 만든 자원을 가리키는 키(§8.5). 아직 만들지 않았으면 `null`. */
  created_resource: Json | null
  /** 제출 때 남은 형식 오류. 사전 점검은 이 칸만으로 막지 않는다(§8.4 변환·검사가 걸러 낸다). */
  format_errors: Json
  updated_at: string
}

// ── 종류와 자원 키 ──────────────────────────────────────────────────────────────────────────────

/** `created_resource`의 키(§8.5 표). 키는 종류마다 하나이고 값은 UUID 문자열이다. 예약 등록 대상이 아닌 `pattern_proposal`은 없다. */
export const RESOURCE_KEY_BY_KIND = {
  home_feed_card: 'today_card_id',
  mission: 'mission_id',
  jam_badge: 'badge_id',
  collection_launch: 'item_book_id',
  recipe: 'recipe_id',
  drop_schedule: 'ambient_drop_schedule_id',
} as const satisfies Partial<Record<OpsItemKind, string>>

/** 예약 등록 대상인 종류 6개. */
export type ExecutableKind = keyof typeof RESOURCE_KEY_BY_KIND

export function isExecutableKind(kind: string | null | undefined): kind is ExecutableKind {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(RESOURCE_KEY_BY_KIND, kind)
}

// ── 핸들러 인터페이스 ───────────────────────────────────────────────────────────────────────────

/** 서버에서 쓰는 service-role 클라이언트. `create`·`undo`·`cancel`이 쓴다. */
export type ExecuteServiceClient = ReturnType<typeof createServiceClient>

/**
 * 실패 한 건. `reason`은 화면·결정 기록·슬랙에 그대로 나가는 쉬운 문장이고, `detail`은 서버 로그에만 남긴다(DB 오류 원문 등, 응답에 싣지 않는다).
 */
export interface ExecuteFailure {
  reason: string
  detail?: string
}

export type ExecuteOutcome<T> = { ok: true; value: T } | { ok: false; failure: ExecuteFailure }

/**
 * 공개 전 취소 한 건의 결과(티켓 20261002_1256, §8.7). `ok`면 자원이 이제 없다: `missing`은 지우기 전에 이미 없었다는 뜻이다(운영툴 밖에서 지워짐).
 * 실패의 `code`는 응답 상태를 가른다: `published`(공개 시각이 지났다)·`referenced`(노출 기록이 있거나 확인하지 못했다)는 409, `error`는 500이다.
 */
export type CancelResult =
  | { ok: true; missing: boolean }
  | { ok: false; code: 'published' | 'referenced' | 'error'; failure: ExecuteFailure }

/**
 * 공개 뒤 「지금 종료」 한 건의 결과(티켓 20261006_0950 ⑪-a 가정 8, §8.7). `ok`면 자원이 이제 끝나 있다:
 * `ended`는 이번에 종료 시각을 지금으로 바꿨다는 뜻이고, `alreadyEnded`는 종료 시각이 이미 지나 있어 자원을 건드리지 않았다는 뜻(상태 맞추기가 아직 돌지 않음),
 * `missing`은 자원이 없다는 뜻(행 없음·배지 `deleted_at`)이다. 셋 다 항목을 「종료」로 닫는 성공이다.
 * 실패의 `code`: `not_published`(자원이 아직 공개 전이라 끝낼 것이 없다)·`changed`(읽은 뒤 다른 곳이 종료 시각을 바꿨다)·`error`(읽기·쓰기 오류). `failure.detail`은 서버 로그에만 남긴다.
 */
export type EndResult =
  | { ok: true; state: 'ended' | 'alreadyEnded' | 'missing' }
  | { ok: false; code: 'not_published' | 'changed' | 'error'; failure: ExecuteFailure }

/**
 * 자원 상태 읽기 한 건의 결과(티켓 20261002_1813 가정 2, §8.6). 상태 맞추기가 항목 상태와 견준다.
 * - `missing`: 자원이 없다(드랍은 `canceled`도 여기. `dropSchedule.ts`가 돌려준다).
 * - `present`: 자원이 있다. `published`는 지금 유저 화면에 보이는지, `ended`는 자원의 종료 시각이 지났는지, `inactive`는 운영툴 밖에서 비활성·숨김이 됐는지다.
 *   `startsAt`·`endsAt`은 자원의 공개·종료 시각(ISO 문자열, 종료 시각이 없는 상시 자원은 `null`)이다.
 * - `failed`: 자원이 공개되지 못하고 끝났다(드랍의 `skipped`·`failed`·`missed`. `dropSchedule.ts`가 돌려준다). `reason`은 결정 기록·슬랙에 그대로 나가는 쉬운 문장이다.
 * - `error`: 읽지 못했다. 상태를 바꾸지 않고 `detail`은 서버 로그에만 남긴다.
 */
export type ResourceObservation =
  | { status: 'missing' }
  | { status: 'present'; published: boolean; ended: boolean; startsAt: string | null; endsAt: string | null; inactive: boolean }
  | { status: 'failed'; reason: string }
  | { status: 'error'; detail: string }

/**
 * 연결 그룹(§8.3)이 채우는 칸에 넣을 ID. 카드·미션·JAM! 배지·컬렉션 칸 이름은 `registerInput.ts`의 `CardLinkedIds`·`MissionLinkedIds`·`JamBadgeLinkedIds`·`CollectionLaunchLinkedIds`와 같다
 * (`recipe_id`는 JAM! 배지 변환 `toJamBadgeRegisterInput`이 `recipe_first_success`에 덮고, `reward_badge_id`는 컬렉션 변환 `toCollectionLaunchRegisterInput`이 읽는다).
 * `collection_ids`는 드랍 변환(`toDropScheduleRegisterInput`)이 읽는다.
 */
export type ExecuteLinkedIds = CardLinkedIds &
  MissionLinkedIds &
  JamBadgeLinkedIds &
  CollectionLaunchLinkedIds & {
    collection_ids?: readonly string[] | null
  }

/**
 * 이 항목을 연결 칸으로 가리키는 항목 하나(티켓 20261004_2039 가정 2). `kind`는 가리키는 항목의 종류, `field`는 가리키는 쪽이 채우는 칸(`LINK_PAIRS`의 `field`)이다.
 * 실행(`run.ts`)이 그룹의 `linkPlan`에서 계산해 `prepare`에 넘긴다. 가리키는 항목이 이번 실행의 예약할 항목일 때만 들어 있다. JAM! 배지 핸들러만 읽는다
 * (컬렉션 완성 보상 배지는 발급 조건이 없어도 통과한다). 다른 핸들러는 쓰지 않는다.
 */
export interface PointedByEntry {
  kind: string
  field: string
}

/** 등록 형식으로 바꾼 항목(§8.4). `payload`의 모양은 종류마다 다르다. */
export interface ExecutePrepared<P = unknown> {
  item: ExecuteItem
  /** 만들 자원의 ID. 모든 종류가 만들기 전에 이 ID를 `created_resource`에 적고 이 ID로 만든다(G3). 만든 직후 적는 `idFirst: false` 분기에서는 검증용으로 미리 정한 값이다. */
  id: string
  payload: P
  /** 연결로 채운 칸 이름. 등록 전 DB 검사에는 이 칸을 뺀 사본을 넘긴다(`withoutLinkedFields`). */
  linkFields: readonly string[]
  linkedIds: ExecuteLinkedIds
  warnings: readonly RegisterInputIssue[]
}

/**
 * 종류 하나의 핸들러. 메서드 문법으로 적어 종류마다 다른 `payload` 모양을 레지스트리에 함께 담을 수 있다.
 * 모든 실패는 던지지 않고 `ExecuteFailure`(취소는 `CancelResult`)로 돌려준다.
 */
export interface ExecuteHandler<P = unknown> {
  kind: ExecutableKind
  /** `created_resource`에 적는 키(§8.5). `RESOURCE_KEY_BY_KIND[kind]`와 같다. */
  resourceKey: (typeof RESOURCE_KEY_BY_KIND)[ExecutableKind]
  /**
   * 만들기 전에 ID를 정해 `created_resource`에 먼저 적는 종류인지. 모든 종류가 `true`다(§8.5). 만든 직후 적는 `false` 분기는 가짜 핸들러 테스트가 쓰므로 남긴다.
   * 만든 직후 적으면 적기 전에 요청이 끊길 때 상태 맞추기가 자원을 찾지 못한다.
   */
  idFirst: boolean
  /**
   * 항목을 등록 형식으로 바꾸고 형식을 검사한다(§8.4). DB에 접근하지 않는다. `now`는 이번 실행의 현재 시각이다(공개 시각이 지났는지 가르는 기준으로, 한 회차 안에서 같은 값).
   * 카드·미션 핸들러는 `now`를 쓰지 않는다(메서드 매개변수가 적으면 그대로 맞는다). `pointedBy`는 이 항목을 연결 칸으로 가리키는 항목의 종류·칸이다(없으면 가리키는 항목이 없다. JAM! 배지 핸들러만 읽는다).
   */
  prepare(
    item: ExecuteItem,
    context: { id: string; actorId: string; linkedIds: ExecuteLinkedIds; now: Date; pointedBy?: readonly PointedByEntry[] }
  ): ExecuteOutcome<ExecutePrepared<P>>
  /** 등록 전 DB 검사(참조 ID 존재·중복). 통과하면 `null`. `now`는 `prepare`와 같은 값이다. */
  check(client: RegisterChecksClient, prepared: ExecutePrepared<P>, context: { now: Date }): Promise<ExecuteFailure | null>
  /** 자원을 만들고 그 ID를 돌려준다. `now`는 `prepare`와 같은 값이다. */
  create(service: ExecuteServiceClient, prepared: ExecutePrepared<P>, context: { now: Date }): Promise<ExecuteOutcome<{ id: string }>>
  /** 이번 실행이 만든 자원을 지운다(지우기 전 참조 확인 포함). 지웠으면 `null`. */
  undo(service: ExecuteServiceClient, resourceId: string): Promise<ExecuteFailure | null>
  /**
   * 예약된 자원을 공개 전에 지운다(§8.7). `undo`와 달리 지우기 전에 자원을 다시 읽어 공개 시각이 지났는지 확인하고, 지울 때도 같은 조건을 건다.
   * 자원이 이미 없으면 성공(`missing: true`)이다. `now`는 공개 여부를 가르는 기준 시각이다.
   */
  cancel(service: ExecuteServiceClient, resourceId: string, context: { now: Date }): Promise<CancelResult>
  /**
   * 게재 중인 자원을 지금 끝낸다(티켓 20261006_0950 ⑪-a, §8.7). 자원을 다시 읽어 종료 시각이 이미 지났으면 건드리지 않고(`alreadyEnded`), 없으면 `missing`, 아직 공개 전이면 `not_published`이며,
   * 그 밖에는 종료 시각 칸을 `now`로 바꾼다. 쓸 때 읽은 값을 조건으로 걸어 읽은 뒤 바뀐 자원은 `changed`다(`endColumn.ts`). **선택 메서드다**: 없는 종류(드랍 예약)는 지금 종료가 없다.
   * 던지지 않고 `EndResult`로 돌려준다.
   */
  end?(service: ExecuteServiceClient, resourceId: string, context: { now: Date }): Promise<EndResult>
  /**
   * 자원의 지금 상태를 읽는다(상태 맞추기, §8.6). 쓰지 않는다. 읽지 못하면 던지지 않고 `error`를 돌려준다.
   * `now`는 공개·종료 여부를 가르는 기준 시각이다(한 회차 안에서 같은 값).
   */
  observe(service: ExecuteServiceClient, resourceId: string, context: { now: Date }): Promise<ResourceObservation>
}

/** 종류 → 핸들러. 없는 종류는 사전 점검이 막는다. */
export type ExecuteHandlerRegistry = { readonly [kind: string]: ExecuteHandler | undefined }

/**
 * service-role 클라이언트를 등록 전 DB 검사가 받는 최소 인터페이스로 좁힌다. 생성 타입 클라이언트를 그대로 넘기면
 * 구조 비교가 TS2589(타입 인스턴스화가 너무 깊음)를 내서, 이 캐스트를 한 곳에만 둔다
 * (선례: `app/api/admin/missions/bulk/route.ts`의 `as unknown as BulkServiceClient`).
 */
export function asRegisterChecksClient(service: ExecuteServiceClient): RegisterChecksClient {
  return service as unknown as RegisterChecksClient
}
