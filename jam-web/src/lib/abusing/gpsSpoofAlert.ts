/**
 * GPS 조작 의심 운영자 알림 (티켓 20261022_0940, 운영 로직 16.5절, 정책 20번 4절) — 서버 전용.
 *
 * 픽업 라우트가 GPS 조작을 감지하면 응답을 보낸 뒤(`after`) `#jam-alert`에 글 한 건을 올린다. 이 알림은
 * «운영자에게 알린다»만 맡는다. **자동 정지는 하지 않는다** — 운영자가 어드민 어뷰징 관리의 «장소 블록» 탭에서
 * 확인한 뒤 정지를 정한다. 보내기가 실패하거나 환경변수가 없어도 던지지 않는다(픽업 응답과 장소 차단·기록은 그대로).
 *
 * 글에는 유저 ID를 싣는다(사용자 결정 2026-10-22, 대량 수령 경보와 같다). **좌표·이메일·토큰은 싣지 않는다** —
 * 입력 타입에 그 값이 아예 없다. 장소 이름은 외부 장소 검색에서 온 값이라 슬랙 특수문자를 거르고 길면 자른다.
 */
import { escapeSlackText, postOpsSlack } from '@/lib/admin/opsInbox/slack'

const LOG = '[gps-spoof-alert]'
/**
 * 슬랙 글에 넣는 문자열의 최대 길이. `opsInbox/slack.ts`의 `safeField`(내보내지 않음)와 같은 규칙이다
 * (공백을 하나로 줄이고, 60자를 넘으면 자르고 «…»를 붙이고, `escapeSlackText`를 거친다).
 */
const SLACK_FIELD_MAX_CHARS = 60

function safeField(value: string): string {
  const chars = [...value.replace(/\s+/g, ' ').trim()]
  const cut = chars.length > SLACK_FIELD_MAX_CHARS ? `${chars.slice(0, SLACK_FIELD_MAX_CHARS).join('')}…` : chars.join('')
  return escapeSlackText(cut)
}

export interface GpsSpoofAlertInput {
  userId: string
  /** 감지된 장소의 이름 */
  poiName: string
  /** 감지 사유: 이동 속도 초과 또는 하루 누적 이동거리 초과 */
  reason: 'speed' | 'daily_distance'
  /** 사유가 `speed`일 때의 속도(km/h) */
  speedKmh?: number
  /** 사유가 `daily_distance`일 때의 하루 누적 이동거리(km) */
  dailyDistanceKm?: number
  /** 이 장소를 막은 시간(정책 `poi_block_hours`) */
  blockHours: number
  /**
   * 장소 차단·기록 저장이 끝났는지(티켓 20261022_0940). `false`면 글이 «막았고 기록을 남겼어요»라고 말하지 않고
   * 저장하지 못했다고 알린다 — 알림은 저장이 실패해도 보낸다.
   */
  sanctionStored: boolean
}

function formatCount(n: number): string {
  return Math.round(n).toLocaleString('ko-KR')
}

function describeReason(input: GpsSpoofAlertInput): string {
  if (input.reason === 'daily_distance') {
    return typeof input.dailyDistanceKm === 'number' && Number.isFinite(input.dailyDistanceKm)
      ? `하루 이동거리 ${formatCount(input.dailyDistanceKm)}km`
      : '하루 이동거리 초과'
  }
  return typeof input.speedKmh === 'number' && Number.isFinite(input.speedKmh)
    ? `속도 ${formatCount(input.speedKmh)}km/h`
    : '이동 속도 초과'
}

/**
 * 알림 글. 세 줄이다.
 * 예(`sanctionStored: true`):
 * ```
 * GPS 조작이 의심돼서 픽업을 거부했어요
 * • 유저(7b1c…) · 장소 성수역 · 속도 412km/h
 * • 이 장소는 72시간 막았고 기록을 남겼어요. 어드민 어뷰징 관리의 장소 블록에서 확인한 뒤 운영자가 정지를 정해요
 * ```
 * 사유가 하루 이동거리면 `하루 이동거리 3,200km`로 쓴다.
 * `sanctionStored: false`(장소 차단·기록 저장 실패)면 셋째 줄을 «• 장소 차단이나 기록을 저장하지 못했어요. 서버 로그를 확인하고,
 * 필요하면 운영자가 정지를 정해요»로 바꾼다 — 막지 못한 것을 막았다고 쓰지 않으므로 차단 시간 문구도 쓰지 않는다.
 */
export function formatGpsSpoofAlertMessage(input: GpsSpoofAlertInput): string {
  const outcome = input.sanctionStored
    ? `• 이 장소는 ${formatCount(input.blockHours)}시간 막았고 기록을 남겼어요. 어드민 어뷰징 관리의 장소 블록에서 확인한 뒤 운영자가 정지를 정해요`
    : '• 장소 차단이나 기록을 저장하지 못했어요. 서버 로그를 확인하고, 필요하면 운영자가 정지를 정해요'
  return [
    'GPS 조작이 의심돼서 픽업을 거부했어요',
    `• 유저(${safeField(input.userId)}) · 장소 ${safeField(input.poiName)} · ${describeReason(input)}`,
    outcome,
  ].join('\n')
}

/**
 * `#jam-alert`에 알린다. 올렸으면 true. **던지지 않는다** — 환경변수가 없거나(`not_configured`), 슬랙이 실패하거나,
 * 예외가 나도 서버 로그만 남기고 false를 돌려준다.
 */
export async function alertGpsSpoof(input: GpsSpoofAlertInput): Promise<boolean> {
  try {
    const result = await postOpsSlack('alert', formatGpsSpoofAlertMessage(input))
    if (!result.ok) {
      console.error(`${LOG} 슬랙 발송 실패(${result.error}) — userId: ${input.userId}, poiName: ${input.poiName}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`${LOG} 알림 처리 예외 — userId: ${input.userId}:`, e)
    return false
  }
}
