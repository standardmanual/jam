/**
 * 등록 되돌림(`--undo`) 전 참조 확인(티켓 20261002_0827) — `scripts/asset-generator/register{,Mission,HomeFeed}Flow.mjs`가
 * 각자 갖고 있던 «아직 아무 데도 쓰이지 않았는지» 목록과 읽기 반복문을 옮겼다. 목록·질의 모양·오류 문장은 그대로다.
 * 스크립트는 `UNDO_REFERENCE_TABLES`·`UNDO_ARRAY_REFERENCE_COLUMNS` 이름으로 이 목록을 다시 내보낸다.
 * 컬렉션(`ITEM_BOOK_UNDO_*`, `findItemBookUndoReferences`)은 운영툴 예약 등록의 컬렉션 핸들러가 쓰려고 더했다(티켓 20261004_2039). 스크립트는 쓰지 않는다.
 *
 * 어드민 배지 삭제의 `BADGE_REFERENCE_SOURCES`(`badge-references.ts`)는 같은 위치를 다른 질의 방식(`.in` 묶음·`.order().range()`)으로
 * 센다. 질의 방식과 반환 형식이 달라 이번에는 합치지 않았다.
 */
import type { RegisterChecksClient } from './shared'

/** 참조 위치 하나. `table.column`이 되돌릴 행의 id를 가리킨다. */
export interface UndoReferenceSpec {
  table: string
  column: string
}

export interface BadgeUndoReferenceSpec extends UndoReferenceSpec {
  effect: string
}

/**
 * 되돌림 전에 «이 배지가 아직 아무 데도 쓰이지 않았는지» 읽는 관계 표(티켓 20260925_0540). `badges`를 가리키는 외래 키
 * 10곳 전부다(운영 DB `pg_constraint` 조회 2026-09-25, 생성 타입 `database.generated.ts`와 테스트로 대조한다).
 * - 삭제 차단(NO ACTION, DB가 막아 주지만 --undo가 중간에 실패하면 저장소 파일과 행이 어긋날 수 있어 미리 읽는다):
 *   user_activity_badges · inventory_items · poi_drops · poi.linked_badge_id · point_transactions.source_badge_id
 * - 연쇄 삭제(CASCADE, 지우면 유저 기록이 경고 없이 함께 사라짐): user_checkin_badge_earns · user_item_book_slots
 * - 연결 해제(SET NULL, 조용히 연결이 끊김): item_books.reward_badge_id · item_books.required_activity_badge_id · missions.gated_badge_id
 * 조회는 각 표의 배지 id 컬럼으로 센다(표마다 `id` 컬럼 유무가 달라 컬럼을 그대로 쓴다).
 * 참조 표를 바꿀 때는 이 목록만 고친다 — 코드·SQL 기록 주석은 이 상수에서 나온다.
 * (`as const`를 쓰지 않는다: 스크립트 테스트가 `{ table: string; column: string }[]`로 단언한다.)
 */
export const BADGE_UNDO_REFERENCE_TABLES: BadgeUndoReferenceSpec[] = [
  { table: 'user_activity_badges', column: 'badge_id', effect: '삭제 차단' },
  { table: 'inventory_items', column: 'badge_id', effect: '삭제 차단' },
  { table: 'poi_drops', column: 'badge_id', effect: '삭제 차단' },
  { table: 'poi', column: 'linked_badge_id', effect: '삭제 차단' },
  { table: 'point_transactions', column: 'source_badge_id', effect: '삭제 차단' },
  { table: 'user_checkin_badge_earns', column: 'badge_id', effect: '연쇄 삭제' },
  { table: 'user_item_book_slots', column: 'badge_id', effect: '연쇄 삭제' },
  { table: 'item_books', column: 'reward_badge_id', effect: '연결 해제' },
  { table: 'item_books', column: 'required_activity_badge_id', effect: '연결 해제' },
  { table: 'missions', column: 'gated_badge_id', effect: '연결 해제' },
]

