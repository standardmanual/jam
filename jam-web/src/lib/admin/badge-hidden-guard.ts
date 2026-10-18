/**
 * 배지 양식의 «숨김 여부»·«가지» 검증과 정규화 (티켓 20261018_1816 1회, 운영 로직 10.2·10.3절)
 *
 * 순수 파일이다. 어드민 배지 양식(클라이언트 컴포넌트)과 저장 라우트(POST·PUT)가 **같은 함수·같은 문구**를 쓴다.
 * 규칙은 마이그레이션 243의 DB 제약과 같다. 서버가 먼저 한국어 문구로 막고, DB 제약은 최후 방어선이다.
 *
 *  - 숨김(`is_hidden`)은 액티비티 배지에만 쓴다(`badges_hidden_activity_only`).
 *  - 숨김 배지의 포인트는 0이다(`badges_hidden_no_points`).
 *  - 숨김 배지의 등급은 Common만 둔다. 등급이 없는 레벨형은 통과한다(`badges_hidden_common_only`).
 *  - 가지(`branch_key`)는 일곱 가지 중 하나 또는 비움이다(`badges_branch_key_known`).
 */

/** 가지 값 일곱 가지. 마이그레이션 243의 `badges_branch_key_known`과 같은 목록이다 */
export const BRANCH_KEYS = ['rhythm', 'recovery', 'time_season', 'explore', 'attribute', 'milestone', 'jam_activity'] as const

export type BranchKey = (typeof BRANCH_KEYS)[number]

/** 어드민 화면 표기. 유저 화면의 표기는 4-6이 정한다 */
export const BRANCH_LABEL: Record<BranchKey, string> = {
  rhythm: '리듬',
  recovery: '회복',
  time_season: '시간과 계절',
  explore: '탐험',
  attribute: '운동 속성',
  milestone: '이정표',
  jam_activity: 'JAM 활동',
}

/** 가지 값인가 */
export function isBranchKey(value: unknown): value is BranchKey {
  return typeof value === 'string' && (BRANCH_KEYS as readonly string[]).includes(value)
}

/**
 * 입력 값을 저장할 가지로 바꾼다. 비움(null·undefined·빈 문자열·공백)은 `null`(분류 없음),
 * 일곱 가지 밖의 값은 `'invalid'`.
 */
export function parseBranchKey(raw: unknown): BranchKey | null | 'invalid' {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string' && raw.trim() === '') return null
  return isBranchKey(raw) ? raw : 'invalid'
}

/** 저장을 막을 가지 입력의 까닭. 통과하면 `null` */
export function findBranchKeyError(raw: unknown): string | null {
  if (parseBranchKey(raw) !== 'invalid') return null
  return `저장할 수 없습니다. 가지 값(${String(raw)})을 알 수 없습니다. ${BRANCH_KEYS.join(' · ')} 중 하나를 고르거나 비워 주세요.`
}

/** 저장할 가지. `'invalid'`는 검증(`findBranchKeyError`)이 먼저 막으므로 여기서는 null로 둔다 */
export function normalizeBranchKey(raw: unknown): BranchKey | null {
  const parsed = parseBranchKey(raw)
  return parsed === 'invalid' ? null : parsed
}

/** 숨김 판정 입력. `rarity`는 레벨형이면 null이다 */
export interface HiddenBadgeFields {
  isHidden: unknown
  type: string
  rarity: string | null
  pointReward: number
}

/**
 * 숨김 배지가 DB 제약을 어기는 까닭. 통과하면 `null`.
 * 숨김이 아니면 검사하지 않는다. 한 번에 하나씩, 종류 → 등급 → 포인트 순으로 알린다.
 */
export function findHiddenBadgeError({ isHidden, type, rarity, pointReward }: HiddenBadgeFields): string | null {
  if (isHidden !== true) return null
  if (type !== 'activity') {
    return '저장할 수 없습니다. 숨김 배지는 액티비티 배지에만 쓸 수 있어요. 배지 타입을 액티비티로 바꾸거나 숨김을 꺼 주세요.'
  }
  if (rarity && rarity !== 'common') {
    return '저장할 수 없습니다. 숨김 배지의 등급은 Common만 고를 수 있어요. 등급을 Common으로 바꾸거나 숨김을 꺼 주세요.'
  }
  if (pointReward !== 0) {
    return '저장할 수 없습니다. 숨김 배지의 포인트 보상은 0이어야 해요. 포인트를 0으로 바꾸거나 숨김을 꺼 주세요.'
  }
  return null
}

/** 저장할 숨김 값. 불리언 `true`만 숨김이고 나머지(없음 포함)는 숨김이 아니다 */
export function normalizeIsHidden(raw: unknown): boolean {
  return raw === true
}
