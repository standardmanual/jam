/**
 * 쉐이더 텍스트 생성기 — 거리장 기반 링 텍스처 (티켓 20260912_1742)
 *
 * Brik "LOVE" 레퍼런스와 비교했을 때 디졸브 에코 결과물은 획 내부가 매끈한 단색 면이라는
 * 피드백을 받았다. 에코 합성 실루엣(`buildEchoLayers()`의 `full`)의 경계선까지의 거리를
 * 2-패스 챔퍼 거리 변환으로 구해, 그 거리를 기준으로 밝고 어두운 링이 반복되도록 그리면
 * 레퍼런스의 동심원/등고선 무늬에 가까워진다 — 이 대화 초반에 만든 "리퀴드 메탈"
 * 프로토타입(거리장 기반 동심원 링)의 핵심 기법을 재사용했다(Brik 소스는 참조하지 않음).
 *
 * 스크래치 사본에서 esbuild+Playwright 헤드리스로 렌더링까지 검증한 로직을 어드민 코드
 * 스타일로 옮겼다 — 알고리즘 자체는 프로토타입과 동일하다.
 */
import type { ShaderTextRingParams } from '@/lib/admin/shaderTextDissolve'

/** 거리 변환/링 텍스처를 계산하는 다운샘플 해상도. 원 해상도(1280)에서 그대로 계산하면 느리다. */
export const RING_FIELD_RES = 480

/**
 * 2-패스 챔퍼 거리 변환. `mask[i]===0`인 픽셀까지의 유클리드 근사 거리를 반환한다. 정확한
 * 유클리드 거리 변환보다 훨씬 가벼우면서 링 텍스처 용도로는 충분히 매끄럽다.
 */
function chamferDistance(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e6
  const dist = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) dist[i] = mask[i] === 0 ? 0 : INF
  const D1 = 1
  const D2 = Math.SQRT2

  // 순방향 패스(좌상단 → 우하단)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      const idx = row + x
      let d = dist[idx]
      if (x > 0) d = Math.min(d, dist[idx - 1] + D1)
      if (y > 0) d = Math.min(d, dist[idx - w] + D1)
      if (x > 0 && y > 0) d = Math.min(d, dist[idx - w - 1] + D2)
      if (x < w - 1 && y > 0) d = Math.min(d, dist[idx - w + 1] + D2)
      dist[idx] = d
    }
  }
  // 역방향 패스(우하단 → 좌상단)
  for (let y = h - 1; y >= 0; y--) {
    const row = y * w
    for (let x = w - 1; x >= 0; x--) {
      const idx = row + x
      let d = dist[idx]
      if (x < w - 1) d = Math.min(d, dist[idx + 1] + D1)
      if (y < h - 1) d = Math.min(d, dist[idx + w] + D1)
      if (x < w - 1 && y < h - 1) d = Math.min(d, dist[idx + w + 1] + D2)
      if (x > 0 && y < h - 1) d = Math.min(d, dist[idx + w - 1] + D2)
      dist[idx] = d
    }
  }
  return dist
}

/**
 * `source`(에코 합성 실루엣)를 `RING_FIELD_RES`로 축소해 거리장을 계산하고, 경계 근처에
 * 반복되는 밝고 어두운 링 텍스처를 만들어 원 해상도로 확대한다.
 *
 * 결과 캔버스는 그레이스케일(R=G=B=명암값)이다 — `composeShaderTextDissolve.ts`가 이 값을
 * 그대로 `applyGradientMap()`의 LUT 인덱스(밝기 기반)로 쓴다. 알파는 실루엣 안쪽은
 * 불투명, 바깥쪽은 `outsideRange`만큼 서서히 사라진다.
 *
 * `insideRange`/`outsideRange`는 `canvasSize`(예: 1280)에 대한 비율로 받되, 챔퍼 거리
 * 자체는 축소 해상도(`RING_FIELD_RES`) 공간에서 계산된 값이므로 **원 해상도 비율값을 그대로
 * px 스케일로 곱해 비교한다**(프로토타입에서 실측 검증된 값 그대로 — 별도로 RES/canvasSize
 * 비율을 다시 곱하지 않는다. 곱하면 축소 해상도에서 링이 지나치게 촘촘해진다).
 */
export function buildRingLayer(
  source: HTMLCanvasElement,
  ring: ShaderTextRingParams,
  canvasSize: number
): HTMLCanvasElement {
  const RES = RING_FIELD_RES
  const insideRangePx = Math.max(1, ring.insideRange * canvasSize)
  const outsideRangePx = Math.max(1, ring.outsideRange * canvasSize)

  const result = document.createElement('canvas')
  result.width = source.width
  result.height = source.height

  const bake = document.createElement('canvas')
  bake.width = RES
  bake.height = RES
  const bctx = bake.getContext('2d')
  if (!bctx) return result
  bctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, RES, RES)

  const img = bctx.getImageData(0, 0, RES, RES)
  const n = RES * RES
  const mask = new Uint8Array(n)
  const inv = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const on = img.data[i * 4 + 3] > 32 ? 1 : 0
    mask[i] = on
    inv[i] = on ? 0 : 1
  }
  const insideDist = chamferDistance(mask, RES, RES)
  const outsideDist = chamferDistance(inv, RES, RES)

  const out = bctx.createImageData(RES, RES)
  for (let i = 0; i < n; i++) {
    let field: number
    if (mask[i]) field = 0.5 + 0.5 * Math.min(1, insideDist[i] / insideRangePx)
    else field = 0.5 - 0.5 * Math.min(1, outsideDist[i] / outsideRangePx)
    const d = Math.abs(field - 0.5) * 2 // 0=경계, 1=포화(안/밖)
    const envelope = Math.pow(Math.max(0, 1 - d), ring.decay) // 경계 근처에서만 링이 살아있음
    const phase = d * ring.density
    const frac = phase - Math.floor(phase)
    const ridgeRaw = Math.pow(Math.max(0, 1 - Math.abs(frac - 0.5) * 2), ring.sharpness)
    const flat = mask[i] ? 232 : 0 // 포화 영역의 평평한 값(안쪽=밝게, 바깥=검정)
    const ripple = 6 + (255 - 6) * ridgeRaw
    const v = flat * (1 - envelope) + ripple * envelope
    const alpha = mask[i] ? 255 : Math.round(255 * Math.max(0, 1 - outsideDist[i] / outsideRangePx))
    const p = i * 4
    out.data[p] = v
    out.data[p + 1] = v
    out.data[p + 2] = v
    out.data[p + 3] = alpha
  }
  bctx.putImageData(out, 0, 0)

  const rctx = result.getContext('2d')
  if (rctx) rctx.drawImage(bake, 0, 0, RES, RES, 0, 0, result.width, result.height)
  return result
}
