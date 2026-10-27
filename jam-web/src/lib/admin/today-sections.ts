/**
 * 어드민 투데이 카드 생성·수정·조회 화면의 섹션 구성 — 티켓 20260911_1454
 *
 * 배지 화면(`badge-sections.ts`, 티켓 20260911_0901)과 같은 목적의 투데이 버전이다. 세 화면이
 * 같은 섹션 순서(분류 → 기본 정보 → 참조 컨텐츠 → 노출 설정 → 게시 기간 · 상태)와 같은 레일
 * (미리보기·섹션 목차·액션)을 쓴다. 템플릿 타입 → 필요한 섹션/필드 매핑은 예전
 * `TodayCardList.tsx`의 `fieldsFor`·`templates`·`layoutTypes`·`suggestedLayoutFor`를 그대로
 * 옮긴 것이고 값 자체는 바꾸지 않았다.
 *
 * 순수 함수만 둔다(React·서버 의존 없음) — 유닛 테스트 대상이다.
 */
import type { TodayCardTemplateType, TodayCardLayoutType } from '@/types/database'

// ── 저장 페이로드 ────────────────────────────────────────────────────────

/** 폼 필드 값 — `TodayCardForm.tsx`의 state를 그대로 옮겨 담는다(문자열 state 그대로, trim 전) */
export interface TodayCardFormValues {
  templateType: TodayCardTemplateType
  layoutType: TodayCardLayoutType
  title: string
  subtitle: string
  /** 게재용 설명문(티켓 20260929_1335) — editorial_article은 쓰지 않는다 */
  description: string
  coverImageUrl: string
  badgeIds: string[]
  missionId: string
  itemBookId: string
  regionLabel: string
  bodyMarkdown: string
  /** ranking_board 전용 — 연결할 랭킹모드 id (티켓 20260911_1440) */
  rankingModeId: string
  /** recipe_reveal 전용 — 연결할 레시피 id (티켓 20261006_1218) */
  recipeId: string
  /** 컨텐츠 유형 카탈로그(PRD content-automation/PRD.md §6) ID. T01~T17, 비움 허용(티켓 20260923_2259) */
  contentTypeId: string
  targetHref: string
  exposureTags: string[]
  /** datetime-local input 문자열("YYYY-MM-DDTHH:mm") — 비어 있지 않다고 가정한다(저장 전 필수 검증 통과 후 호출) */
  startsAt: string
  endsAt: string
  sortOrder: string
  isActive: boolean
}

export interface TodayCardSavePayload {
  template_type: TodayCardTemplateType
  layout_type: TodayCardLayoutType
  shape?: string | null
  title: string
  subtitle: string | null
  description: string | null
  cover_image_url: string | null
  badge_ids: string[]
  mission_id: string | null
  item_book_id: string | null
  region_label: string | null
  body_markdown: string | null
  ranking_mode_id: string | null
  recipe_id: string | null
  content_type_id: string | null
  target_href: string | null
  exposure_tags: string[]
  starts_at: string
  ends_at: string
  sort_order: number
  is_active: boolean
}

// ── 템플릿 · 노출 형태 옵션 ──────────────────────────────────────────────

export const TODAY_TEMPLATE_OPTIONS: readonly { value: TodayCardTemplateType; label: string }[] = [
  { value: 'badge_spotlight', label: '배지 소개 (badge_spotlight)' },
  { value: 'progress_nudge', label: '진행 알림 (progress_nudge)' },
  { value: 'mission_spotlight', label: '미션 소개 (mission_spotlight)' },
  { value: 'itembook_milestone', label: '컬렉션 소식 (itembook_milestone)' },
  { value: 'location_trend', label: '지역 트렌드 (location_trend)' },
  { value: 'drop_alert', label: '드랍 유도 (drop_alert)' },
  { value: 'editorial_article', label: '에디토리얼 기사 (editorial_article)' },
  { value: 'ranking_board', label: '랭킹보드 (ranking_board)' },
  { value: 'recipe_reveal', label: '레시피 공개 (recipe_reveal)' },
]

