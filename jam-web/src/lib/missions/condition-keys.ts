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
