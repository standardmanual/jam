/**
 * 미션 상세 «달성 조건» 카드의 불릿 생성 (티켓 20261104_2148, 상위 20261104_2146).
 *
 * `engine_condition` 미션의 숫자 조건 키를 `badge_metric_labels`의 라벨·단위와 이어
 * `{라벨} {값}{단위}` 문자열 목록으로 만든다. 한 키라도 만들지 못하면 불릿 전체를 `null`로 돌려
 * 호출부가 기존 표시(`condition_text` 또는 목표 유형별 문구)로 되돌아가게 한다 — 일부만 그리면
 * 조건이 빠져 보이기 때문이다.
 *
 * 범위: 옛 유형(distance·activity_count 등)과 숫자가 아닌 값(객체·문자열)은 만들지 않는다.
 * `activity_type`은 카드가 별도 줄로 그리므로 불릿 대상에서 빼고 건너뛴다.
 */
import { CONDITION_FIELDS } from '@/lib/badge-engine/conditionRegistry'
import type { MetricLabel } from '@/lib/badge-engine/metricLabels'
import { MISSION_ONLY_CONDITION_KEY_LIST } from '@/lib/missions/condition-keys'

/** 카드가 따로 그리는 키 — 불릿에도 넣지 않고, 불릿을 막지도 않는다 */
const SEPARATELY_RENDERED_KEYS = new Set(['activity_type'])

const REGISTRY_ORDER: string[] = CONDITION_FIELDS.map((f) => f.key)

/** 레지스트리에 없는 미션 전용 키(`sync_count` 등, 티켓 20261104_2234) — 레지스트리 키 뒤에 이 목록 순서로 붙는다 */
const MISSION_ONLY_ORDER: readonly string[] = MISSION_ONLY_CONDITION_KEY_LIST

function isBulletMission(missionType: string, conditionJson: unknown): conditionJson is Record<string, unknown> {
  return (
    missionType === 'engine_condition' &&
    typeof conditionJson === 'object' &&
    conditionJson !== null &&
    !Array.isArray(conditionJson)
  )
}

/**
 * 불릿 후보 키를 «레지스트리 선언 순서 → 미션 전용 키 목록 순서 → 그 밖의 키» 순으로 돌려준다. 후보가 없거나 불릿 대상 미션이 아니면 빈 배열이다.
 * 서버가 이 키로 라벨을 조회한다.
 */
export function conditionBulletKeys(missionType: string, conditionJson: unknown): string[] {
  if (!isBulletMission(missionType, conditionJson)) return []
  const present = Object.keys(conditionJson).filter(
    (key) => conditionJson[key] != null && !SEPARATELY_RENDERED_KEYS.has(key),
  )
  const ordered = REGISTRY_ORDER.filter((key) => present.includes(key))
  // 미션 전용 키는 레지스트리 키 뒤에 목록 순서로 붙인다. 라벨이 없으면 아래 생성 단계에서 null이 된다
  const missionOnly = MISSION_ONLY_ORDER.filter((key) => present.includes(key) && !REGISTRY_ORDER.includes(key))
  // 둘 다 아닌 키는 순서를 알 수 없으니 끝에 붙이고, 아래 생성 단계에서 null로 처리한다
  const unknown = present.filter((key) => !REGISTRY_ORDER.includes(key) && !MISSION_ONLY_ORDER.includes(key))
  return [...ordered, ...missionOnly, ...unknown]
}

/** 불릿 문자열 배열. 만들 수 없으면 `null`. */
export function buildConditionBullets(
  missionType: string,
  conditionJson: unknown,
  labels: Map<string, MetricLabel>,
): string[] | null {
  if (!isBulletMission(missionType, conditionJson)) return null
  const keys = conditionBulletKeys(missionType, conditionJson)
  if (keys.length === 0) return null

  const bullets: string[] = []
  for (const key of keys) {
    const value = conditionJson[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    if (!REGISTRY_ORDER.includes(key) && !MISSION_ONLY_ORDER.includes(key)) return null
    const meta = labels.get(key)
    if (!meta || !meta.label.trim()) return null
    // 정수는 소수점 없이, 소수는 그대로(0.5km) — String(number)가 둘 다 그렇게 쓴다
    bullets.push(`${meta.label} ${value}${meta.unit ?? ''}`)
  }
  return bullets
}
