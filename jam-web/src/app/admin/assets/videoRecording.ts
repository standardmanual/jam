/**
 * 에셋 동영상 저장의 공용 규칙 (티켓 20261103_1737)
 *
 * Shape 모드(`ShapeStudioViewport.recordVideo`)와 3D 모드(`Logo3DViewport.recordVideo`)가 같은 크기·녹화 형식·
 * 비트레이트를 쓰도록 한 곳에 둔다. 길이는 `VIDEO_SEC`(shapeStudioConfig)다.
 */

/** 저장 파일로 내려받는다. */
export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** 이 브라우저가 녹화할 수 있는 형식. MP4를 먼저 시도하고 없으면 WebM. 하나도 없으면 빈 문자열. */
export function pickVideoType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) return ''
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

/** 동영상 크기. 긴 변을 `longSide`로 두고 짧은 변은 Canvas 비율로 정하며, 인코더 요건에 맞게 두 변 모두 짝수로 맞춘다. */
export function videoSizeFor(longSide: number, ratio: string): { width: number; height: number } {
  const [a, b] = ratio.split(':').map(Number)
  let width = a >= b ? longSide : Math.round((longSide * a) / b)
  let height = a >= b ? Math.round((longSide * b) / a) : longSide
  width -= width % 2
  height -= height % 2
  return { width, height }
}

/** 30fps 기준 비트레이트(bps). */
export function videoBitrate(width: number, height: number): number {
  return Math.round(width * height * 30 * 0.14)
}