export const TODAY_LAYOUT_OPTIONS: readonly { value: TodayCardLayoutType; label: string }[] = [
  { value: 'large_thumbnail', label: '큰 썸네일형 — 커버 이미지 크게' },
  { value: 'dome', label: '아치 돔형 — 상단이 둥근 포스터/히어로' },
  { value: 'ticket', label: '티켓형 — 상하 노치가 파인 티켓' },
  { value: 'badge_gallery', label: '배지목록형 — 배지 갤러리/리스트' },
  { value: 'shortcut', label: '바로가기형 — 이미지 없는 짧은 CTA' },
  { value: 'banner', label: '배너형 — 가로 띠 배너' },
  { value: 'ranking_list', label: '순위 리스트형 — 랭킹보드 목록(포디엄 없음)' },
  { value: 'other', label: '기타 — 기본형' },
]

/** 템플릿을 고르면 처음엔 이 레이아웃을 기본 선택해둠(추천값일 뿐, 어드민이 자유롭게 바꿀 수 있음) */
export const SUGGESTED_LAYOUT_FOR: Record<TodayCardTemplateType, TodayCardLayoutType> = {
  badge_spotlight: 'large_thumbnail',
  progress_nudge: 'shortcut',
  mission_spotlight: 'large_thumbnail',
  itembook_milestone: 'banner',
  location_trend: 'badge_gallery',
  drop_alert: 'shortcut',
  editorial_article: 'large_thumbnail',
  ranking_board: 'ranking_list',
  // 재료 타일을 그리는 목록 모양(`list`)이 기본이다(홈피드 PRD 자원 표). 공개 예고를 `poster`로 그릴지는 카드의 모양(`shape`)이 정한다
  recipe_reveal: 'badge_gallery',
}

/**
 * 게재용 설명문(`today_cards.description`) 길이 상한 — 공백 포함 40자, 줄바꿈 불가(티켓 20260929_1335).
 * 어드민 폼(`maxLength`·글자 수 표시)과 등록 묶음(`registerHomeFeedBundle.mjs` 검증)이 이 상수 한 곳을 쓴다.
 * 화면은 14px로 2줄까지 보여 준다(`components/today/`의 `hero`·`list` 모양).
 */
export const TODAY_DESCRIPTION_MAX_LENGTH = 40

export interface TodayTemplateFields {
  badges?: boolean
  mission?: boolean
  itemBook?: boolean
  region?: boolean
  body?: boolean
  /** 게재용 설명문 입력 — editorial_article만 쓰지 않는다(본문은 body_markdown, 티켓 20260929_1335) */
  description?: boolean
  /** ranking_board 전용 — 연결할 랭킹모드 선택 입력(티켓 20260911_1440) */
  rankingMode?: boolean
  /** recipe_reveal 전용 — 연결할 레시피 선택 입력(티켓 20261006_1218) */
  recipe?: boolean
  targetHref?: boolean
}

/** 템플릿별 노출 필드 매트릭스 (Phase15_02_DATA_MODEL §2) */
export const TODAY_FIELDS_FOR: Record<TodayCardTemplateType, TodayTemplateFields> = {
  badge_spotlight: { description: true, badges: true, targetHref: true },
  progress_nudge: { description: true, badges: true, mission: true, targetHref: true },
  mission_spotlight: { description: true, mission: true, targetHref: true },
  itembook_milestone: { description: true, itemBook: true, targetHref: true },
  location_trend: { description: true, badges: true, region: true, targetHref: true },
  drop_alert: { description: true }, // target 고정 /drops
  // 카드 자신의 이동 경로(피드에서 눌렀을 때)는 항상 /today/{id}로 고정(resolveTargetHref).
  // 여기서 입력하는 mission/itemBook/targetHref는 기사 본문 끝 CTA 버튼의 목적지로 쓰인다
  // (우선순위 target_href → 컬렉션 → 미션, 티켓 20260924_0107).
  editorial_article: { body: true, mission: true, itemBook: true, targetHref: true },
  ranking_board: { description: true, rankingMode: true, targetHref: true },
  // 카드 자신의 이동 경로는 기본 /combine이다(`resolveTargetHref`, 운영자가 지정한 주소가 있으면 그쪽, 티켓 20261006_1218).
  recipe_reveal: { description: true, recipe: true, targetHref: true },
}

/** 모르는 템플릿이 받는 칸 — 어떤 칸도 받지 않는다(빈 목록) */
const NO_TEMPLATE_FIELDS: TodayTemplateFields = Object.freeze({})

