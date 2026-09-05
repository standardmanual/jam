/**
 * 미션 조건(`condition_json`) 허용 키의 단일 출처 + 저장 검증 (티켓 20260905_1141)
 *
 * ## 왜 필요한가
 *
 * 미션 어드민은 `condition_json`을 **검증 없는 자유 JSON textarea**로 받는다. 그런데
 * 티켓 20260905_0028이 `evaluateConditionDetailed`에 fail-closed를 도입하면서, 조건에
 * 모르는 키(오타)나 평가 구현이 없는 키(`evaluation: 'pending'`)가 하나라도 있으면 평가를
 * 시작하지 않고 fail한다. 즉 `distnace_km`처럼 한 글자를 틀려도 **저장은 성공하고 그 미션은
 * 아무 에러 없이 영구 미달성**이 된다. 배지 쪽에는 그 오타를 막는 검증
 * (`admin/badge-validation.ts`의 `findUnknownConditionKeyError` + DB CHECK 제약)이 있지만
 * 미션 쪽에는 한 층도 없었다.
 *
 * ## 단일 출처 구조
 *
 * 허용 키 = `ALL_CONDITION_KEYS`(배지 조건 레지스트리) ∪ `MISSION_ONLY_CONDITION_KEYS`(미션 고유 어휘).
 * 이 합집합을 **평가 경로(`checker.ts`의 fail-closed 통과 목록)와 저장 검증이 함께 참조**한다.
 * 두 곳이 서로 다른 목록을 들면 「저장은 되는데 평가에서 막힌다」(또는 그 반대)가 다시 생긴다.
 *
 * `MISSION_ONLY_CONDITION_KEYS`는 예전엔 `checker.ts`의 하드코딩(`new Set(['count','badge_id'])`)
 * 이었다. 이제 `MissionCondition` 타입과 컴파일 타임으로 묶여 있어(파일 끝 단언 참고),
 * 타입에 필드를 추가했는데 배지 레지스트리에도 없고 이 목록에도 없으면 **컴파일 에러**가 난다.
 *
 * ## 배치 위치
 *
 * `checker.ts`는 `@/lib/supabase/server` 등 서버 전용 의존을 끌고 있어 API 라우트가 통째로
 * import하면 안 된다(20260904_0631 게이트 리뷰의 전이 의존 사고). 그래서 키 목록·미션 타입
 * 분류·검증 함수를 서버 의존이 없는 이 파일로 내리고, `checker.ts`가 여기서 가져다 쓴다.
 * 이 파일의 의존은 순수 상수·타입뿐이라 클라이언트 컴포넌트에서도 그대로 쓸 수 있다.
 */
import {
  ALL_CONDITION_KEYS,
  getConditionField,
  findBlockingConditionKeys,
} from '@/lib/badge-engine/conditionRegistry'
import type { ConditionKey } from '@/lib/badge-engine/conditionRegistry'
import { missionTypeLabel } from '@/lib/admin/badge-labels'
import type { BadgeCondition, MissionCondition, MissionType } from '@/types/database'

/**
 * 티켓 20260813_001: 배지엔진 `evaluateConditionDetailed`를 재사용해 판정하는 미션 타입.
 * `condition_json`은 `BadgeCondition`과 동일한 필드 어휘(activity_type + streak_days/
 * duration_minutes/elevation_gain_m)를 그대로 사용한다.
 *
 * **이 타입만 fail-closed 경로를 탄다** — 나머지 타입은 `progressValue >= target`로 판정하므로
 * 평가 구현이 없는 키가 있어도 판정이 막히지는 않는다(대신 아무 효과도 없다).
 */
export const ENGINE_DELEGATED_MISSION_TYPES: ReadonlySet<MissionType> = new Set([
  'streak_days',
  'duration_minutes',
  'elevation_gain_m',
])

