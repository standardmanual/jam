/**
 * 쉐이더 랩 — WebGPU 지원 여부 확인 (티켓 20260912_1951)
 *
 * `@basementstudio/shader-lab` 런타임은 WebGPU 전용이다(WebGL 폴백 없음, 티켓 명시로 이번
 * 범위에서 폴백 렌더러는 만들지 않는다). `navigator.gpu`가 없으면 크래시 대신 안내 화면을
 * 보여준다.
 */
export function isWebGpuSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  return 'gpu' in navigator && navigator.gpu != null
}
