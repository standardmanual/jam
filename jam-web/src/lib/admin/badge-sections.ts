/**
 * 어드민 배지 생성·수정·조회 화면의 섹션 구성 — 티켓 20260911_0901
 *
 * 세 화면이 같은 섹션 순서(분류 → 기본 정보 → 획득 조건 → 연결 정보 → 보상·유효기간 → 디자인)와
 * 같은 레일(미리보기·섹션 목차·액션)을 쓴다. 섹션 제목·설명·상태·미리보기 조건 줄을 화면마다
 * 따로 적으면 폼과 상세가 서로 다른 말을 하게 되므로 여기 한 곳에 둔다.
 *
 * 순수 함수만 둔다(React·서버 의존 없음) — 유닛 테스트 대상이다.
 */
import type { ActivityType, BadgeCondition, BadgeType } from '@/types/database'
import { formatConditionChipEntries } from '@/lib/badge-engine/conditionRegistry'

// ── 분류 ─────────────────────────────────────────────────────────────────

/** 분류 태그 순서 — 목업(`Assets/20260911_badge-form-renewal-prototype.html`) 순서를 따른다 */
export const ADMIN_ACTIVITY_TYPES: readonly ActivityType[] = ['running', 'cycling', 'trail_running', 'hiking', 'walking']

/**
 * 어드민 배지 화면의 종목 한글 표기.
 *
 * 공유 모듈 `ACTIVITY_TYPE_LABELS`(`lib/utils.ts`)를 쓰지 않는다 — 그쪽은 유저 화면용 어휘
 * (자전거·달리기·등산)이고 JAM! 라벨이 섞여 있다(티켓 20260910_2316, 이 티켓 범위 밖).
 */
export const ADMIN_ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  running: '러닝',
  cycling: '사이클',
  trail_running: '트레일러닝',
  hiking: '하이킹',
  walking: '걷기',
}

/** 모르는 값이 와도 화면이 비지 않도록 원문을 돌려준다 */
export function adminActivityTypeLabel(type: string): string {
  return ADMIN_ACTIVITY_TYPE_LABEL[type as ActivityType] ?? type
}

/** 배지 타입 세그먼트 순서와 칸 아래 한 줄 설명 */
export const BADGE_TYPE_SEGMENTS: readonly { value: BadgeType; description: string }[] = [
  { value: 'activity', description: '활동 기록으로 획득' },
  { value: 'checkin', description: '지점을 지나며 획득' },
  { value: 'item', description: '활동 후 드랍' },
]

// ── 섹션 ─────────────────────────────────────────────────────────────────

export type BadgeSectionId = 'class' | 'basic' | 'cond' | 'link' | 'reward' | 'design'

export const BADGE_SECTION_ORDER: readonly BadgeSectionId[] = ['class', 'basic', 'cond', 'link', 'reward', 'design']

/** 섹션 카드의 DOM id — 목차 링크·저장 시 이동이 이 id로 찾아간다 */
export function badgeSectionDomId(id: BadgeSectionId): string {
  return `badge-section-${id}`
}

/** 섹션 제목 요소의 DOM id — 목차로 이동한 뒤 포커스를 둔다 */
export function badgeSectionHeadingId(id: BadgeSectionId): string {
  return `badge-section-${id}-heading`
}

export interface BadgeSectionContext {
  type: BadgeType
  /** admin_category === 'jam' (액티비티 타입에서만 의미가 있다) */
  isJam: boolean
}

/**
 * 타입 때문에 숨기는 섹션을 뺀 목록.
 * - 체크인은 획득 조건을 쓰지 않는다(연결된 지점으로 판정)
 * - JAM! 배지는 트라이브·컬렉션 개념이 없어 연결 정보를 숨긴다(값은 저장 페이로드에서 그대로 둔다)
 */
