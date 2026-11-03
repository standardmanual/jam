/**
 * 3D 모드 동영상의 턴테이블 회전 (티켓 20261103_1737)
 *
 * 지금 회전값(rotY)에서 시작해 Y축으로 한 바퀴(360°) 돌고 처음 각도로 끝난다. 진행률은 녹화 경과 시간 / `VIDEO_SEC`이라
 * 프레임이 몇 장 그려지든 회전 속도가 일정하다. 시작과 끝 각도가 같은 자세라 영상을 이어 붙여 반복 재생해도 튀지 않는다.
 */

/** 한 바퀴 */
export const TURNTABLE_DEGREES = 360

/** 진행률(0~1)에서의 rotY(도). 0이면 시작 각도, 1이면 시작 각도 + 360°(= 같은 자세). 범위 밖 진행률은 0~1로 자른다. */
export function turntableRotY(startDeg: number, progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress))
  return startDeg + TURNTABLE_DEGREES * clamped
}

/** 경과 시간(초)에서의 진행률(0~1). */
export function turntableProgress(elapsedSec: number, durationSec: number): number {
  if (durationSec <= 0) return 1
  return Math.min(1, Math.max(0, elapsedSec / durationSec))
}