/**
 * 배열 컬럼에 들어 있는 배지 참조(티켓 20260926_0200). 외래 키가 아니라 DB가 막지 않고, 배지 행을 지우면 삭제된 id가 배열에 그대로 남는다.
 * 어드민 배지 삭제가 보는 참조 목록(`src/lib/admin/badge-references.ts`의 `BADGE_REFERENCE_SOURCES`) 중 배열 컬럼 4곳과 맞춘다:
 * missions_reward · today_cards · recipes_result · recipes_ingredient/recipes_required(같은 컬럼 `allowed_badge_ids`).
 * 조회는 배열에 배지 id가 들어 있는 행 수를 센다(`contains`). 미션·홈피드 `--undo`의 비외래 키 참조는 이 목록의 범위 밖이다.
 */
export const BADGE_UNDO_ARRAY_REFERENCE_COLUMNS: BadgeUndoReferenceSpec[] = [
  { table: 'missions', column: 'reward_badge_ids', effect: '배열에 id가 남음' },
  { table: 'today_cards', column: 'badge_ids', effect: '배열에 id가 남음' },
  { table: 'combination_recipes', column: 'reward_badge_ids', effect: '배열에 id가 남음' },
  { table: 'combination_recipe_slots', column: 'allowed_badge_ids', effect: '배열에 id가 남음' },
]

/** `--undo`가 지우기 전에 읽는 배지 참조 전체(외래 키 + 배열 컬럼). 표 이름 목록·요약 건수는 여기서 나온다. */
export const BADGE_UNDO_REFERENCES: Array<BadgeUndoReferenceSpec & { isArray: boolean }> = [
  ...BADGE_UNDO_REFERENCE_TABLES.map((r) => ({ ...r, isArray: false })),
  ...BADGE_UNDO_ARRAY_REFERENCE_COLUMNS.map((r) => ({ ...r, isArray: true })),
]

/**
 * 되돌림 전에 «이미 사용자 데이터가 붙었는지» 읽는 곳(테이블과 미션 id를 가진 컬럼). 티켓 20260925_1412.
 * 근거: `src/types/database.generated.ts`에서 `referencedRelation: "missions"`인 외래 키 6곳(2026-09-25 확인) —
 * 삭제 규칙은 `src/lib/admin/reference-guards.ts` 머리말(011·012·048·080·099)과 마이그레이션 158 참고.
 * - CASCADE(지우면 사용자 기록이 함께 사라짐): user_mission_completions · user_mission_participations · mission_rank_snapshots
 * - NO ACTION(지우면 삭제 자체가 실패): point_transactions.source_mission_id
 * - SET NULL(조용히 연결이 끊김): today_cards.mission_id · ranking_modes.target_mission_id
 * SET NULL 두 곳은 어드민 삭제 가드(`MISSION_REFERENCE_SOURCES`)에서 차단 사유가 아니지만, 이 스크립트의 되돌림은
 * «방금 등록한 미션이 아직 아무 데도 쓰이지 않았다»는 전제여서 하나라도 붙었으면 중단한다.
 * `mission_rank_snapshots`에는 `id` 컬럼이 없어서 조회는 각 표의 미션 id 컬럼으로 센다.
 */
export const MISSION_UNDO_REFERENCE_TABLES: UndoReferenceSpec[] = [
  { table: 'user_mission_completions', column: 'mission_id' },
  { table: 'user_mission_participations', column: 'mission_id' },
  { table: 'mission_rank_snapshots', column: 'mission_id' },
  { table: 'point_transactions', column: 'source_mission_id' },
  { table: 'today_cards', column: 'mission_id' },
  { table: 'ranking_modes', column: 'target_mission_id' },
]

