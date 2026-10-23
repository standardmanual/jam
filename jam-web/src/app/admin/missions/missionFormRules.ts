/**
 * 어드민 미션 양식이 쓰는 순수 판정 (티켓 20261019_1318 1회)
 *
 * 폼 구성 요소에는 시험이 없어서, 폼이 화면에 보이는 문구와 저장 전 검사를 이 파일의 함수로 빼고 시험한다.
 * 서버 저장 검사(`condition-keys.ts`·`mission-tribes.ts`)가 최종 방어선이고 폼은 안내만 한다 — 그래서 순위형 금지 판정은
 * 새 규칙을 만들지 않고 서버와 **같은 함수**(`rankingConditionError`)의 결과로 정한다.
 *
 * 서버 전용 의존이 없다(폼이 가져오는 파일이다): 서버 모듈은 타입만 가져온다.
 */
import { rankingConditionError, usesNightCondition } from '@/lib/missions/condition-keys'
import type { MissionScope } from '@/lib/admin/mission-tribes'
import type { MissionType } from '@/types/database'
import {
  missionConditionRangeError,
  missionIntegerInputError,
  type MissionConditionFormFields,
} from './missionConditionFields'

/** 폼이 트라이브 체크 목록을 그리는 데 쓰는 트라이브 한 건 */
export interface MissionFormTribe {
  id: string
  name: string
  isActive: boolean
  sortOrder: number
}

/** 폼이 «기록으로 세는 조건»의 장소 카테고리 선택 칸을 그리는 데 쓰는 장소 카테고리 한 건(`poi_categories`, 티켓 20261021_1114 2회) */
export interface MissionFormPoiCategory {
  slug: string
  label: string
}

/** 유저 화면에 붙는 밤 조건 안전 안내를 운영자에게 알리는 문구(`14 안전과 윤리.md` 2절) */
export const NIGHT_SAFETY_NOTICE =
  '유저 화면에 안전 안내가 늘 붙어요. 이름과 설명은 활동을 권하지 않고 기념하는 말로 써 주세요.'

/** 캡슐 연 횟수 키 — 문구를 가르는 데만 쓴다. 순위형 금지 여부는 `rankingConditionError`가 정한다 */
function hasCapsuleOpenCount(condition: unknown): boolean {
  return (
    typeof condition === 'object' &&
    condition !== null &&
    !Array.isArray(condition) &&
    (condition as Record<string, unknown>).capsule_open_count !== undefined
  )
}

/**
 * 이 조건으로는 «랭킹형»을 고를 수 없을 때 그 이유를 한 문장으로 돌려준다. 고를 수 있으면 null이다.
 * 판정은 서버 저장 검사와 같은 함수다(밤 조건, 캡슐 연 횟수). 문구만 어느 조건 때문인지에 따라 가른다.
 */
export function rankingBlockReason(condition: unknown): string | null {
  if (rankingConditionError(condition, 'ranking') === null) return null

  const night = usesNightCondition(condition)
  const capsule = hasCapsuleOpenCount(condition)
  if (night && capsule) return '밤 조건과 캡슐 연 횟수는 순위 경쟁에 쓰면 공정하지 않아서 랭킹형을 고를 수 없어요.'
  if (night) return '밤 조건은 순위를 올리려고 늦은 밤에 무리해서 움직이게 만들 수 있어서 랭킹형을 고를 수 없어요.'
  if (capsule) {
    return '캡슐 연 횟수는 캡슐을 빨리 채워 주는 상품이 생기면 돈을 낸 유저가 순위에서 유리해져서 랭킹형을 고를 수 없어요.'
  }
  return '이 조건은 순위 경쟁에 쓸 수 없어서 랭킹형을 고를 수 없어요.'
}

/**
 * «미션 상황 표시 방식» 선택 아래에 보이는 안내(없으면 null). 이 조건으로는 랭킹형을 고를 수 없을 때 이유를 보이고,
 * 이미 랭킹형으로 정해져 있으면(새 미션의 기본 틀이 랭킹형이다) 바꿔야 저장할 수 있다는 말을 덧붙인다. 틀을 자동으로 바꾸지는 않는다.
 */
export function rankingFrameNotice(statusDisplayType: string, condition: unknown): string | null {
  const reason = rankingBlockReason(condition)
  if (!reason) return null
  if (statusDisplayType !== 'ranking') return reason
  return `${reason} 지금 랭킹형으로 정해져 있어서, 달성형이나 개인형으로 바꿔야 저장할 수 있어요.`
}

