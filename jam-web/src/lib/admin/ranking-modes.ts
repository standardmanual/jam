/**
 * 어드민 랭킹모드 생성·수정 화면의 폼 값 ↔ 저장 페이로드 (순수 함수, 티켓 20260911_1440)
 *
 * `today-sections.ts`(투데이 카드)와 같은 목적 — React·서버 의존 없는 순수 함수만 두고
 * 유닛테스트 대상으로 삼는다.
 */
import type { BadgeType, RankingModeMetricType, RankingModeTargetType } from '@/types/database'
import { RANKING_SUPPORTED_CONDITION_FIELD_KEYS, isRankingSupportedConditionField } from '@/lib/ranking/metricValues'
import { CONDITION_FIELDS, CONDITION_FORM_SECTIONS, CONDITION_FORM_SECTION_LABEL } from '@/lib/badge-engine/conditionRegistry'

export const RANKING_TARGET_TYPE_OPTIONS: readonly { value: RankingModeTargetType; label: string }[] = [
  { value: 'mission_participants', label: '미션 참가자 전원' },
  { value: 'manual_users', label: '유저 직접 지정' },
]

export const RANKING_METRIC_TYPE_OPTIONS: readonly { value: 'condition_field' | 'badge_count'; label: string }[] = [
  { value: 'condition_field', label: '배지 조건 필드' },
  { value: 'badge_count', label: '배지 보유 개수' },
]

export const RANKING_BADGE_TYPE_OPTIONS: readonly { value: BadgeType; label: string }[] = [
  { value: 'activity', label: '액티비티' },
  { value: 'item', label: '아이템' },
  { value: 'checkin', label: '체크인' },
]

/**
 * 정렬 지표 필드 선택지 — 배지 조건 레지스트리의 그룹 구조(대상 활동/누적 목표/한 번의 활동
 * 기록/…)를 그대로 재사용해 섹션별로 묶는다(User Story 17). role이 'measurable'·'meta'가
 * 아닌 필드(필터·관계 필드)는 애초에 정렬 지표가 될 수 없어 목록에서 제외한다 — 나머지는
 * 1차 지원 화이트리스트(`RANKING_SUPPORTED_CONDITION_FIELD_KEYS`) 밖이어도 **보이되
 * disabled로 표시한다**(구현 계획 권장 — 지표를 하나씩 추가할 때 선택 UI를 다시 만들
 * 필요 없이 활성화만 하면 되게).
 */
export interface RankingMetricFieldOption {
  key: string
  label: string
  unit: string | null
  supported: boolean
}
export interface RankingMetricFieldGroup {
  section: string
  sectionLabel: string
  fields: RankingMetricFieldOption[]
}

export function rankingMetricFieldGroups(): RankingMetricFieldGroup[] {
  const groups: RankingMetricFieldGroup[] = []
  for (const section of CONDITION_FORM_SECTIONS) {
    const fields = CONDITION_FIELDS.filter(
      (f) => (f.role === 'measurable' || f.role === 'meta') && f.form?.section === section
    ).map((f) => ({
      key: f.key,
      label: f.label,
      unit: f.unit,
      supported: isRankingSupportedConditionField(f.key),
    }))
    if (fields.length > 0) groups.push({ section, sectionLabel: CONDITION_FORM_SECTION_LABEL[section], fields })
  }
  return groups
}

export interface RankingModeFormValues {
  title: string
  targetType: RankingModeTargetType
  /** targetType='mission_participants'일 때만 쓴다 */
  targetMissionId: string
  /** targetType='manual_users'일 때만 쓴다 */
  targetUserIds: string[]
  /** targetType='manual_users'일 때만 쓴다(mission_participants는 항상 'mission_progress'로 저장) */
  metricType: 'condition_field' | 'badge_count'
  metricFieldKey: string
  metricBadgeType: BadgeType | ''
  /** datetime-local input 문자열("YYYY-MM-DDTHH:mm") */
  startsAt: string
  endsAt: string
  /** 숫자 문자열. 비우면 무제한(공개 인원 제한 없음) */
  visibleRankCount: string
}

export interface RankingModeSavePayload {
  title: string
  target_type: RankingModeTargetType
  target_mission_id: string | null
  target_user_ids: string[]
  metric_type: RankingModeMetricType
  metric_field_key: string | null
  metric_badge_type: BadgeType | null
  starts_at: string
  ends_at: string
  visible_rank_count: number | null
}

/**
 * 저장 전 누락·오류 필드 키 목록 — 화면 위에서 아래 순서(기본 정보 → 대상 → 지표 → 기간).
 * 빈 배열이면 저장 가능하다는 뜻.
 */
export function collectRankingModeMissing(v: RankingModeFormValues): string[] {
  const missing: string[] = []
  if (!v.title.trim()) missing.push('title')

  if (v.targetType === 'mission_participants') {
    if (!v.targetMissionId) missing.push('targetMissionId')
  } else {
    if (v.targetUserIds.length === 0) missing.push('targetUserIds')
    if (v.metricType === 'condition_field') {
      if (!v.metricFieldKey || !isRankingSupportedConditionField(v.metricFieldKey)) missing.push('metricFieldKey')
    } else if (!v.metricBadgeType) {
      missing.push('metricBadgeType')
    }
  }

  if (!v.startsAt) missing.push('startsAt')
  if (!v.endsAt) missing.push('endsAt')
  return missing
}

/**
 * 저장 페이로드를 구성한다. `collectRankingModeMissing`이 빈 배열을 돌려준 뒤에만 호출한다고
 * 가정한다(이 함수 자체는 검증하지 않는다) — `today-sections.ts`의 `buildTodayCardSavePayload`와
 * 동일한 역할 분담.
 */
export function buildRankingModeSavePayload(v: RankingModeFormValues): RankingModeSavePayload {
  const isMission = v.targetType === 'mission_participants'
  return {
    title: v.title.trim(),
    target_type: v.targetType,
    target_mission_id: isMission ? v.targetMissionId || null : null,
    // 대상 방식이 아닌 쪽의 값은 폼에 남아 있어도 null/빈 배열로 비운다(today_cards의 템플릿별
    // 참조 필드 정리 관례와 동일).
    target_user_ids: isMission ? [] : v.targetUserIds,
    metric_type: isMission ? 'mission_progress' : v.metricType,
    metric_field_key: !isMission && v.metricType === 'condition_field' ? v.metricFieldKey || null : null,
    metric_badge_type: !isMission && v.metricType === 'badge_count' ? v.metricBadgeType || null : null,
    starts_at: new Date(v.startsAt).toISOString(),
    ends_at: new Date(v.endsAt).toISOString(),
    visible_rank_count: v.visibleRankCount.trim() ? Number(v.visibleRankCount) : null,
  }
}

export { RANKING_SUPPORTED_CONDITION_FIELD_KEYS }
