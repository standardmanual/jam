import type { BadgeCondition } from '@/types/database'
import {
  ALL_CONDITION_KEYS,
  CONDITION_FIELDS,
  parsePaceToSec,
  type ConditionKey,
} from '@/lib/badge-engine/conditionRegistry'

/**
 * "5:30" 같은 mm:ss 페이스 입력을 초(sec/km)로 변환. 형식이 어긋나면 null
 *
 * 구현은 `conditionRegistry.ts`에 있다(레지스트리의 `max_pace_sec_per_km` 파서가 같은 함수를
 * 쓴다). 기존 소비처·테스트가 이 경로로 계속 import하므로 이름만 다시 내보낸다.
 */
export { parsePaceToSec }

/**
 * 조건 빌더 폼 필드 → condition_json 조립에 필요한 원시 입력값 묶음.
 * BadgeForm.tsx의 조건 빌더 state와 1:1 대응한다. 순수 로직(React 비의존)만 이 파일에
 * 두어 BadgeForm.tsx의 무거운 컴포넌트 의존성(배경 제너레이터 등) 없이 유닛테스트할 수
 * 있도록 분리했다(티켓 20260825_031).
 *
 * ⚠️ `interface`가 아니라 `type`이다 — 레지스트리의 파서가 받는
 * `ConditionFormValues`(`Record<string, string | boolean>`)에 구조적으로 대입되려면
 * 암묵 인덱스 시그니처가 필요하고, TypeScript는 그것을 `interface`에는 부여하지 않는다.
 */
export type ConditionFormFields = {
  distanceKm: string
  totalCount: string
  elevationM: string
  minSpeedKmh: string
  maxPace: string
  streakDays: string
  activityType: string
  durationMinutes: string
  weekendDurationHours: string
  weeklyCount: string
  month: string
  monthlyKm: string
  seasonCount: string
  season: string
  tempMinC: string
  tempMaxC: string
  timeStart: string
  timeEnd: string
  prerequisiteNames: string
  /** 메타데이터 필드 — 미션 완료로만 지급되는 배지 표시용 플래그(발급 판정에는 관여하지 않음) */
  missionReward: boolean
}

/**
 * `buildConditionJsonFromFields`가 실제로 입력 UI를 갖고 조립하는 `condition_json` 필드 목록.
 *
 * **레지스트리(`conditionRegistry.ts`)에서 파생한다** — 항목에 `form`이 선언돼 있으면 폼이
 * 다루는 필드다(티켓 20260905_0028). 그 전에는 이 목록이 손으로 관리되는 7번째 복제본이었다.
 */
export const FORM_COVERED_CONDITION_KEYS: readonly ConditionKey[] = CONDITION_FIELDS.filter(
  (f) => f.form !== undefined
).map((f) => f.key)

/**
 * `ALL_CONDITION_KEYS` 중 조건 빌더 폼이 입력 UI를 제공하지 않는 필드.
 *
 * 이 목록의 필드는 `buildConditionJsonFromFields`가 `initCond`(원본)에서 그대로 보존한다 —
 * 새 조건 필드가 폼 반영을 빠뜨려도 최소한 저장 시 유실은 나지 않는다
 * (티켓 20260825_032, `mission_reward` 유실 회귀 티켓 20260825_031의 재발 방지).
 * v5 신규 20종도 전부 여기 들어간다(어드민 조건 폼은 티켓 20260905_0032).
 */
export const FORM_UNSUPPORTED_CONDITION_KEYS: readonly ConditionKey[] = ALL_CONDITION_KEYS.filter(
  (key) => !FORM_COVERED_CONDITION_KEYS.includes(key)
)

/**
 * 배지의 `condition_json` 중 조건 빌더 폼이 다루지 않아 값이 있어도 화면에 표시할 수 없는
 * 필드 목록을 돌려준다. BadgeForm.tsx가 "이 필드는 폼에서 수정할 수 없다"는 안내에 쓴다.
 */
export function getUnsupportedConditionKeys(cond: BadgeCondition | null | undefined): (keyof BadgeCondition)[] {
  if (!cond) return []
  return FORM_UNSUPPORTED_CONDITION_KEYS.filter((key) => cond[key] !== undefined)
}

/**
 * 조건 빌더 폼 입력값을 condition_json(BadgeCondition)으로 조립한다.
 *
 * **필드별 파서는 레지스트리(`conditionRegistry.ts`)의 `form.read`에 있다**(티켓 20260905_0028).
 * 예전에는 이 함수가 필드마다 `if (fields.x) cond.y = ...`를 손으로 나열하는 구조라, 새 필드를
 * 추가하고 여기 반영을 빠뜨리면 그 필드가 저장 시 조용히 유실됐다 — 실제로
 * `missionReward`(mission_reward)가 이 함수에 없어서 미션보상배지를 어드민에서 수정 저장하면
 * 플래그가 사라지는 회귀가 있었다(티켓 20260825_031).
 *
 * `initCond`(폼을 열 때 배지에 이미 저장돼 있던 원본 조건)를 넘기면, 폼이 입력 UI를 갖지
 * 않는 필드(`FORM_UNSUPPORTED_CONDITION_KEYS`)는 값이 있을 때 그대로 결과에 보존한다.
 * `PUT /api/admin/badges/[id]`가 condition_json을 부분 병합이 아니라 전체 교체로 저장하기
 * 때문에, 이 보존이 없으면 폼이 모르는 필드를 가진 배지를 열어 저장하기만 해도 그 값이
 * 조용히 사라진다(티켓 20260825_032).
 */
export function buildConditionJsonFromFields(
  fields: ConditionFormFields,
  initCond?: BadgeCondition | null
): BadgeCondition | null {
  const cond: BadgeCondition = {}

  for (const meta of CONDITION_FIELDS) {
    if (!meta.form) continue
    const value = meta.form.read(fields)
    if (value !== undefined) {
      ;(cond as Record<string, unknown>)[meta.key] = value
    }
  }

  // 폼이 입력 UI를 갖지 않는 필드는 값이 있으면 원본 그대로 보존한다 — 위 조립 로직이 절대
  // 건드리지 않는 키만 대상이라 이미 조립된 값을 덮어쓸 위험은 없다.
  if (initCond) {
    for (const key of FORM_UNSUPPORTED_CONDITION_KEYS) {
      const value = initCond[key]
      if (value !== undefined) {
        ;(cond as Record<string, unknown>)[key] = value
      }
    }
  }

  return Object.keys(cond).length > 0 ? cond : null
}
