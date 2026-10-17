/**
 * 인정 활동 판정 — JAM 2.0 «단일 입구» (티켓 20261017_1421, 운영 로직 3.3·3.4절).
 *
 * 동기화로 가져온 활동은 이 함수 하나를 통과한 것만 잼과 모든 보상(체크인·아이템 배지 드랍·
 * 활동 배지·미션·계열 진행)에 쓴다. 다섯 기준을 모두 갖춰야 인정한다:
 *   1) 다섯 종목(러닝·트레일러닝·걷기·등산·자전거)  2) 기기로 기록(수동 입력 아님, 파일 업로드 아님)
 *   3) GPS 경로(시작 좌표와 경로 요약 둘 다)  4) 움직인 시간 10분 이상  5) 가상 활동 아님
 *
 * 걸러진 활동은 버리지 않고 사유(`filter_reason`)와 함께 저장한다 — 같은 활동을 다음 동기화에서
 * 다시 가져와 다시 거르는 낭비를 막고 `UNIQUE(user_id, strava_id)`를 그대로 쓰기 위해서다.
 * 이력을 읽는 쪽(`getActivityHistory`)은 `filter_reason IS NULL`인 행만 읽는다.
 *
 * 순수 함수다 — DB·네트워크에 닿지 않는다.
 */
import { getJamActivityType, isVirtualStravaActivity } from '@/types/strava'
import type { StravaSummaryActivity } from '@/types/strava'

/**
 * 걸러진 이유. NULL(저장 시 `filter_reason`이 비어 있음)이 «인정»이다.
 * `vehicle_speed`는 이 함수가 아니라 어뷰징 필터(차량 속도)가 붙인다 — 값 목록을 한 곳에 두려고
 * 같은 타입에 함께 선언한다.
 */
export type FilterReason =
  | 'virtual'
  | 'unsupported_sport'
  | 'manual_entry'
  | 'file_upload'
  | 'no_gps'
  | 'too_short'
  | 'vehicle_speed'

/** 인정에 필요한 움직인 시간 하한(초) — 10분 */
export const MIN_QUALIFIED_MOVING_TIME_SEC = 10 * 60

/**
 * 판정에 쓴 원본 값의 요약 — `strava_activities.source_meta`에 저장한다.
 * **유무·모양 수준만 담는다.** 경로 요약 본문(`summary_polyline`)과 좌표, 외부 ID 원문은 담지 않는다.
 * 나중에 실제 데이터로 «수동·파일 업로드» 추정 기준을 검증하고 고치기 위한 근거다.
 */
export type SourceMeta = {
  type: string
  sportType: string | null
  /** Strava `manual` 값. 응답에 없으면 null */
  manual: boolean | null
  hasUploadId: boolean
  /** 외부 ID의 모양: 없음 / 파일 이름(확장자로 끝남) / 그 밖의 서비스 식별자 */
  externalIdShape: 'none' | 'file_name' | 'other'
  hasStartLatLng: boolean
  hasSummaryPolyline: boolean
}

export type QualificationResult =
  | { qualified: true; filterReason: null; sourceMeta: SourceMeta }
  | { qualified: false; filterReason: Exclude<FilterReason, 'vehicle_speed'>; sourceMeta: SourceMeta }

/**
 * ⚠️ «추정» 기준 — 파일 이름 모양의 외부 ID 확장자 목록.
 * 실제 Strava 응답의 `external_id` 모양으로 확인한 값이 아니다(저장된 활동의 `normalized`에
 * `manual`·`upload_id`·`external_id`가 없어 과거 데이터로 검증할 수 없었다, 티켓 사용자 결정 2).
 * 기기 동기화처럼 확장자 없는 서비스 식별자는 인정한다. 기준이 틀리면 이 목록과
 * `isFileUploadActivity` 한 곳만 고친다.
 */
const FILE_UPLOAD_EXTERNAL_ID_PATTERN = /\.(gpx|fit|tcx|kml|kmz)(\.gz)?$/i

function externalIdShapeOf(externalId: string | null | undefined): SourceMeta['externalIdShape'] {
  if (typeof externalId !== 'string' || externalId.trim() === '') return 'none'
  return FILE_UPLOAD_EXTERNAL_ID_PATTERN.test(externalId.trim()) ? 'file_name' : 'other'
}

function hasUploadIdOf(raw: Pick<StravaSummaryActivity, 'upload_id' | 'upload_id_str'>): boolean {
  return (
    (raw.upload_id !== null && raw.upload_id !== undefined) ||
    (typeof raw.upload_id_str === 'string' && raw.upload_id_str !== '')
  )
}

/**
 * ⚠️ «추정» — 파일 업로드(GPX·FIT·TCX 파일을 올린 활동)인지 가르는 기준을 모은 유일한 함수.
 * 업로드 번호가 있고 외부 ID가 파일 이름 모양(`.gpx`, `.fit`, `.tcx` 등 확장자로 끝남)이면
 * 파일 업로드로 본다. 이 모양은 추정이며 위험은 «기기로 기록한 정상 활동을 잘못 거르는 것»이다.
 * 그래서 판정에 쓴 값의 유무·모양을 `source_meta`에 남긴다.
 */
export function isFileUploadActivity(meta: Pick<SourceMeta, 'hasUploadId' | 'externalIdShape'>): boolean {
  return meta.hasUploadId && meta.externalIdShape === 'file_name'
}

/** 원본 응답에서 판정에 쓴 값의 유무·모양만 뽑는다 */
export function buildSourceMeta(raw: StravaSummaryActivity): SourceMeta {
  return {
    type: raw.type,
    sportType: raw.sport_type ?? null,
    manual: typeof raw.manual === 'boolean' ? raw.manual : null,
    hasUploadId: hasUploadIdOf(raw),
    externalIdShape: externalIdShapeOf(raw.external_id),
    hasStartLatLng: Array.isArray(raw.start_latlng) && raw.start_latlng.length === 2,
    hasSummaryPolyline:
      typeof raw.map?.summary_polyline === 'string' && raw.map.summary_polyline.length > 0,
  }
}

/**
 * 인정 판정. 기준 순서: 가상 활동 → 다섯 종목 밖 → 수동 입력 → 파일 업로드(추정) → GPS 경로 →
 * 움직인 시간 10분 미만. 처음 걸린 기준 하나가 사유가 된다.
 */
export function qualifyActivity(raw: StravaSummaryActivity): QualificationResult {
  const sourceMeta = buildSourceMeta(raw)
  const reject = (
    filterReason: Exclude<FilterReason, 'vehicle_speed'>
  ): QualificationResult => ({ qualified: false, filterReason, sourceMeta })

  if (isVirtualStravaActivity(raw)) return reject('virtual')
  if (getJamActivityType(raw) === null) return reject('unsupported_sport')
  if (raw.manual === true) return reject('manual_entry')
  if (isFileUploadActivity(sourceMeta)) return reject('file_upload')
  // GPS 경로 — 시작 좌표와 경로 요약을 모두 확인한다(사용자 결정 3). 둘 중 하나라도 비면 경로 없음
  if (!sourceMeta.hasStartLatLng || !sourceMeta.hasSummaryPolyline) return reject('no_gps')
  if (!(raw.moving_time >= MIN_QUALIFIED_MOVING_TIME_SEC)) return reject('too_short')

  return { qualified: true, filterReason: null, sourceMeta }
}
