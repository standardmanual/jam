/**
 * 미션 묶음의 순수 검사와 insert 페이로드(티켓 20261002_1027, 상위 20260930_1500 ②-2a).
 *
 * `scripts/asset-generator/registerMissionBundle.mjs`가 갖고 있던 미션 쪽 상수·`validateMission`·
 * `buildMissionInsertPayload`를 서버(운영툴 예약 등록)도 같은 함수로 쓰게 옮긴 모듈이다. 동작·오류 문장·
 * 페이로드 키 집합은 옮기기 전과 같다. 스크립트는 같은 이름의 상수를 다시 내보내고, `validateMission`은 이 함수를 부르며,
 * `buildMissionInsertPayload`는 얇은 JS 래퍼로 이 함수를 부른다. 이 폴더의 파일은 `node:` 모듈과 `scripts/` 아래
 * 파일을 가져오지 않는다(`__tests__/registerChecks.test.ts`가 원문으로 확인한다).
 *
 * 묶음 형식의 정본은 `docs/specs/prd/asset-generator/MISSION_REGISTRATION_BUNDLE.md`다.
 *
 * ## 어드민 미션 생성 API와 같은 규칙 (티켓 20260925_1412)
 * 미션 행 생성 규칙은 어드민 API(`src/app/api/admin/missions/route.ts` POST)와 같아야 한다.
 * 그래서 검증 3종을 **재사용한다**(복사하지 않는다), 라우트와 같은 호출 순서(키 → 값 → 게이트)로:
 * `checkMissionCondition`·`checkMissionConditionValue`(`lib/missions/condition-keys`),
 * `findGateMissionSaveError`(`lib/missions/gateMissions`).
 *
 * 상수에 `as const`를 쓰지 않는다 — 스크립트 테스트가 상수에 타입 단언을 해서 읽기 전용 튜플이면 컴파일이 깨진다.
 */
import type { Json } from '@/types/database.generated'
import type { MissionType } from '@/types/database'
import { MISSION_TYPES } from '@/lib/admin/badge-labels'
import { checkMissionCondition, checkMissionConditionValue } from '@/lib/missions/condition-keys'
import type { MissionConditionCheck } from '@/lib/missions/condition-keys'
import { findGateMissionSaveError } from '@/lib/missions/gateMissions'
import {
  AGENT_IMAGE_SOURCE,
  UUID_PATTERN,
  checkRequired,
  describeValue,
  hasControlOrLineBreak,
  isIsoDateTime,
  isNonEmptyString,
  isPlainObject,
  isPresent,
  unknownKeys,
} from './bundleRules'
import type { PlainObject } from './bundleRules'

export const MISSION_REQUIRED_FIELDS = ['title', 'description', 'mission_type', 'condition_json', 'starts_at']
export const MISSION_OPTIONAL_FIELDS = [
  'ends_at',
  'reward_points',
  'reward_badge_ids',
  'status_display_type',
  'visible_rank_count',
  'max_completions',
  'gate_axis',
  'gate_stage',
  'visibility_rule_json',
  'exposure_mode',
  'exposure_at',
]

export const STATUS_DISPLAY_TYPES = ['ranking', 'achievement', 'individual']
export const EXPOSURE_MODES = ['hidden', 'start_date', 'scheduled']

/** 어드민 검증 함수 결과(`{ error, warning }`)를 묶음 오류·주의 목록에 옮긴다. */
export function collectCheck(errors: string[], warnings: string[], prefix: string, check: MissionConditionCheck): void {
  if (check.error) errors.push(`${prefix}${check.error}`)
  if (check.warning) warnings.push(`${prefix}${check.warning}`)
}

/**
 * 미션 한 건을 검사해 오류 문장을 `errors`에, 판정에 영향이 없는 조건 필드 같은 고지를 `warnings`에 쌓는다
 * (첫 오류에서 멈추지 않는다). 미션이 객체가 아니면 한 줄만 쌓고 끝낸다.
 */
