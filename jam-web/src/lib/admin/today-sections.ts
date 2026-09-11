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
  coverImageUrl: string
  badgeIds: string[]
  missionId: string
  itemBookId: string
  regionLabel: string
  bodyMarkdown: string
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
  title: string
  subtitle: string | null
  cover_image_url: string | null
  badge_ids: string[]
  mission_id: string | null
  item_book_id: string | null
  region_label: string | null
  body_markdown: string | null
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
]

export const TODAY_LAYOUT_OPTIONS: readonly { value: TodayCardLayoutType; label: string }[] = [
  { value: 'large_thumbnail', label: '큰 썸네일형 — 커버 이미지 크게' },
  { value: 'badge_gallery', label: '배지목록형 — 배지 갤러리/리스트' },
  { value: 'shortcut', label: '바로가기형 — 이미지 없는 짧은 CTA' },
  { value: 'banner', label: '배너형 — 가로 띠 배너' },
  { value: 'other', label: '기타 — 기본형' },
]

/** 템플릿을 고르면 처음엔 이 레이아웃을 기본 선택해둠(추천값일 뿐, 어드민이 자유롭게 바꿀 수 있음) */
export const SUGGESTED_LAYOUT_FOR: Record<TodayCardTemplateType, TodayCardLayoutType> = {
  badge_spotlight: 'large_thumbnail',
  progress_nudge: 'shortcut',
  mission_spotlight: 'shortcut',
  itembook_milestone: 'banner',
  location_trend: 'badge_gallery',
  drop_alert: 'shortcut',
  editorial_article: 'large_thumbnail',
}

export interface TodayTemplateFields {
  badges?: boolean
  mission?: boolean
  itemBook?: boolean
  region?: boolean
  body?: boolean
  targetHref?: boolean
}

/** 템플릿별 노출 필드 매트릭스 (Phase15_02_DATA_MODEL §2) */
export const TODAY_FIELDS_FOR: Record<TodayCardTemplateType, TodayTemplateFields> = {
  badge_spotlight: { badges: true, targetHref: true },
  progress_nudge: { badges: true, mission: true, targetHref: true },
  mission_spotlight: { mission: true, targetHref: true },
  itembook_milestone: { itemBook: true, targetHref: true },
  location_trend: { badges: true, region: true, targetHref: true },
  drop_alert: {}, // target 고정 /drops
  editorial_article: { body: true }, // target 고정 /today/{id}
}

export function todayTemplateFields(templateType: TodayCardTemplateType): TodayTemplateFields {
  return TODAY_FIELDS_FOR[templateType]
}

export const TODAY_EXPOSURE_TAG_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'all', label: 'all (항상 노출)' },
  { value: 'time_dawn', label: 'time_dawn (00~06)' },
  { value: 'time_morning', label: 'time_morning (06~11)' },
  { value: 'time_afternoon', label: 'time_afternoon (11~17)' },
  { value: 'time_evening', label: 'time_evening (17~21)' },
  { value: 'time_night', label: 'time_night (21~24)' },
  { value: 'has_participating_mission', label: 'has_participating_mission' },
  { value: 'has_ending_soon_mission', label: 'has_ending_soon_mission' },
  { value: 'has_incomplete_itembook', label: 'has_incomplete_itembook' },
  { value: 'new_user', label: 'new_user (가입 7일 이내)' },
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
  const hasRef = Boolean(fields.badges || fields.mission || fields.itemBook || fields.region || fields.body)
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
    title: v.title.trim(),
    subtitle: v.subtitle.trim() || null,
    cover_image_url: v.coverImageUrl.trim() || null,
    badge_ids: fields.badges ? v.badgeIds : [],
    mission_id: fields.mission ? v.missionId || null : null,
    item_book_id: fields.itemBook ? v.itemBookId || null : null,
    region_label: fields.region ? v.regionLabel.trim() || null : null,
    body_markdown: fields.body ? v.bodyMarkdown || null : null,
    // editorial_article/drop_alert 은 target_href 무시(자동/고정)
    target_href: fields.targetHref ? v.targetHref.trim() || null : null,
    exposure_tags: v.exposureTags,
    starts_at: new Date(v.startsAt).toISOString(),
    ends_at: new Date(v.endsAt).toISOString(),
    sort_order: Number(v.sortOrder) || 0,
    is_active: v.isActive,
  }
}
