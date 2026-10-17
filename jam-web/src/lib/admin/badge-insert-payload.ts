import type { Database } from '@/types/database.generated'
import { normalizeLockFields } from './badge-lock-guard'

/**
 * 배지 insert 페이로드 매핑 — 어드민 배지 생성 라우트(POST `/api/admin/badges`)와 에셋 제너레이터
 * 등록 스크립트(`scripts/asset-generator/registerBundle.mjs`)가 같은 함수를 쓴다(티켓 20260925_0541 (b)).
 * 값 매핑(체크인 배지의 null 처리·정렬 기본값·정수 정규화)의 원본이 이 파일 한 곳이다.
 *
 * 순수 함수다 — 검증(400 응답)과 DB 접근은 하지 않는다. 검증은 라우트가 먼저 끝낸 뒤 부른다.
 */

/** 요청 본문 필드. 라우트의 `req.json()`이 `any`라 같은 느슨한 타입으로 받는다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 라우트 본문(req.json())이 any라 필드별 타입을 강제하지 않는다
type BodyField = any

export interface BadgeInsertBody {
  name: BodyField
  description: BodyField
  type: BodyField
  rarity?: BodyField
  level?: BodyField
  family_key?: BodyField
  sort_order?: BodyField
  image_url?: BodyField
  activity_types?: BodyField
  patch_available?: BodyField
  patch_price_krw?: BodyField
  condition_json?: BodyField
  tribe_id?: BodyField
  item_book_id?: BodyField
  category?: BodyField
  admin_category?: BodyField
  show_on_map?: BodyField
  drop_weight?: BodyField
  valid_from?: BodyField
  valid_until?: BodyField
  point_reward?: BodyField
  background_color?: BodyField
  background_shader_id?: BodyField
  background_image_url?: BodyField
  background_video_url?: BodyField
  background_animation?: BodyField
  /** 잠김으로 만든 아이템 배지 — 아이템 배지에만 의미가 있다(티켓 20261018_0051) */
  always_locked?: BodyField
  /** 여는 데 필요한 양. 비우면 null(발급 때 등급 최소값을 쓴다) */
  unlock_required?: BodyField
}

type BadgeInsert = Database['public']['Tables']['badges']['Insert']

/** 계열 키 정규화 — 문자열이고 공백만이 아니면 trim한 값, 아니면 null. */
export function normalizeFamilyKey(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

/** 요청 본문으로 `badges` insert 페이로드를 만든다. */
export function buildBadgeInsertPayload(body: BadgeInsertBody): BadgeInsert {
  const {
    name,
    description,
    type,
    rarity,
    level,
    family_key,
    sort_order,
    image_url,
    activity_types,
    patch_available,
    patch_price_krw,
    condition_json,
    tribe_id,
    item_book_id,
    category,
    admin_category,
    show_on_map,
    drop_weight,
    valid_from,
    valid_until,
    point_reward,
    background_color,
    background_shader_id,
    background_image_url,
    background_video_url,
    background_animation,
    always_locked,
    unlock_required,
  } = body

  return {
    name,
    description,
    type,
    // 등급형은 rarity, 레벨형은 level — 정확히 하나만 값이 있다(라우트의 findRarityLevelError).
    // 빈 문자열이 CHECK를 통과하지 못하도록 «없음»은 항상 null로 정규화한다.
    rarity: rarity || null,
    level: level === undefined || level === null || level === '' ? null : Math.trunc(Number(level)),
    family_key: normalizeFamilyKey(family_key),
    // ⚠️ `sort_order = 0`은 «미설정»이라 배지 트리에서 **맨 뒤로 밀린다** — 이 저장소의 다른
    // sort_order(today_cards·tribes·item_books, 0이 앞)와 반대 관습이다(마이그레이션 130).
    // 계열에 새 자리를 추가할 때 계열의 값을 물려주지 않으면 그 배지만 계열에서 떨어진다.
    sort_order: Number.isFinite(Number(sort_order)) ? Math.max(0, Math.trunc(Number(sort_order))) : 0,
    image_url,
    activity_types: activity_types ?? [],
    patch_available: patch_available ?? false,
    // point_reward와 동일하게 음수를 막되, patch_available=false일 때 null이 들어올 수 있는
    // 필드이므로 값이 없으면(null/undefined) null을 그대로 유지한다(티켓 20260906_1424).
    patch_price_krw: patch_price_krw === null || patch_price_krw === undefined
      ? null
      : Math.max(0, Math.trunc(Number(patch_price_krw) || 0)),
    // POI 배지는 "어느 POI를 지나갔는가"로만 판정 — 활동 조건이 섞이지 않도록 강제 null
    condition_json: type === 'checkin' ? null : condition_json ?? null,
    // 체크인 배지에는 트라이브/컬렉션 개념이 없다 — 저작 화면(BadgeForm)에서도 정리하지만
    // 서버에서도 같은 규칙을 강제한다(20260830_1344).
    tribe_id: type === 'checkin' ? null : tribe_id ?? null,
    item_book_id: type === 'checkin' ? null : item_book_id ?? null,
    // 배지 카테고리는 체크인 배지 전용(poi_categories.slug 재사용, 마이그레이션 113).
    category: type === 'checkin' ? category ?? null : null,
    // 어드민 전용 분류(JAM! 카테고리, 마이그레이션 156)는 위 category와 달리 type과 무관하게
    // 독립적으로 저장한다 — JAM! 배지는 type='activity'라 type==='checkin' 가드를 그대로
    // 쓰면 저장할 수 없다(티켓 20260910_2055).
    admin_category: admin_category ?? null,
    // 지도 드롭메뉴 마커 노출 여부(마이그레이션 166, 티켓 20260912_1053) — 체크인 배지에만
    // 의미가 있으나 컬럼 자체는 전 타입 공통, 기본값 true(생략 시 노출).
    show_on_map: show_on_map ?? true,
    drop_weight: drop_weight ?? 1.0,
    valid_from: valid_from ?? null,
    valid_until: valid_until ?? null,
    point_reward: Math.max(0, Math.trunc(Number(point_reward) || 0)),
    background_color: background_color ?? null,
    background_shader_id: background_shader_id ?? null,
    // 배경 3모드(단색 / 정적 제너레이터 / 애니메이션 제너레이터)는 상호 배타적이라 선택하지 않은
    // 쪽은 항상 null로 정리된다 — 정리 책임은 저작 화면(BadgeForm)에 있고, 여기서는 넘어온 값을
    // 그대로 반영한다(20260819_012).
    background_image_url: background_image_url ?? null,
    background_video_url: background_video_url ?? null,
    // [20260901_1944] 이미지 카드 안에서 라이브 실행하는 애니메이션 파라미터(jsonb). 위 4필드가
    // 상세화면 전체 배경 레이어용인 것과 렌더링 지점이 다르며, 우선순위 판단은
    // lib/badgeBackgroundTheme.ts 한 곳에 있다.
    background_animation: background_animation ?? null,
    // 잠금 칸 두 개는 아이템 배지에만 저장한다. 검증(최소값 미만 거부)은 라우트가 먼저 끝낸다(티켓 20261018_0051 2회).
    ...normalizeLockFields(type, always_locked, unlock_required),
  }
}