/**
 * 미션 조건에만 쓰이고 배지 조건 레지스트리에는 없는 키.
 *
 * `evaluateConditionDetailed`는 fail-closed다 — 조건에 모르는 키가 있으면 평가를 시작하지
 * 않고 fail한다. 미션은 `MissionCondition`을 `BadgeCondition`으로 캐스팅해 그 함수에 넘기므로,
 * 미션 고유 어휘를 열어 두지 않으면 **미션이 영구 미달성**이 된다.
 *
 * ⚠️ 여기 키를 추가해도 「평가된다」는 뜻은 아니다 — fail-closed를 통과시킬 뿐이고,
 * 실제 판정은 `progressValue >= target` 경로나 엔진이 아는 필드만으로 이뤄진다.
 */
const MISSION_ONLY_CONDITION_KEY_LIST = [
  'count',
  'badge_id',
] as const satisfies readonly (keyof MissionCondition)[]

export type MissionOnlyConditionKey = (typeof MISSION_ONLY_CONDITION_KEY_LIST)[number]

/** `checker.ts`가 `evaluateConditionDetailed`에 넘기는 `extraAllowedKeys` */
export const MISSION_ONLY_CONDITION_KEYS: ReadonlySet<string> = new Set<string>(
  MISSION_ONLY_CONDITION_KEY_LIST
)

/**
 * 미션 `condition_json`에 들어올 수 있는 전체 키 = 배지 조건 레지스트리 ∪ 미션 고유 어휘.
 * 저장 검증과 평가 경로가 이 하나를 공유한다.
 */
export const MISSION_ALLOWED_CONDITION_KEYS: ReadonlySet<string> = new Set<string>([
  ...ALL_CONDITION_KEYS,
  ...MISSION_ONLY_CONDITION_KEY_LIST,
])

// ── 오타 제안 ────────────────────────────────────────────────────────────

/** 두 문자열의 편집 거리(Levenshtein). 오타 제안에만 쓰는 작은 구현 */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const cur = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1, // 삭제
        cur[j - 1] + 1, // 삽입
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // 치환
      )
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]
  }
  return prev[b.length]
}

/**
 * 오타로 보이는 키에 가장 가까운 허용 키를 제안한다(거리 2 이하).
 * 에러 문구에 「해결책」을 담기 위한 장치 — `distnace_km` → `distance_km`.
 * 마땅한 후보가 없으면 null.
 */
export function suggestMissionConditionKey(key: string): string | null {
  let best: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of MISSION_ALLOWED_CONDITION_KEYS) {
    const d = editDistance(key, candidate)
    if (d < bestDistance) {
      bestDistance = d
      best = candidate
    }
  }
  if (best === null || bestDistance === 0 || bestDistance > 2) return null
  return best
}

// ── 저장 검증 ────────────────────────────────────────────────────────────

export interface MissionConditionCheck {
  /** 저장을 막아야 하는 사유. null이면 저장 가능 */
  error: string | null
  /** 저장은 되지만 그 필드가 판정에 아무 영향을 주지 않는다는 고지. null이면 없음 */
  warning: string | null
}

const OK: MissionConditionCheck = { error: null, warning: null }

/** 「객체가 아니다」를 어드민이 알아볼 수 있는 말로 */
function describeShape(value: unknown): string {
  if (value === null) return '빈 값(null)'
  if (Array.isArray(value)) return '목록([...])'
  if (typeof value === 'string') return '글자'
  if (typeof value === 'number') return '숫자'
  if (typeof value === 'boolean') return '참/거짓 값'
  return '알 수 없는'
}

/** `속도 편차(pace_variation)`처럼 라벨을 함께 적어 어드민이 어느 항목인지 알게 한다 */
function labelKeys(keys: string[]): string {
  return keys.map((k) => `${getConditionField(k)?.label ?? k}(${k})`).join(', ')
}