/**
 * 템플릿이 받는 입력 칸. 처음 보는 템플릿 값(이 코드가 모르는 값이 DB에 먼저 들어온 경우)은 던지지 않고 빈 칸 목록을 돌려준다
 * — 어드민 상세·폼이 그 카드 하나 때문에 오류 화면이 되지 않게 한다(티켓 20261006_1217). 타입은 닫힌 유니온이지만 DB 값은 런타임에 열려 있다.
 */
export function todayTemplateFields(templateType: TodayCardTemplateType): TodayTemplateFields {
  return (TODAY_FIELDS_FOR as Partial<Record<string, TodayTemplateFields>>)[templateType] ?? NO_TEMPLATE_FIELDS
}

export const TODAY_EXPOSURE_TAG_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'all', label: 'all (항상 노출)' },
  { value: 'time_dawn', label: 'time_dawn (05~08)' },
  { value: 'time_morning', label: 'time_morning (08~11)' },
  { value: 'time_afternoon', label: 'time_afternoon (11~17)' },
  { value: 'time_evening', label: 'time_evening (17~22)' },
  { value: 'time_night', label: 'time_night (22~05)' },
  { value: 'has_participating_mission', label: 'has_participating_mission' },
  { value: 'has_ending_soon_mission', label: 'has_ending_soon_mission' },
  { value: 'has_incomplete_itembook', label: 'has_incomplete_itembook' },
  { value: 'itembook_remaining_le3', label: 'itembook_remaining_le3 (컬렉션 잔여 3개 이하)' },
  { value: 'strava_stale_14d', label: 'strava_stale_14d (Strava 동기화 경과 14일 이상)' },
  { value: 'new_user', label: 'new_user (가입 7일 이내)' },
  { value: 'weather_clear', label: 'weather_clear (오늘 날씨: 맑음)' },
  { value: 'weather_mild', label: 'weather_mild (오늘 날씨: 구름많음·흐림)' },
  { value: 'weather_rain', label: 'weather_rain (오늘 날씨: 비/눈)' },
  { value: 'weather_extreme', label: 'weather_extreme (오늘 날씨: 폭염·한파)' },
  { value: 'holiday_today', label: 'holiday_today (오늘 쉬는 공휴일)' },
  { value: 'seasonal_today', label: 'seasonal_today (오늘 절기·잡절: 입춘·동지·말복 등)' },
  { value: 'anniversary_today', label: 'anniversary_today (오늘 기념일: 식목일·어버이날 등)' },
  { value: 'chapter_1_3', label: 'chapter_1_3 (챕터 1~3)' },
  { value: 'chapter_4_6', label: 'chapter_4_6 (챕터 4~6)' },
  { value: 'chapter_7_9', label: 'chapter_7_9 (챕터 7~9)' },
  { value: 'chapter_10', label: 'chapter_10 (챕터 10)' },
  { value: 'capsule_full', label: 'capsule_full (캡슐이 가득 참)' },
  { value: 'capsule_nearly_full', label: 'capsule_nearly_full (캡슐 80% 이상 참)' },
  { value: 'jam_plenty', label: 'jam_plenty (잼이 캡슐 필요량의 2배 이상)' },
  { value: 'jam_low', label: 'jam_low (잼이 캡슐 필요량의 3분의 1 미만)' },
  { value: 'inventory_full', label: 'inventory_full (인벤토리 가득 참)' },
  { value: 'inventory_nearly_full', label: 'inventory_nearly_full (인벤토리 남은 칸 1~3)' },
]

/**
 * 컨텐츠 유형 카탈로그(17종) 선택지 — PRD `content-automation/PRD.md` §6 표를 그대로 옮겼다.
 * 값은 DB CHECK 제약(마이그레이션 183_today_card_type_and_events.sql)과 같은 T01~T17.
 * 카드에 유형 ID를 붙이지 않아도 되므로(비움 허용) 폼은 빈 값을 허용한다(티켓 20260923_2259).
 */