/**
 * 되돌림 전에 «이미 사용자 데이터가 붙었는지» 읽는 곳(테이블과 카드 id를 가진 컬럼). 티켓 20260925_1413.
 * 근거: `src/types/database.generated.ts`에서 `referencedRelation: "today_cards"`인 외래 키는
 * `today_card_events.card_id` 하나뿐이다(2026-09-25 확인, 테스트가 생성 타입과 대조한다).
 * 삭제 규칙은 마이그레이션 183: `card_id UUID REFERENCES public.today_cards(id) ON DELETE SET NULL` — 카드를 지워도
 * 삭제는 막히지 않고 이벤트 행의 card_id만 NULL로 바뀐다. 그래서 «지우면 실패하는» 참조는 아니다. 그래도 노출·열람 기록이
 * 이미 붙었다는 것은 이 카드가 실제 유저에게 나갔다는 뜻이고, 지우면 그 기록이 어느 카드의 것인지 잃는다(유형별 집계용
 * content_type_id는 남는다). 이 스크립트의 되돌림은 «방금 등록한 카드가 아직 아무에게도 노출되지 않았다»는 전제여서
 * 하나라도 붙었으면 중단한다.
 * 그 밖에 코드에서 카드 id를 담는 곳은 알림 announcement 페이로드의 `today_card_id`(JSON 안의 값, 외래 키 아님)뿐이다.
 */
export const HOME_FEED_UNDO_REFERENCE_TABLES: UndoReferenceSpec[] = [{ table: 'today_card_events', column: 'card_id' }]

/**
 * 되돌림 전에 «이 컬렉션이 아직 아무 데도 쓰이지 않았는지» 읽는 관계 표(티켓 20261004_2039 가정 7). `item_books`를 가리키는 외래 키 6곳이다
 * (운영 DB `information_schema` 조회 2026-10-04, 생성 타입 `database.generated.ts`와 테스트로 대조한다).
 * - 삭제 차단(NO ACTION): user_drop_state.last_drop_book_id · point_transactions.source_item_book_id
 * - 연쇄 삭제(CASCADE, 지우면 유저 기록이 경고 없이 함께 사라짐): user_item_book_slots · user_item_book_completions
 * - 연결 해제(SET NULL, 조용히 연결이 끊김): badges.item_book_id · today_cards.item_book_id
 * `badges.item_book_id`는 소프트 삭제된 배지도 센다(`deleted_at`을 보지 않는다): 아이템 배지가 붙은 컬렉션은 기존 어드민에서 아이템을 먼저 빼야 지울 수 있다.
 * 어드민 삭제 가드(`reference-guards.ts`의 `ITEM_BOOK_REFERENCE_SOURCES`)는 이 표와 다른 질의 방식이고 합치지 않았다(그쪽은 `point_transactions`·드랍 배열 칸이 빠져 있다. 고치지 않는다).
 * 조회는 각 표의 컬렉션 id 컬럼으로 센다.
 */
export const ITEM_BOOK_UNDO_REFERENCE_TABLES: BadgeUndoReferenceSpec[] = [
  { table: 'badges', column: 'item_book_id', effect: '연결 해제' },
  { table: 'today_cards', column: 'item_book_id', effect: '연결 해제' },
  { table: 'user_item_book_slots', column: 'item_book_id', effect: '연쇄 삭제' },
  { table: 'user_item_book_completions', column: 'item_book_id', effect: '연쇄 삭제' },
  { table: 'user_drop_state', column: 'last_drop_book_id', effect: '삭제 차단' },
  { table: 'point_transactions', column: 'source_item_book_id', effect: '삭제 차단' },
]

/** 끝나지 않은 드랍 예약의 상태(`AmbientDropScheduleStatus`: `scheduled`·`running`). 나머지(`done`·`skipped`·`failed`·`missed`·`canceled`)는 끝난 예약이라 세지 않는다. */
export const AMBIENT_SCHEDULE_UNFINISHED_STATUSES: readonly string[] = ['scheduled', 'running']