/**
 * 미션 저장 전 `condition_json` 검증. 순수 함수 — API 라우트(POST/PATCH)와 어드민 폼이
 * 같은 판정을 공유한다(`badge-validation.ts`의 `findUnknownConditionKeyError`와 같은 패턴).
 *
 * - `condition`이 `undefined`이면 검사하지 않는다(PATCH 부분 갱신에서 조건을 건드리지 않는 경우)
 * - 객체가 아니면 거부 — 자유 textarea라 `JSON.parse('[1,2]')`가 그대로 들어올 수 있다
 * - 허용 키 밖의 키는 거부 (fail-closed에 걸려 영구 미달성이 되는 것을 저장 단계에서 막는다)
 * - 평가 구현이 없는 키(`pending`)는 **엔진 위임 타입에서만 거부**한다. 그 타입만
 *   fail-closed 경로를 타기 때문이다. 나머지 타입은 저장을 막지 않고 「효과 없음」을 고지한다
 *   (선례 20260904_1426은 「저장은 막지 않고 고지」였다 — 그 건은 발급 자체는 되는 경우였고,
 *   엔진 위임 타입은 저장하면 그 미션이 영원히 달성되지 않으므로 막는 쪽이 맞다)
 */
export function checkMissionCondition(
  missionType: MissionType,
  condition: unknown
): MissionConditionCheck {
  if (condition === undefined) return OK

  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) {
    return {
      error: `조건 JSON을 저장하지 못했어요. 조건은 중괄호로 감싼 객체여야 하는데 지금은 ${describeShape(condition)} 형태예요. {"distance_km": 50} 같은 형태로 고쳐서 다시 저장해주세요.`,
      warning: null,
    }
  }

  const blocking = findBlockingConditionKeys(
    condition as BadgeCondition,
    MISSION_ONLY_CONDITION_KEYS
  )

  if (blocking.unknown.length > 0) {
    const pairs = blocking.unknown
      .map((k) => {
        const suggestion = suggestMissionConditionKey(k)
        return suggestion ? `${k} → ${suggestion}` : null
      })
      .filter((s): s is string => s !== null)
    const fix =
      pairs.length > 0
        ? `오타로 보여요. ${pairs.join(', ')}처럼 고쳐서 다시 저장해주세요.`
        : '필드 이름에 오타가 없는지 확인하고 다시 저장해주세요.'
    return {
      error: `조건 JSON을 저장하지 못했어요. 미션 조건에 없는 필드가 있어요 — ${blocking.unknown.join(', ')}. ${fix}`,
      warning: null,
    }
  }

  if (blocking.pending.length === 0) return OK

  const typeLabel = missionTypeLabel(missionType)
  if (ENGINE_DELEGATED_MISSION_TYPES.has(missionType)) {
    return {
      error: `조건 JSON을 저장하지 못했어요. 아직 판정이 준비되지 않은 필드가 있어요 — ${labelKeys(blocking.pending)}. 「${typeLabel}」 타입은 조건을 그대로 판정하기 때문에, 이대로 저장하면 참가자가 무엇을 해도 이 미션은 달성되지 않아요. 이 필드를 빼고 다시 저장해주세요.`,
      warning: null,
    }
  }

  return {
    error: null,
    warning: `아직 판정이 준비되지 않은 필드가 있어요 — ${labelKeys(blocking.pending)}. 「${typeLabel}」 타입은 진행값으로 달성을 판정하기 때문에 저장은 되지만, 이 필드는 달성 판정에 아무 영향도 주지 않아요. 조건에서 빼도 결과는 같아요.`,
  }
}

// ── 저장 검증: 조건 «값» (티켓 20260905_1327) ────────────────────────────
//
// 위 `checkMissionCondition`은 «키»만 본다(1141). 프로덕션 `item_collect` 6건은 키는
// 전부 유효(`badge_id`)한데 값이 `null`이라 `calculateProgress()`의
// `condition.badge_id && ownership.ownedBadgeIds.has(...)`가 좌변에서 항상 false를 반환해
// **영원히 미달성**이었다(1327 배경 조사). 값 검증은 의도적으로 별도 함수로 둔다 — 기존
// `checkMissionCondition` 테스트 다수가 "이 값이면 이 키가 허용되는지"만 확인하려고
// 다른 필드는 비워 둔 조건을 쓰는데(예: `{ poi_id: 'poi-1' }`만으로 `distance` 타입 검사),
// 값 검증까지 같은 함수에 합치면 그 조건들이 "필수 값 부재"로도 걸려 테스트 의도가
// 뒤섞인다. 두 함수를 라우트 층에서 순서대로(키 → 값) 호출해 연결한다.