export const TODAY_CONTENT_TYPE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'T01', label: 'T01 · 트라이브×날씨/시간/장소/사회이슈 컬렉션 소개' },
  { value: 'T02', label: 'T02 · 컬렉션 완성 독려(잔여 N개 이하)' },
  { value: 'T03', label: 'T03 · 액티비티 동기화 오래됨 독려' },
  { value: 'T04', label: 'T04 · 시즌 이슈×트라이브 연결' },
  { value: 'T05', label: 'T05 · 사회 이슈×체크인 장소·지역 소개' },
  { value: 'T06', label: 'T06 · 트라이브 교차 믹스 추천' },
  { value: 'T07', label: 'T07 · 진행 넛지(다음 배지까지 한 걸음)' },
  { value: 'T08', label: 'T08 · 날씨 기반 즉시 활동 추천' },
  { value: 'T09', label: 'T09 · 시간대별 활동 추천' },
  { value: 'T10', label: 'T10 · 픽업 후 미믹스 유도' },
  { value: 'T11', label: 'T11 · 트라이브 미선택 유저 적성 매칭' },
  { value: 'T12', label: 'T12 · 주간 활동 리캡' },
  { value: 'T13', label: 'T13 · 신규 지역 진입 장소·체크인 소개' },
  { value: 'T14', label: 'T14 · 연속 기록(스트릭) 독려' },
  { value: 'T15', label: 'T15 · 함께하기(그룹 활동) 제안' },
  { value: 'T16', label: 'T16 · 여행·지역 이동 감지' },
  { value: 'T17', label: 'T17 · 계절 전환 예고' },
]

// ── 섹션 ─────────────────────────────────────────────────────────────────

export type TodaySectionId = 'class' | 'basic' | 'ref' | 'expose' | 'period'

export const TODAY_SECTION_ORDER: readonly TodaySectionId[] = ['class', 'basic', 'ref', 'expose', 'period']

/** 섹션 카드의 DOM id — 목차 링크·저장 시 이동이 이 id로 찾아간다 */
export function todaySectionDomId(id: TodaySectionId): string {
  return `today-section-${id}`
}

/** 섹션 제목 요소의 DOM id — 목차로 이동한 뒤 포커스를 둔다 */
export function todaySectionHeadingId(id: TodaySectionId): string {
  return `today-section-${id}-heading`
}

/**
 * 「참조 컨텐츠」 섹션은 템플릿이 배지·미션·컬렉션·지역·본문 중 하나라도 쓸 때만 보인다
 * (drop_alert는 아무것도 쓰지 않아 숨는다 — 기존 동작 유지, User Story 11).
 */
export function visibleTodaySections(templateType: TodayCardTemplateType): TodaySectionId[] {
  const fields = todayTemplateFields(templateType)
  const hasRef = Boolean(
    fields.badges || fields.mission || fields.itemBook || fields.region || fields.body || fields.rankingMode || fields.recipe
  )
  return TODAY_SECTION_ORDER.filter((id) => (id === 'ref' ? hasRef : true))
}

export function todaySectionTitle(id: TodaySectionId): string {
  switch (id) {
    case 'class':
      return '분류'
    case 'basic':
      return '기본 정보'
    case 'ref':
      return '참조 컨텐츠'
    case 'expose':
      return '노출 설정'
    case 'period':
      return '게시 기간 · 상태'
  }
}

export function todaySectionDescription(id: TodaySectionId): string {
  switch (id) {
    case 'class':
      return '템플릿 타입을 고르면 아래 참조 컨텐츠가 그 타입에 맞게 바뀌어요.'
    case 'basic':
      return '홈 화면 카드에 보여줄 제목과 이미지예요.'
    case 'ref':
      return '템플릿에 필요한 배지 · 미션 · 컬렉션 · 지역 · 본문을 연결해요.'
    case 'expose':
      return '어떤 유저에게 보여줄지, 눌렀을 때 어디로 이동할지 정해요.'
    case 'period':
      return '카드가 노출되는 기간과 정렬 순서, 활성화 여부예요.'
  }
}

// ── 섹션 상태 ────────────────────────────────────────────────────────────

/**
 * 섹션 머리·목차에 붙는 상태.
 * - `ok`: 필수 입력을 다 채움 · `bad`: 필수 입력이 빠짐 · `set`: 선택 입력을 N개 채움 · `idle`: 비어 있음
 */
export type TodaySectionTone = 'ok' | 'bad' | 'set' | 'idle'
export interface TodaySectionStatus {
  tone: TodaySectionTone
  text: string
}

/** 상태 계산에 필요한 값만 추린 스냅숏 — 폼(편집 중 state)과 상세(저장된 행)가 같은 모양으로 넘긴다 */
export interface TodaySectionSnapshot {
  templateType: TodayCardTemplateType
  title: string
  badgeCount: number
  missionId: string | null
  itemBookId: string | null
  regionLabel: string
  bodyMarkdown: string
  /** ranking_board 전용(티켓 20260911_1440) */
  rankingModeId: string | null
  /** recipe_reveal 전용(티켓 20261006_1218) */
  recipeId: string | null
  exposureTagCount: number
  hasStartsAt: boolean
  hasEndsAt: boolean
}