export function visibleBadgeSections(ctx: BadgeSectionContext): BadgeSectionId[] {
  const jam = ctx.type === 'activity' && ctx.isJam
  return BADGE_SECTION_ORDER.filter((id) => {
    if (id === 'cond') return ctx.type !== 'checkin'
    if (id === 'link') return !jam
    return true
  })
}

export function badgeSectionTitle(id: BadgeSectionId, ctx: BadgeSectionContext): string {
  switch (id) {
    case 'class':
      return '분류'
    case 'basic':
      return '기본 정보'
    case 'cond':
      return ctx.type === 'item' ? '드랍 조건' : '획득 조건'
    case 'link':
      return '연결 정보'
    case 'reward':
      return '보상 · 유효기간'
    case 'design':
      return '디자인'
  }
}

export function badgeSectionDescription(id: BadgeSectionId, ctx: BadgeSectionContext): string {
  const jam = ctx.type === 'activity' && ctx.isJam
  switch (id) {
    case 'class':
      return '배지 타입을 고르면 아래 입력 항목이 그 타입에 맞게 바뀌어요.'
    case 'basic':
      return '유저가 배지함과 상세 화면에서 읽는 이름과 설명이에요.'
    case 'cond':
      if (ctx.type === 'item') return '넣으면 조건을 채운 유저에게만 드랍 후보로 들어가요. 비워 두면 모두에게 드랍돼요.'
      if (jam) return '팔로워 수·하루 동기화 횟수 같은 서비스 사용량이 이 값에 닿으면 바로 발급돼요.'
      return '활동 기록이 이 조건을 채우면 동기화 때 자동으로 발급돼요.'
    case 'link':
      if (ctx.type === 'checkin') return '어느 지점을 지날 때 발급할지 정해요.'
      if (ctx.type === 'item') return '드랍 풀을 정하는 컬렉션과 뽑힐 확률이에요.'
      return '이 배지가 속한 트라이브와 컬렉션이에요.'
    case 'reward':
      return '획득할 때 함께 받는 보상과 이 배지가 살아 있는 기간이에요.'
    case 'design':
      return '배지 이미지와 상세 화면 배경이에요. 결과는 미리보기에 바로 반영돼요.'
  }
}

// ── 섹션 상태 ────────────────────────────────────────────────────────────

/**
 * 섹션 머리·목차에 붙는 상태.
 * - `ok`: 필수 입력을 다 채움 · `bad`: 필수 입력이 빠짐 · `set`: 선택 입력을 N개 채움 · `idle`: 비어 있음
 */
export type BadgeSectionTone = 'ok' | 'bad' | 'set' | 'idle'
export interface BadgeSectionStatus {
  tone: BadgeSectionTone
  text: string
}

/** 상태 계산에 필요한 값만 추린 스냅숏 — 폼(편집 중 state)과 상세(저장된 행)가 같은 모양으로 넘긴다 */
export interface BadgeSectionSnapshot extends BadgeSectionContext {
  activityTypeCount: number
  name: string
  description: string
  /** 요약 칩 수(미션 보상 표시 제외) */
  conditionCount: number
  missionReward: boolean
  tribeId: string | null
  itemBookId: string | null
  poiCount: number
  pointReward: number
  patchAvailable: boolean
  hasPeriod: boolean
  imageUrl: string | null
  hasAnimation: boolean
  hasBackgroundColor: boolean
}

/** 분류 필수 검증 — 액티비티이고 JAM!이 아니면 종목을 1개 이상 골라야 한다(티켓 20260910_2314 해소) */
export function isActivityTypeRequiredMissing(s: Pick<BadgeSectionSnapshot, 'type' | 'isJam' | 'activityTypeCount'>): boolean {
  return s.type === 'activity' && !s.isJam && s.activityTypeCount === 0
}

