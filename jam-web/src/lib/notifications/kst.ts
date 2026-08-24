/**
 * 알림(소식) 시간창 계산 — **KST 고정** (티켓 20260824_019)
 *
 * `group_key`의 시간창과 `poi_views.viewed_on`은 전부 KST 기준이다(2026-08-24 확정).
 * UTC로 계산하면 `points:{YYYY-MM-DD}` 같은 일 단위 키가 **KST 09:00에 날짜가 바뀌어**
 * 아침에 받은 포인트와 저녁에 받은 포인트가 다른 묶음이 된다.
 *
 * 구현 주의 — `toLocaleDateString('ko-KR')`이나 `new Date().getDate()` 같은 로컬
 * 벽시계 API를 쓰지 않는다. 서버(Vercel)는 UTC로 도는데 개발 머신은 KST라 로컬
 * 벽시계에 의존하면 환경마다 결과가 갈린다. 티켓 20260824_006에서 Strava
 * `start_date_local`(로컬 벽시계에 Z를 붙인 값)을 진짜 UTC로 오해석해 피드 시각이
 * 최대 +9시간 미래로 찍힌 전례가 있다.
 *
 * KST(Asia/Seoul)는 서머타임이 없고 1988년 이후 UTC+09:00 고정이라, epoch에
 * 9시간을 더한 뒤 UTC 필드를 읽는 방식이 항상 정확하다.
 */

/** KST = UTC+09:00 (서머타임 없음) */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * 입력을 Date로 정규화한다.
 *
 * **Invalid Date 가드가 필요한 이유** — 파싱에 실패한 Date는 모든 게터가 `NaN`이라
 * `kstDateString()`이 `NaN-NaN-NaN`을 만든다. 그 문자열이 `poi_views.viewed_on`(DATE)에
 * 그대로 실려 DB 파싱 에러가 되거나, `group_key`에 섞여 영영 합쳐지지 않는 묶음을 만든다.
 *
 * 던지지 않고 현재 시각으로 대체한다 — 키 빌더는 `createNotification()`의 인자 위치에서
 * 평가되므로(호출부의 try 바깥) 여기서 예외를 던지면 배지 발급·픽업 같은 본 흐름이
 * 500으로 무너진다. 소식 하나가 엉뚱한 묶음에 붙는 편이 낫다. 대신 로그는 반드시 남긴다.
 */
export function toValidDate(at: Date | string | number): Date {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) {
    console.error(`[notifications] KST 계산: 유효하지 않은 시각 — ${String(at)}. 현재 시각으로 대체한다`)
    return new Date()
  }
  return d
}

/** 입력 시각을 KST 벽시계로 옮긴 Date (UTC 게터로 읽어야 KST 값이 나온다) */
function shiftToKst(at: Date | string | number): Date {
  return new Date(toValidDate(at).getTime() + KST_OFFSET_MS)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** KST 기준 날짜 문자열 `YYYY-MM-DD` */
export function kstDateString(at: Date | string | number = new Date()): string {
  const k = shiftToKst(at)
  return `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())}`
}

/** KST 기준 시각(0~23) */
export function kstHour(at: Date | string | number = new Date()): number {
  return shiftToKst(at).getUTCHours()
}

/**
 * KST 기준 6시간 블록 키 `YYYY-MM-DD-H{0|1|2|3}`
 * (0 = 00~05시, 1 = 06~11시, 2 = 12~17시, 3 = 18~23시)
 *
 * 소식 #13(픽업됨)의 6시간 묶음 창에 쓴다.
 */
export function kstSixHourBlock(at: Date | string | number = new Date()): string {
  return `${kstDateString(at)}-H${Math.floor(kstHour(at) / 6)}`
}