export function computeTodaySectionStatuses(s: TodaySectionSnapshot): Record<TodaySectionId, TodaySectionStatus> {
  const basicMissing = s.title.trim() ? 0 : 1

  const fields = todayTemplateFields(s.templateType)
  const refCount = [
    fields.badges && s.badgeCount > 0,
    fields.mission && Boolean(s.missionId),
    fields.itemBook && Boolean(s.itemBookId),
    fields.region && s.regionLabel.trim().length > 0,
    fields.body && s.bodyMarkdown.trim().length > 0,
    fields.rankingMode && Boolean(s.rankingModeId),
    fields.recipe && Boolean(s.recipeId),
  ].filter(Boolean).length

  const periodMissing = [!s.hasStartsAt, !s.hasEndsAt].filter(Boolean).length

  return {
    class: { tone: 'ok', text: '완료' },
    basic: basicMissing > 0 ? { tone: 'bad', text: `필수 ${basicMissing}개 남음` } : { tone: 'ok', text: '완료' },
    ref: refCount > 0 ? { tone: 'set', text: `${refCount}개 설정` } : { tone: 'idle', text: '선택' },
    expose: s.exposureTagCount === 0 ? { tone: 'bad', text: '필수 1개 남음' } : { tone: 'ok', text: '완료' },
    period: periodMissing > 0 ? { tone: 'bad', text: `필수 ${periodMissing}개 남음` } : { tone: 'ok', text: '완료' },
  }
}

/**
 * 저장 API(`POST /api/admin/today` · `PATCH /api/admin/today/[id]`)로 보낼 페이로드를 구성한다.
 * 예전 `TodayCardList.tsx`의 `handleSave` 로직을 그대로 옮겼다 — 값 자체는 바뀌지 않았다.
 * 템플릿이 쓰지 않는 참조 필드(배지·미션·컬렉션·지역·본문·이동경로)는 폼에 값이 남아 있어도
 * null(배지는 빈 배열)로 비워 저장한다.
 *
 * 필수 검증(제목·시작/종료 일시·노출조건 태그)을 통과한 뒤에만 호출한다고 가정한다 — 이 함수
 * 자체는 검증하지 않는다(검증은 `computeTodaySectionStatuses`가 섹션 상태로, `TodayCardForm.tsx`의
 * `collectMissing`이 저장 차단으로 담당한다).
 */
export function buildTodayCardSavePayload(v: TodayCardFormValues): TodayCardSavePayload {
  const fields = todayTemplateFields(v.templateType)
  return {
    template_type: v.templateType,
    layout_type: v.layoutType,
    shape: v.layoutType === 'dome' ? 'dome' : v.layoutType === 'ticket' ? 'ticket' : null,
    title: v.title.trim(),
    subtitle: v.subtitle.trim() || null,
    description: fields.description ? v.description.trim() || null : null,
    cover_image_url: v.coverImageUrl.trim() || null,
    badge_ids: fields.badges ? v.badgeIds : [],
    mission_id: fields.mission ? v.missionId || null : null,
    item_book_id: fields.itemBook ? v.itemBookId || null : null,
    region_label: fields.region ? v.regionLabel.trim() || null : null,
    body_markdown: fields.body ? v.bodyMarkdown || null : null,
    ranking_mode_id: fields.rankingMode ? v.rankingModeId || null : null,
    recipe_id: fields.recipe ? v.recipeId || null : null,
    // 유형 ID는 템플릿과 무관하게 모든 카드에 붙일 수 있다(자동화 파이프라인이 만든 카드용,
    // 비움 허용) — rankingModeId처럼 템플릿별로 비우지 않는다.
    content_type_id: v.contentTypeId || null,
    // drop_alert 은 target_href 무시(자동/고정). editorial_article은 카드 자신의 이동 경로가
    // 아니라 기사 본문 CTA 버튼의 목적지로 쓴다(티켓 20260924_0107).
    target_href: fields.targetHref ? v.targetHref.trim() || null : null,
    exposure_tags: v.exposureTags,
    starts_at: new Date(v.startsAt).toISOString(),
    ends_at: new Date(v.endsAt).toISOString(),
    sort_order: Number(v.sortOrder) || 0,
    is_active: v.isActive,
  }
}