/**
 * 배열 컬럼에 들어 있는 컬렉션 참조(티켓 20261004_2039 가정 7). 외래 키가 아니라 DB가 막지 않고, 컬렉션 행을 지우면 삭제된 id가 배열에 그대로 남는다.
 * - `ambient_drop_config.collection_ids`: 자동 드랍 설정이 고른 컬렉션.
 * - `ambient_drop_schedules.collection_ids`: 드랍 예약이 고른 컬렉션. **끝나지 않은 예약만** 센다(`activeStatuses`). 공개 전에 취소된 드랍은 행이 「취소」로 남으므로 세지 않는다.
 */
export const ITEM_BOOK_UNDO_ARRAY_REFERENCE_COLUMNS: Array<BadgeUndoReferenceSpec & { activeStatuses?: readonly string[] }> = [
  { table: 'ambient_drop_config', column: 'collection_ids', effect: '배열에 id가 남음' },
  { table: 'ambient_drop_schedules', column: 'collection_ids', effect: '배열에 id가 남음', activeStatuses: AMBIENT_SCHEDULE_UNFINISHED_STATUSES },
]

/** 컬렉션 되돌림·취소가 지우기 전에 읽는 참조 전체(외래 키 + 배열 컬럼). */
export const ITEM_BOOK_UNDO_REFERENCES: Array<BadgeUndoReferenceSpec & { isArray: boolean; activeStatuses?: readonly string[] }> = [
  ...ITEM_BOOK_UNDO_REFERENCE_TABLES.map((r) => ({ ...r, isArray: false })),
  ...ITEM_BOOK_UNDO_ARRAY_REFERENCE_COLUMNS.map((r) => ({ ...r, isArray: true })),
]

/**
 * 참조 위치를 순서대로(순차 await) 읽어 `id`가 붙어 있는 곳과 건수를 돌려준다. 외래 키는 `.eq`, 배열 컬럼(`isArray`)은
 * `.contains`로 센다. `activeStatuses`가 있으면 그 상태의 행만 센다(`status` 칼럼). 읽지 못하면 «확인 없이 지우지 않는다»는 뜻으로 Error를 던진다 — 문장 앞의 이름은 `labelOf`가 정한다
 * (배지는 `table.column`, 미션·홈피드는 `table`).
 */
async function countUndoReferences<T extends UndoReferenceSpec & { isArray?: boolean; activeStatuses?: readonly string[] }>(
  supabase: RegisterChecksClient,
  refs: readonly T[],
  id: string,
  labelOf: (ref: T) => string
): Promise<Array<{ ref: T; count: number }>> {
  const found: Array<{ ref: T; count: number }> = []
  for (const ref of refs) {
    const { table, column, isArray, activeStatuses } = ref
    const query = supabase.from(table).select(column, { count: 'exact', head: true })
    const matched = isArray ? query.contains(column, [id]) : query.eq(column, id)
    const { count, error } = await (activeStatuses && activeStatuses.length > 0 ? matched.in('status', [...activeStatuses]) : matched)
    if (error) {
      throw new Error(`${labelOf(ref)} 참조를 확인하지 못해서 중단했어요(확인 없이 지우지 않아요): ${error.message}`)
    }
    if (count && count > 0) found.push({ ref, count })
  }
  return found
}

/** 배지 `--undo`의 참조 확인 한 건. */
export interface BadgeUndoReferenceHit {
  table: string
  column: string
  effect: string
  count: number
}

/**
 * 되돌릴 배지가 아직 아무 데도 쓰이지 않았는지 확인한다(`BADGE_UNDO_REFERENCES` 전부). 붙어 있는 곳이 있으면 Error를 던지고,
 * 없으면 빈 목록을 돌려준다. 읽기 실패도 던진다.
 */