/** 미션 고유 키(`count`·`badge_id`)는 배지 조건 레지스트리에 라벨이 없어 여기서 직접 붙인다 */
const MISSION_ONLY_KEY_LABEL: Record<string, string> = {
  count: '목표 횟수',
  badge_id: '목표 배지',
}

function missionConditionValueLabel(key: string): string {
  return getConditionField(key)?.label ?? MISSION_ONLY_KEY_LABEL[key] ?? key
}

/**
 * 라벨 뒤에 붙일 "을/를" 조사. 라벨이 "목표 배지"(받침 없음)·"지점"(받침 있음)처럼
 * 받침 유무가 갈리므로 하드코딩한 "을"은 절반의 라벨에서 문법이 틀린다.
 */
function eulReul(label: string): '을' | '를' {
  const ch = label[label.length - 1]
  const code = ch?.charCodeAt(0) ?? 0
  if (code < 0xac00 || code > 0xd7a3) return '를'
  return (code - 0xac00) % 28 !== 0 ? '을' : '를'
}

/**
 * 미션 타입별로 달성 판정에 실제로 쓰이는 필드 하나 + 값 종류.
 *
 * **`checker.ts`의 `getTarget()`·`calculateProgress()`가 각 타입에서 읽는 키와 정확히
 * 일치해야 한다** — 여기서 새 목록을 따로 적으면 1141이 없앤 "허용 키 목록과 실제 평가
 * 로직의 불일치" 문제를 값 검증에서 재현한다. 이 매핑이 실제 로직과 어긋나지 않는지는
 * 컴파일 타임으로 보장할 수 없다(값의 존재 여부는 런타임 정보다) — 대신
 * `checker-logic.test.ts`의 "값 검증 필수 키 ↔ getTarget/calculateProgress 실측 일치"
 * 케이스가 `getTarget`·`evaluateMission`을 직접 호출해 이 표와 실제 로직이 같은 키를
 * 읽는지 대조한다.
 */
export interface MissionConditionValueRule {
  key: 'badge_id' | 'poi_id' | 'distance_km' | 'count' | 'streak_days' | 'duration_minutes' | 'elevation_gain_m'
  kind: 'uuid' | 'positive_number'
}

export const MISSION_CONDITION_VALUE_RULE: Record<MissionType, MissionConditionValueRule> = {
  item_collect: { key: 'badge_id', kind: 'uuid' },
  checkin: { key: 'poi_id', kind: 'uuid' },
  distance: { key: 'distance_km', kind: 'positive_number' },
  activity_count: { key: 'count', kind: 'positive_number' },
  streak_days: { key: 'streak_days', kind: 'positive_number' },
  duration_minutes: { key: 'duration_minutes', kind: 'positive_number' },
  elevation_gain_m: { key: 'elevation_gain_m', kind: 'positive_number' },
}

/** RFC4122 형태 검사만 한다 — 버전 비트까지는 보지 않는다(`notifications/feed.ts`의 UUID_RE와 동일 패턴) */
const MISSION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 미션 저장 전 `condition_json`의 «값» 검증. 순수 함수 — API 라우트(POST/PATCH)가
 * `checkMissionCondition`(키) 다음에 이 함수(값)를 순서대로 호출해 연결한다.
 *
 * - `item_collect`/`checkin`: 목표 대상(`badge_id`/`poi_id`)이 없거나 UUID 형태가 아니면 거부.
 * - 나머지 수치 타입(`distance`/`activity_count`/`streak_days`/`duration_minutes`/
 *   `elevation_gain_m`): 대응 키가 없거나(`?? 0` 폴백이 목표를 0으로 만들어 **즉시 달성**되는
 *   반대 방향 사고를 막는다) 0 이하이면 거부.
 * - **참조 무결성(그 UUID가 실제 배지·POI 행으로 존재하는지)은 이 함수의 범위 밖이다.**
 *   형태 검증만 하는 순수 함수로 유지한다 — 존재 여부 확인에는 DB 조회가 필요해 이 함수가
 *   서버 의존 함수가 되고, 파일 상단 주석의 "서버 의존 없는 배치" 원칙과 충돌한다. 존재하지
 *   않는 UUID를 저장하면 그 미션도 똑같이 영구 미달성되지만, 어드민이 목록에서 고르는 UI가
 *   아니라 자유 textarea로 입력하는 한 이 위험은 남는다 — 이 티켓(6건의 `null` 재발 방지)의
 *   범위 밖이라 후속 과제로 남긴다.
 * - `condition`이 `undefined`(PATCH 부분 갱신)이거나 객체가 아니면 검사하지 않는다 — 형태
 *   검증은 `checkMissionCondition`의 책임이라 여기서 중복하지 않는다.
 * - 그 미션 타입에 대응 규칙이 없으면(존재하지 않는 값 — 방어적 처리) 통과시킨다.
 */