export function validateMission(errors: string[], warnings: string[], input: unknown): void {
  const prefix = 'mission.'
  if (!isPlainObject(input)) {
    errors.push('mission: 객체여야 해요.')
    return
  }
  const mission = input as PlainObject

  const supportedKeys = [...MISSION_REQUIRED_FIELDS, ...MISSION_OPTIONAL_FIELDS]
  const unknown = unknownKeys(mission, supportedKeys)
  if (unknown.length > 0) {
    errors.push(`mission: 묶음이 지원하지 않는 필드예요 — ${unknown.join(', ')}. 지원 필드: ${supportedKeys.join(', ')}`)
  }
  checkRequired(errors, prefix, mission, MISSION_REQUIRED_FIELDS)

  // 허용값 포함 검사용 — 값이 어떤 타입이든 들어오므로 문자열 목록으로 넓혀서 쓴다.
  const missionTypes: readonly string[] = MISSION_TYPES
  const exposureModes: readonly string[] = EXPOSURE_MODES
  const statusDisplayTypes: readonly string[] = STATUS_DISPLAY_TYPES

  const { title, description, mission_type, condition_json } = mission
  if (isPresent(title) && !isNonEmptyString(title)) {
    errors.push('mission.title: 비어 있지 않은 문자열이어야 해요.')
  } else if (hasControlOrLineBreak(title)) {
    errors.push('mission.title: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).')
  }
  if (isPresent(description) && !isNonEmptyString(description)) {
    errors.push('mission.description: 비어 있지 않은 문자열이어야 해요.')
  }

  let missionType: MissionType | null = null
  if (isPresent(mission_type)) {
    if (typeof mission_type !== 'string' || !missionTypes.includes(mission_type)) {
      errors.push(`mission.mission_type: ${MISSION_TYPES.join(' · ')} 중 하나여야 해요(받은 값: ${describeValue(mission_type)}).`)
    } else {
      missionType = mission_type as MissionType
    }
  }

  // 조건 검증 — 어드민 API와 같은 함수·같은 순서(키 → 값). 라우트는 형태(객체) 검사도 `checkMissionCondition`에 맡긴다.
  if (isPresent(condition_json) && !isPlainObject(condition_json)) {
    errors.push('mission.condition_json: 객체여야 해요.')
  } else if (missionType !== null && isPresent(condition_json)) {
    try {
      const keyCheck = checkMissionCondition(missionType, condition_json)
      collectCheck(errors, warnings, 'mission.condition_json: ', keyCheck)
      if (!keyCheck.error) {
        collectCheck(errors, warnings, 'mission.condition_json: ', checkMissionConditionValue(missionType, condition_json))
      }
    } catch (e) {
      errors.push(`mission.condition_json: 조건을 검증하다 오류가 났어요 — ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 기간
  for (const key of ['starts_at', 'ends_at', 'exposure_at']) {
    if (isPresent(mission[key]) && !isIsoDateTime(mission[key])) {
      errors.push(`mission.${key}: 시간대가 붙은 ISO 8601 형식이어야 해요(예: 2026-10-01T00:00:00+09:00).`)
    }
  }
  if (isIsoDateTime(mission.starts_at) && isIsoDateTime(mission.ends_at) && Date.parse(mission.starts_at) >= Date.parse(mission.ends_at)) {
    errors.push('mission.starts_at: ends_at보다 앞이어야 해요.')
  }

  // 노출 모드 — exposure_at은 scheduled일 때만 쓰이고(마이그레이션 163), 그때는 필수다.
  const exposureMode = mission.exposure_mode
  if (isPresent(exposureMode) && !(typeof exposureMode === 'string' && exposureModes.includes(exposureMode))) {
    errors.push(`mission.exposure_mode: ${EXPOSURE_MODES.join(' · ')} 중 하나여야 해요(받은 값: ${describeValue(exposureMode)}).`)
  } else {
    if (exposureMode === 'scheduled' && !isPresent(mission.exposure_at)) {
      errors.push('mission.exposure_at: exposure_mode가 scheduled면 노출 시각이 필요해요.')
    }
    if (exposureMode !== 'scheduled' && isPresent(mission.exposure_at)) {
      errors.push('mission.exposure_at: exposure_mode가 scheduled일 때만 쓸 수 있어요(그 외 모드에서는 무시돼요).')
    }
  }

  // 표시·보상·횟수
  const statusDisplayType = mission.status_display_type
  if (isPresent(statusDisplayType) && !(typeof statusDisplayType === 'string' && statusDisplayTypes.includes(statusDisplayType))) {
    errors.push(`mission.status_display_type: ${STATUS_DISPLAY_TYPES.join(' · ')} 중 하나여야 해요(받은 값: ${describeValue(statusDisplayType)}).`)
  }
  for (const key of ['visible_rank_count', 'max_completions']) {
    const value = mission[key]
    if (isPresent(value) && !(typeof value === 'number' && Number.isInteger(value) && value >= 1)) {
      errors.push(`mission.${key}: 1 이상의 정수여야 해요.`)
    }
  }
  const rewardPoints = mission.reward_points
  if (isPresent(rewardPoints) && !(typeof rewardPoints === 'number' && Number.isInteger(rewardPoints) && rewardPoints >= 0)) {
    errors.push('mission.reward_points: 0 이상의 정수여야 해요.')
  }
  if (isPresent(mission.reward_badge_ids)) {
    const ids = mission.reward_badge_ids
    if (!Array.isArray(ids) || ids.some((id) => !(typeof id === 'string' && UUID_PATTERN.test(id)))) {
      errors.push('mission.reward_badge_ids: 배지 ID(UUID) 문자열의 배열이어야 해요.')
    } else if (new Set(ids.map((id: string) => id.toLowerCase())).size !== ids.length) {
      errors.push('mission.reward_badge_ids: 같은 배지를 두 번 넣을 수 없어요.')
    }
  }

  // 게이트 필드 — 라우트와 같은 진입점. 레거시 게이트 배지(`gated_badge_id`)는 묶음이 받지 않으므로 null로 넘긴다.
  try {
    const gateError = findGateMissionSaveError({
      gate_axis: mission.gate_axis,
      gate_stage: mission.gate_stage,
      visibility_rule_json: mission.visibility_rule_json,
      gated_badge_id: null,
    })
    if (gateError) errors.push(`mission.gate: ${gateError}`)
  } catch (e) {
    errors.push(`mission.gate: 게이트 필드를 검증하다 오류가 났어요 — ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** 페이로드가 읽는 미션 필드(검사를 통과한 묶음의 `mission`). */
export interface MissionInput {
  title: string
  description: string
  mission_type: string
  condition_json: Json
  reward_points?: number | null
  reward_badge_ids?: string[] | null
  status_display_type?: string | null
  visible_rank_count?: number | null
  starts_at: string
  ends_at?: string | null
  max_completions?: number | null
  gate_axis?: string | null
  gate_stage?: string | null
  visibility_rule_json?: Json | null
  exposure_mode?: string | null
  exposure_at?: string | null
}

export interface MissionPayloadOptions {
  /** 이미지 저장 경로에 쓰려고 등록 전에 정한 UUID. */
  id: string
  /** 업로드한 WebP 공개 주소(`?v=` 캐시 무효화 쿼리 포함). */
  imageUrl: string
  /** 생략하면 `agent-generator`. 값을 주면(null 포함) 그대로 넣는다. */
  imageSource?: string | null
  /** 생략하면 null — 비워 두면 화면이 기본 문구를 쓴다. */
  conditionText?: string | null
}

/**
 * 미션 행 insert 페이로드를 만든다. 어드민 미션 생성 API(POST `/api/admin/missions`)는 body를 그대로
 * `insert`하므로 매핑이 없다 — 여기서는 어드민 폼이 «값 없음»일 때 남는 DB 기본값을 명시해서 등록 기록 SQL이
 * 실제로 들어간 값을 그대로 보여 주게 했다. 다른 점은 셋뿐이다.
 * - `id`: 이미지 저장 경로에 쓰려고 등록 전에 정한 UUID를 넣는다(라우트는 DB 기본값에 맡긴다).
 * - `image_url`: 업로드한 WebP 공개 주소(`?v=` 캐시 무효화 쿼리 포함).
 * - `image_source`: 기본은 `agent-generator`(묶음 값은 받지 않는다). 서버가 다른 출처를 남기려면 `imageSource`로 넘긴다.
 * 폐기 예정 필드(`reward_type`·`reward_id`·`gated_badge_id`)는 항상 null이다. `condition_text`(티켓 20260927_0026)는 묶음이
 * 받지 않아 기본 null이다 — 서버가 문장을 정해 두었다면 `conditionText`로 넘긴다. `created_at`은 DB 기본값에 맡긴다.
 * 키 집합은 생성 타입의 missions Insert와 같다.
 */
export function buildMissionInsertPayload(
  mission: MissionInput,
  { id, imageUrl, imageSource = AGENT_IMAGE_SOURCE, conditionText = null }: MissionPayloadOptions
) {
  return {
    id,
    title: mission.title,
    description: mission.description,
    mission_type: mission.mission_type,
    condition_json: mission.condition_json,
    // 달성 조건 문장(티켓 20260927_0026)은 묶음이 받지 않는다 — 비워 두면 화면이 기본 문구를 쓴다.
    condition_text: conditionText,
    reward_type: null,
    reward_id: null,
    reward_points: mission.reward_points ?? null,
    reward_badge_ids: mission.reward_badge_ids ?? [],
    status_display_type: mission.status_display_type ?? 'ranking',
    visible_rank_count: mission.visible_rank_count ?? null,
    starts_at: mission.starts_at,
    ends_at: mission.ends_at ?? null,
    max_completions: mission.max_completions ?? null,
    image_url: imageUrl,
    image_source: imageSource,
    gated_badge_id: null,
    gate_axis: mission.gate_axis ?? null,
    gate_stage: mission.gate_stage ?? null,
    visibility_rule_json: mission.visibility_rule_json ?? null,
    exposure_mode: mission.exposure_mode ?? 'start_date',
    exposure_at: mission.exposure_at ?? null,
  }
}
