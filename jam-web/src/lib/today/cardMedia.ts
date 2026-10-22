/**
 * 홈피드 카드 미디어(이미지 / 동영상) 판별 및 지원 유틸 (티켓 20261022_2300)
 */

const VIDEO_EXTENSION_RE = /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i

/**
 * 주어진 URL이 동영상(비디오) 파일인지 판별한다.
 * 쿼리 스트링(?v=...)이나 해시가 붙어 있어도 확장자(.mp4, .webm, .mov, .m4v, .ogg)를 검사한다.
 */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const trimmed = url.trim()
  if (!trimmed) return false

  try {
    const pathname =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? new URL(trimmed).pathname
        : trimmed.split('?')[0].split('#')[0]
    return /\.(mp4|webm|mov|m4v|ogg)$/i.test(pathname)
  } catch {
    return VIDEO_EXTENSION_RE.test(trimmed)
  }
}