export function checkMissionConditionValue(
  missionType: MissionType,
  condition: unknown
): MissionConditionCheck {
  if (condition === undefined) return OK
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) return OK

  const rule = MISSION_CONDITION_VALUE_RULE[missionType]
  if (!rule) return OK

  const value = (condition as Record<string, unknown>)[rule.key]
  const label = missionConditionValueLabel(rule.key)
  const typeLabel = missionTypeLabel(missionType)

  if (rule.kind === 'uuid') {
    if (value === undefined || value === null) {
      return {
        error: `조건 JSON을 저장하지 못했어요. 「${typeLabel}」 타입은 ${label}${eulReul(label)} 지정해야 달성 여부를 판정할 수 있는데 비어 있어요. ${label}${eulReul(label)} 선택해서 다시 저장해주세요.`,
        warning: null,
      }
    }
    if (typeof value !== 'string' || !MISSION_UUID_RE.test(value)) {
      return {
        error: `조건 JSON을 저장하지 못했어요. ${label} 값의 형식이 올바르지 않아요. 목록에서 ${label}${eulReul(label)} 다시 선택해 저장해주세요.`,
        warning: null,
      }
    }
    return OK
  }

  // positive_number
  if (value === undefined) {
    return {
      error: `조건 JSON을 저장하지 못했어요. 「${typeLabel}」 타입은 ${label} 목표값을 지정해야 하는데 비어 있어요. ${label}에 0보다 큰 숫자를 넣어 다시 저장해주세요.`,
      warning: null,
    }
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return {
      error: `조건 JSON을 저장하지 못했어요. ${label} 값은 0보다 큰 숫자여야 하는데 지금은 ${JSON.stringify(value)}예요. 0보다 큰 숫자로 고쳐서 다시 저장해주세요.`,
      warning: null,
    }
  }
  return OK
}

// ── 컴파일 타임 동기화 체크 ──────────────────────────────────────────────
// `conditionRegistry.ts`의 `AssertAllConditionKeysCovered`와 같은 장치.
// `MissionCondition`(src/types/database.ts)에 필드를 추가했는데 그 키가 배지 조건 레지스트리에도
// 없고 위 `MISSION_ONLY_CONDITION_KEY_LIST`에도 없으면 여기서 컴파일 에러가 난다 —
// 「타입엔 있는데 허용 키 목록엔 없어서 저장이 막히거나 평가가 막히는」 어긋남을 구조적으로 차단한다.
type AssertNever<T extends never> = T
type MissingFromMissionAllowedKeys = Exclude<
  keyof MissionCondition,
  ConditionKey | MissionOnlyConditionKey
>
/** 허용 키 목록이 `MissionCondition`의 모든 필드를 커버하지 못하면 컴파일 에러가 난다 */
export type AssertAllMissionConditionKeysCovered = AssertNever<MissingFromMissionAllowedKeys>

// 반대 방향 — 배지 레지스트리에 이미 있는 키를 「미션 고유」로 중복 선언하면 컴파일 에러.
// (레지스트리에 그 키가 추가됐다면 이 목록에서 빼야 단일 출처가 유지된다)
type MissionOnlyKeyAlreadyInRegistry = Extract<MissionOnlyConditionKey, ConditionKey>
/** 미션 고유 키 목록에 배지 레지스트리와 겹치는 키가 있으면 컴파일 에러가 난다 */
export type AssertMissionOnlyKeysAreNotInRegistry = AssertNever<MissionOnlyKeyAlreadyInRegistry>
