/**
 * 3D 모드 동영상의 턴테이블 회전 (티켓 20261103_1737)
 *
 * 지금 회전값(rotY)에서 시작해 Y축으로 한 바퀴(360°) 돌고 처음 각도로 끝난다. 각도는 경과 시간이 아니라 프레임 번호로 정한다
 * (티켓 20261103_2042): 총 N장이면 i번째 프레임은 start + 360 × i / N이라 창이 가려져 그리기가 늦어져도 영상 안의 회전 속도가
 * 일정하고, 마지막 프레임(i = N)이 시작 자세와 정확히 같다. 시작과 끝이 같은 자세라 반복 재생해도 튀지 않는다.
 */

/** 동영상 초당 프레임 수 */
export const VIDEO_FPS = 30

/** 한 바퀴 */
export const TURNTABLE_DEGREES = 360

/** 진행률(0~1)에서의 rotY(도). 0이면 시작 각도, 1이면 시작 각도 + 360°(= 같은 자세). 범위 밖 진행률은 0~1로 자른다. */
export function turntableRotY(startDeg: number, progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress))
  return startDeg + TURNTABLE_DEGREES * clamped
}

/** 총 프레임 수 N. 프레임은 0~N번까지 N + 1장이 그려진다(0번과 N번이 같은 자세). */
export function turntableFrameCount(fps: number, durationSec: number): number {
  return Math.max(1, Math.round(fps * durationSec))
}

/** i번째 프레임(0~n)의 rotY(도). i=0은 시작 각도, i=n은 시작 각도 + 360°. 범위 밖 번호는 0~n으로 자른다. */
export function turntableFrameRotY(startDeg: number, i: number, n: number): number {
  if (n <= 0) return startDeg + TURNTABLE_DEGREES
  return turntableRotY(startDeg, Math.min(n, Math.max(0, i)) / n)
}