export function computeBadgeSectionStatuses(s: BadgeSectionSnapshot): Record<BadgeSectionId, BadgeSectionStatus> {
  const jam = s.type === 'activity' && s.isJam
  const basicMissing = [!s.name.trim(), !s.description.trim()].filter(Boolean).length
  const linkCount = [s.tribeId, s.itemBookId].filter(Boolean).length
  const rewardCount = [s.pointReward > 0, s.patchAvailable, s.hasPeriod].filter(Boolean).length

  let cond: BadgeSectionStatus
  if (s.type === 'activity' && !jam && s.missionReward) cond = { tone: 'set', text: '미션 보상' }
  else if (s.conditionCount > 0) cond = { tone: 'set', text: `${s.conditionCount}개 설정` }
  else cond = { tone: 'idle', text: s.type === 'item' ? '없음 · 모두에게 드랍' : '비어 있음' }

  let link: BadgeSectionStatus
  if (s.type === 'checkin') link = s.poiCount > 0 ? { tone: 'set', text: `지점 ${s.poiCount}곳` } : { tone: 'idle', text: '지점 없음' }
  else link = linkCount > 0 ? { tone: 'set', text: `${linkCount}개 연결` } : { tone: 'idle', text: '선택' }

  let design: BadgeSectionStatus
  if (!s.imageUrl) design = { tone: 'bad', text: '이미지 필요' }
  else if (s.hasAnimation) design = { tone: 'ok', text: '완료 · 애니메이션' }
  else if (s.hasBackgroundColor) design = { tone: 'ok', text: '완료 · 배경색' }
  else design = { tone: 'ok', text: '완료' }

  return {
    class: isActivityTypeRequiredMissing(s) ? { tone: 'bad', text: '분류 필요' } : { tone: 'ok', text: '완료' },
    basic: basicMissing > 0 ? { tone: 'bad', text: `필수 ${basicMissing}개 남음` } : { tone: 'ok', text: '완료' },
    cond,
    link,
    reward: rewardCount > 0 ? { tone: 'set', text: `${rewardCount}개 설정` } : { tone: 'idle', text: '선택' },
    design,
  }
}

// ── 미리보기 조건 줄 ─────────────────────────────────────────────────────

/** 미리보기 조건 줄에 담는 요약 칩 수 */
const PREVIEW_CHIP_LIMIT = 3

/**
 * 레일 미리보기의 「획득 조건」 줄.
 *
 * 예전에는 고정 문구(「실제 화면에서는 이 자리에 배지 획득 조건이 표시돼요.」)였다. 이제는
 * 어드민 목록과 같은 요약 칩 문구(`formatConditionChipEntries`) 앞 3개를 보여 준다.
 * 체크인은 연결된 지점 이름으로, 미션 보상 배지는 미션 문구로 대신한다.
 */
export function previewConditionText(input: {
  type: BadgeType
  isJam: boolean
  condition: BadgeCondition | null
  poiNames: readonly string[]
}): string {
  if (input.type === 'checkin') {
    const shown = input.poiNames.slice(0, 2).join(', ')
    const rest = input.poiNames.length - 2
    if (!shown) return '연결된 지점 통과 시 획득'
    return `${shown}${rest > 0 ? ` 외 ${rest}곳` : ''} 통과 시 획득`
  }
  if (input.type === 'activity' && !input.isJam && input.condition?.mission_reward === true) {
    return '미션 완료 시 지급'
  }
  const chips = conditionSummaryChips(input.condition)
    .slice(0, PREVIEW_CHIP_LIMIT)
    .map((c) => c.text)
  return chips.length > 0 ? chips.join(' · ') : '조건을 넣으면 여기에 표시돼요'
}

/**
 * 요약 칩 목록 — 미션 보상 표시는 뺀다. 미션 보상은 칩이 아니라 「발급 방식」으로 보여 준다.
 */
export function conditionSummaryChips(condition: BadgeCondition | null | undefined) {
  return formatConditionChipEntries(condition).filter((c) => c.key !== 'mission_reward')
}
