/**
 * 예약 등록의 종류별 핸들러 계약 (티켓 20261002_1122, 상위 20260930_1500 ③-a). 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8이다.
 *
 * 이 파일은 타입과 공용 도우미만 둔다. DB를 부르지 않고, Supabase는 타입으로만 가져온다(값 import 없음). 실제 핸들러는
 * 종류마다 파일을 따로 두고(④ 카드는 `homeFeedCard.ts`) `registry.ts`의 `EXECUTE_HANDLERS`에 붙인다. 이 파일은 핸들러를 가져오지 않는다(순환 import 방지).
 * 레지스트리에 없는 종류는 사전 점검(`precheck.ts`)이 「아직 연결하지 않은 종류예요」로 막는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import type { OpsItemKind } from '@/lib/admin/opsInbox/constants'
import type { ViewableItem } from '@/lib/admin/opsInbox/itemView'
import type { CardLinkedIds, MissionLinkedIds, RegisterInputIssue } from '@/lib/admin/opsInbox/registerInput'
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

/** 서버에서 쓰는 service-role 클라이언트. `create`·`undo`가 쓴다. */
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
 * 연결 그룹(§8.3)이 채우는 칸에 넣을 ID. 카드·미션 칸 이름은 `registerInput.ts`의 `CardLinkedIds`·`MissionLinkedIds`와 같다.
 * 나머지는 뒤 조각의 변환이 읽는다: `reward_badge_id`(컬렉션), `collection_ids`(드랍), `recipe_id`(JAM! 배지의 `recipe_first_success`).
 */
export type ExecuteLinkedIds = CardLinkedIds &
  MissionLinkedIds & {
    reward_badge_id?: string | null
    collection_ids?: readonly string[] | null
    recipe_id?: string | null
  }

/** 등록 형식으로 바꾼 항목(§8.4). `payload`의 모양은 종류마다 다르다. */
export interface ExecutePrepared<P = unknown> {
  item: ExecuteItem
  /** 만들 자원의 ID. `idFirst`가 아닌 종류는 검증용으로 미리 정한 값이다(G3). */
  id: string
  payload: P
  /** 연결로 채운 칸 이름. 등록 전 DB 검사에는 이 칸을 뺀 사본을 넘긴다(`withoutLinkedFields`). */
  linkFields: readonly string[]
  linkedIds: ExecuteLinkedIds
  warnings: readonly RegisterInputIssue[]
}

/**
 * 종류 하나의 핸들러. 메서드 문법으로 적어 종류마다 다른 `payload` 모양을 레지스트리에 함께 담을 수 있다.
 * 모든 실패는 던지지 않고 `ExecuteFailure`로 돌려준다.
 */
export interface ExecuteHandler<P = unknown> {
  kind: ExecutableKind
  /** `created_resource`에 적는 키(§8.5). `RESOURCE_KEY_BY_KIND[kind]`와 같다. */
  resourceKey: (typeof RESOURCE_KEY_BY_KIND)[ExecutableKind]
  /** 만들기 전에 ID를 정해 `created_resource`에 먼저 적는 종류인지(카드·미션·배지·컬렉션). 레시피·드랍은 서버 함수가 ID를 정한다(§8.5). */
  idFirst: boolean
  /** 항목을 등록 형식으로 바꾸고 형식을 검사한다(§8.4). DB에 접근하지 않는다. */
  prepare(item: ExecuteItem, context: { id: string; actorId: string; linkedIds: ExecuteLinkedIds }): ExecuteOutcome<ExecutePrepared<P>>
  /** 등록 전 DB 검사(참조 ID 존재·중복). 통과하면 `null`. */
  check(client: RegisterChecksClient, prepared: ExecutePrepared<P>): Promise<ExecuteFailure | null>
  /** 자원을 만들고 그 ID를 돌려준다. */
  create(service: ExecuteServiceClient, prepared: ExecutePrepared<P>): Promise<ExecuteOutcome<{ id: string }>>
  /** 이번 실행이 만든 자원을 지운다(지우기 전 참조 확인 포함). 지웠으면 `null`. */
  undo(service: ExecuteServiceClient, resourceId: string): Promise<ExecuteFailure | null>
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