export async function findBadgeUndoReferences(supabase: RegisterChecksClient, badgeId: string): Promise<BadgeUndoReferenceHit[]> {
  const found = await countUndoReferences(supabase, BADGE_UNDO_REFERENCES, badgeId, (r) => `${r.table}.${r.column}`)
  const references = found.map(({ ref, count }) => ({ table: ref.table, column: ref.column, effect: ref.effect, count }))
  if (references.length > 0) {
    const detail = references.map((r) => `${r.table}.${r.column} ${r.count}건(${r.effect})`).join(', ')
    throw new Error(
      `이미 사용자 데이터나 다른 항목의 연결이 붙어서 되돌리지 않고 중단했어요 — ${detail}. 삭제 대신 어드민에서 배지를 소프트 삭제해 주세요.`
    )
  }
  return references
}

/**
 * 되돌릴(또는 공개 전에 취소할) 컬렉션이 아직 아무 데도 쓰이지 않았는지 확인한다(`ITEM_BOOK_UNDO_REFERENCES` 전부). 붙어 있는 곳이 있으면 Error를 던지고, 없으면 빈 목록을 돌려준다. 읽기 실패도 던진다.
 * 던지는 문장은 서버 로그용이다(운영툴 응답·결정 기록에는 고정 문장만 나간다).
 */
export async function findItemBookUndoReferences(supabase: RegisterChecksClient, itemBookId: string): Promise<BadgeUndoReferenceHit[]> {
  const found = await countUndoReferences(supabase, ITEM_BOOK_UNDO_REFERENCES, itemBookId, (r) => `${r.table}.${r.column}`)
  const references = found.map(({ ref, count }) => ({ table: ref.table, column: ref.column, effect: ref.effect, count }))
  if (references.length > 0) {
    const detail = references.map((r) => `${r.table}.${r.column} ${r.count}건(${r.effect})`).join(', ')
    throw new Error(`이미 아이템 배지나 유저 기록·연결이 붙어서 되돌리지 않고 중단했어요 — ${detail}. 삭제 대신 어드민에서 컬렉션을 비활성으로 바꿔 주세요.`)
  }
  return references
}

/** 미션·홈피드 `--undo`의 참조 확인 한 건. */
export interface UndoReferenceHit {
  table: string
  count: number
}

/** 되돌릴 미션에 사용자 데이터가 붙었는지 확인한다(`MISSION_UNDO_REFERENCE_TABLES`). 붙었으면 Error, 없으면 빈 목록. */
export async function findMissionUndoReferences(supabase: RegisterChecksClient, missionId: string): Promise<UndoReferenceHit[]> {
  const found = await countUndoReferences(supabase, MISSION_UNDO_REFERENCE_TABLES, missionId, (r) => r.table)
  const references = found.map(({ ref, count }) => ({ table: ref.table, count }))
  if (references.length > 0) {
    const detail = references.map((r) => `${r.table} ${r.count}건`).join(', ')
    throw new Error(
      `이미 사용자 데이터가 붙어서 되돌리지 않고 중단했어요 — ${detail}. 삭제 대신 어드민에서 미션 노출을 숨김으로 바꿔 주세요.`
    )
  }
  return references
}

/** 되돌릴 홈피드 카드에 노출·열람 기록이 붙었는지 확인한다(`HOME_FEED_UNDO_REFERENCE_TABLES`). 붙었으면 Error, 없으면 빈 목록. */
export async function findHomeFeedUndoReferences(supabase: RegisterChecksClient, cardId: string): Promise<UndoReferenceHit[]> {
  const found = await countUndoReferences(supabase, HOME_FEED_UNDO_REFERENCE_TABLES, cardId, (r) => r.table)
  const references = found.map(({ ref, count }) => ({ table: ref.table, count }))
  if (references.length > 0) {
    const detail = references.map((r) => `${r.table} ${r.count}건`).join(', ')
    throw new Error(
      `이미 노출·열람 기록이 붙어서 되돌리지 않고 중단했어요 — ${detail}. 지우면 그 기록의 card_id가 비게 돼요. 삭제 대신 어드민에서 카드를 비활성으로 바꿔 주세요.`
    )
  }
  return references
}