export interface MissionFormSaveInput {
  scope: MissionScope
  allowedTribeIds: readonly string[]
  /** 고른 미션 상황 표시 방식(`ranking` | `achievement` | `individual`) */
  statusDisplayType: string
  /** 저장될 condition_json (폼 미리보기) */
  condition: unknown
  /** 고른 미션 타입 — 어떤 정수 칸을 읽는지 가른다 */
  missionType: MissionType
  /** 조건 빌더가 들고 있는 입력 글자. `condition`은 이미 숫자라 «2.5»가 2로 잘린 뒤여서, 정수 검사는 이 글자를 본다 */
  conditionFields: MissionConditionFormFields
}

/**
 * 저장 전에 폼이 먼저 알리는 문제 하나(없으면 null). 서버가 같은 검사를 하지만, 서버 거절은 «저장하지 못했어요»로 끝나
 * 운영자가 무엇을 고쳐야 하는지 늦게 안다. 틀을 자동으로 바꾸지는 않는다 — 운영자가 고른다.
 */
export function findMissionFormSaveError(input: MissionFormSaveInput): string | null {
  if (input.scope === 'tribe' && input.allowedTribeIds.length === 0) {
    return '트라이브 미션은 참가할 수 있는 트라이브를 하나 이상 골라야 해요. 트라이브를 고르거나 공통 미션으로 바꿔 주세요.'
  }
  // 정수 칸의 소수·지수 표기 — 조립된 값은 이미 2·1로 잘려 있어 범위 검사가 통과시키므로 입력 글자를 먼저 본다(티켓 20261023_1748)
  const integerError = missionIntegerInputError(input.missionType, input.conditionFields)
  if (integerError) return integerError
  // 입력 칸 범위 — 서버는 위임 키의 범위를 보지 않아, 도달할 수 없는 값은 폼이 먼저 막는다(티켓 20261021_1114 1회)
  const rangeError = missionConditionRangeError(input.condition)
  if (rangeError) return rangeError
  if (input.statusDisplayType === 'ranking') return rankingFrameNotice(input.statusDisplayType, input.condition)
  return null
}

/** 요청 본문의 트라이브 필드. 공통 미션은 빈 목록을 보내 이미 걸려 있던 제한을 푼다 */
export function buildMissionTribePayload(
  scope: MissionScope,
  allowedTribeIds: readonly string[]
): { scope: MissionScope; allowed_tribe_ids: string[] } {
  return { scope, allowed_tribe_ids: scope === 'tribe' ? [...allowedTribeIds] : [] }
}

/** 수정 화면의 처음 종류: 허용 트라이브가 하나라도 있으면 트라이브 미션, 없으면 공통 미션 */
export function missionScopeFrom(allowedTribeIds: readonly string[] | null | undefined): MissionScope {
  return allowedTribeIds && allowedTribeIds.length > 0 ? 'tribe' : 'common'
}

/** 트라이브 체크 목록 순서: 활성 먼저, 같은 활성 상태끼리는 정렬 순서 → 이름 순 */
export function sortMissionFormTribes(tribes: readonly MissionFormTribe[]): MissionFormTribe[] {
  return [...tribes].sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko')
  )
}

/** 체크 목록에 보이는 이름. 비활성 트라이브는 표기한다 */
export function missionFormTribeLabel(tribe: Pick<MissionFormTribe, 'name' | 'isActive'>): string {
  return tribe.isActive ? tribe.name : `${tribe.name} (비활성)`
}

/** 보상 배지 중 «잠김으로 만든 아이템 배지» 이름들. 표시만 하고 저장값은 바꾸지 않는다 */
export function lockedRewardBadgeNames(badges: readonly { name: string; always_locked?: boolean }[]): string[] {
  return badges.filter((badge) => badge.always_locked === true).map((badge) => badge.name)
}

/** 잠김으로 만든 아이템 배지가 보상에 있을 때 보상 구성에 붙는 읽기 전용 안내(없으면 null) */
export function lockedRewardNotice(names: readonly string[]): string | null {
  if (names.length === 0) return null
  return `잠김으로 만든 아이템 배지: ${names.join(', ')}. 받는 유저는 이 배지를 잠긴 채로 받아요. 잠금 설정은 배지 양식에서 바꿔요.`
}
