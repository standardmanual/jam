/**
 * 배경 제너레이터 "애니메이션 모드" 미리보기를 짧은 반복 재생 MP4(H.264)로 굽는(bake) 유틸
 * (20260819_012).
 *
 * 티켓 20260819_008의 `bakePreviewToBlob`(정지 PNG)의 후속이다. 정적 패턴 모드는 계속 PNG만
 * 굽고, 애니메이션 모드만 이 유틸로 영상을 굽는다.
 *
 * ── 인코딩 방식 선택 근거 (MediaRecorder vs WebCodecs + mp4-muxer) ──────────────────────
 * - `MediaRecorder` + `canvas.captureStream()`: 구현은 가장 짧지만 Chrome/Firefox에서 나오는
 *   컨테이너가 WebM(VP8/VP9)이다. 최종 결과물은 **iOS Safari에서 재생돼야 하므로** WebM은
 *   부적합하다. 또 프레임레이트·비트레이트·키프레임 간격을 정밀하게 통제할 수 없어 "용량
 *   최적화가 핵심 요구사항"이라는 이번 티켓의 목표와 맞지 않는다.
 * - **WebCodecs `VideoEncoder` + `mp4-muxer`(채택)**: H.264를 직접 인코딩해 MP4로 먹싱한다.
 *   코덱 프로파일/레벨·목표 비트레이트·프레임레이트·키프레임 위치를 전부 명시할 수 있고,
 *   프레임을 배열로 들고 있다가 순서를 바꿔 인코딩하는 것(아래 왕복 루프)도 가능하다.
 *   티켓 20260819_002에서 이식 원본으로 삼은 collidingScopes 리포의 `videoExportFunctions.js`도
 *   같은 조합(mp4-muxer)을 쓴다.
 *   단점은 브라우저 지원 범위다 — 어드민 저작 도구라 Chrome/Edge를 전제할 수 있고, 미지원
 *   브라우저에서는 저장 전에 명확한 안내 메시지를 띄운다(`isBackgroundVideoBakeSupported`).
 *
 * ── 용량 최적화 레버 (Chromium 실측 기반, 20260819_012) ──────────────────────────────
 * 목표: 결과 MP4 500KB 이하. 아래 레버를 전부 실측해 조합했다(측정값은 만화경 기본 설정 /
 * 디테일이 가장 촘촘한 최악 설정 두 가지 기준).
 *
 * - **프레임레이트 15fps**: 60fps는 배경 애니메이션에 필요 없다. 다만 15fps 아래로 더 낮추는 건
 *   역효과였다 — 12fps는 프레임 수가 줄어드는 대신 프레임 간 움직임이 커져 오히려 커졌다
 *   (424KB → 475KB). 그래서 15fps에서 멈췄다.
 * - **길이 2.0초(전진 16프레임 + 되감기 14프레임 = 30프레임)**: 가장 효과가 확실한 레버다.
 *   같은 조건에서 4.0초 917KB → 2.9초 664KB → 2.0초 424KB. 티켓이 제시한 2~4초 범위의 하한을
 *   택했다.
 * - **세로 타일 2장**: 3장(430×1290)은 같은 조건에서 588KB, 2장(430×860)은 424KB였다. 2장이면
 *   860px까지 덮어 현행 모바일 뷰포트를 사실상 모두 커버하고, 남는 아래쪽은 CSS 배경(poster)이
 *   같은 430px 주기로 이어받아 끊김 없이 채운다.
 * - **해상도는 저작 폭(SERVICE_WIDTH=430px) 그대로 유지**: 폭을 344px로 줄이면 285KB까지
 *   떨어지지만(-33%), 유저단에서 CSS로 확대되므로 같은 자리에 먼저 그려지는 poster PNG(430px)
 *   보다 흐려져 영상이 로드되는 순간 화질이 눈에 띄게 떨어진다. 이미 목표치(500KB) 안에 들어와
 *   있어 채택하지 않았다.
 * - **비트레이트 상한은 실측상 거의 듣지 않았다**: 700kbps→400kbps로 낮춰도 1317KB→1219KB로
 *   결과가 거의 그대로였다(Chromium H.264 인코더가 품질 우선으로 동작). `bitrateMode:'constant'`
 *   도 차이가 없었고 `'quantizer'`(QP 직접 지정)는 아예 미지원이었다. 그래서 용량은 위의 길이·
 *   타일 수로 통제하고, 비트레이트는 이 값을 존중하는 브라우저를 위한 상한으로만 남겼다.
 * - **코덱은 H.264 고정**(Main→Baseline 순으로 지원 여부 탐색). HEVC/AV1은 더 작지만 재생
 *   호환성 리스크가 있어 이번 범위에서 제외했다.
 * - **키프레임은 첫 프레임 1개만** 둔다. 루프 재생은 항상 0초로 되감기므로 중간 키프레임이
 *   필요 없고, 키프레임이 적을수록 파일이 작다.
 *
 * ── 왕복(ping-pong) 루프로 이음매 없애기 ────────────────────────────────────────────
 * kaleidoscope 엔진의 오프셋은 `sin((counter / animationSpeed) * PI) * 600`이고 counter는 한
 * 프레임에 2씩 증가한다 — 즉 한 주기가 `animationSpeed` 프레임이다. 기본값(speed 3, numTiles 5)
 * 에서 animationSpeed는 5333이라 한 주기가 60fps 기준 약 89초다. 2~4초짜리 루프를 정현파 주기에
 * 맞추는 것은 불가능하고, counter를 임의로 건너뛰어 한 주기를 4초에 압축하면 저작자가 지정한
 * 애니메이션 속도가 무시된다(속도 슬라이더가 결과물에 반영되지 않게 된다).
 *
 * 그래서 **실시간 속도 그대로 N프레임을 캡처한 뒤, 끝점을 중복시키지 않고 되감아 붙인다**
 * (0..N-1, N-2..1). 루프가 되감길 때 마지막 프레임(1번 타일) 다음이 첫 프레임(0번 타일)이라
 * 정확히 한 프레임 분량만 진행하므로, 파라미터와 무관하게 항상 위치 점프가 없는 루프가 된다.
 * 대신 루프 양 끝에서 진행 방향이 뒤집힌다 — 원본 애니메이션 자체가 정현파 왕복 운동이라 방향
 * 전환은 원래 있는 움직임이고, 위치가 튀는 것보다 훨씬 덜 눈에 띈다.
 *
 * ── 캡처 대상 ──────────────────────────────────────────────────────────────────────
 * `bakePreviewToBlob`과 동일하게 **지금 미리보기에 보이는 그대로**를 캡처한다. 별도 오프스크린
 * 렌더러를 새로 만들지 않는다(티켓 20260819_008 원칙 유지).
 */

import { ArrayBufferTarget, Muxer } from 'mp4-muxer'

/** 출력 프레임레이트 — 배경 애니메이션에 충분하면서 용량을 가장 크게 줄이는 값 */
export const BACKGROUND_VIDEO_FPS = 15

/** 되감기 전(전진 구간) 캡처 프레임 수. 최종 프레임 수는 `2 * N - 2`가 된다 */
export const BACKGROUND_VIDEO_FORWARD_FRAMES = 16

/** 최종 프레임 수 — 16 + 14 = 30프레임 = 2.0초 @15fps */
export const BACKGROUND_VIDEO_TOTAL_FRAMES = BACKGROUND_VIDEO_FORWARD_FRAMES * 2 - 2

/**
 * 세로 타일 반복 횟수. 유저단 배경 레이어는 앱 컬럼 폭(430px) × 뷰포트 높이라 세로로 2배쯤
 * 길다. CSS `background-repeat`는 `<video>`에 쓸 수 없으므로, 굽는 시점에 정사각 프레임을
 * 세로로 2번 이어붙여 430×860 영상으로 만든다. 유저단은 `width:100%; height:auto`로 두기만
 * 하면 원본 비율(1:2)이 유지돼 티켓 20260819_011의 `100% auto` + 세로 repeat와 같은 그림이 된다.
 * 860px를 넘어가는 아래쪽은 같은 레이어에 깔린 CSS 배경(poster)이 동일한 430px 주기로 이어받아
 * 위치가 어긋나지 않는다(860 = 430 × 2라 타일 경계가 정확히 맞는다).
 */
export const BACKGROUND_VIDEO_TILE_ROWS = 2

/**
 * 목표 비트레이트(bps) 상한. 실측상 Chromium H.264 인코더는 이 값을 거의 따르지 않았지만
 * (파일 상단 "용량 최적화 레버" 참고), 값을 존중하는 브라우저/기기를 위해 상한으로 남겨 둔다.
 */
export const BACKGROUND_VIDEO_BITRATE = 700_000

/**
 * 지원 여부 탐색 순서. Main(CABAC)이 같은 비트레이트에서 Baseline보다 압축률이 좋아 먼저 시도하고,
 * 실패 시 가장 호환성이 넓은 Baseline으로 떨어진다. 둘 다 iOS Safari에서 문제없이 재생된다.
 * 레벨 3.1 — 430×860은 1458 매크로블록으로 3.1 상한(3600MB) 안에 넉넉히 들어간다.
 */
const CODEC_CANDIDATES = ['avc1.4D001F', 'avc1.42001F'] as const

export interface BakedBackgroundVideo {
  /** 반복 재생용 MP4(H.264) */
  video: Blob
  /** 첫 프레임 정지 PNG(정사각 1타일) — `<video poster>` / 폴백 / reduced-motion 대체용 */
  poster: Blob
  /** 최종 프레임 수 */
  frameCount: number
  /** 최종 길이(초) */
  durationSec: number
}

export type BakeProgressPhase = 'capture' | 'encode'

export type BakeProgressHandler = (phase: BakeProgressPhase, done: number, total: number) => void

/** WebCodecs `VideoEncoder`를 쓸 수 있는 브라우저인지 — 없으면 영상 굽기를 아예 시도하지 않는다 */
export function isBackgroundVideoBakeSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.VideoEncoder !== 'undefined'
}

/**
 * 미리보기 컨테이너 안에서 실제로 캡처할 노드를 찾는다 — `bakePreviewToBlob`과 동일한 규칙.
 * Paper 필터가 적용돼 있으면 셰이더 `<canvas>`, 필터가 없으면 평면화 결과 `<img>`다.
 */
function findPreviewSource(container: HTMLElement): HTMLCanvasElement | HTMLImageElement {
  const canvas = container.querySelector('canvas')
  if (canvas) return canvas
  const img = container.querySelector('img')
  if (img) return img
  throw new Error('구울 배경 미리보기를 찾지 못했습니다.')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * 미리보기를 실시간 속도 그대로 프레임레이트만 낮춰 캡처한다. 저작자가 지정한 애니메이션 속도를
 * 그대로 보존하기 위해 counter를 임의로 건너뛰지 않는다(파일 상단 "왕복 루프" 참고).
 */
async function captureTiles(
  source: HTMLCanvasElement | HTMLImageElement,
  tileSize: number,
  count: number,
  onProgress?: BakeProgressHandler
): Promise<ImageBitmap[]> {
  const bitmaps: ImageBitmap[] = []
  const interval = 1000 / BACKGROUND_VIDEO_FPS
  const startedAt = performance.now()

  for (let i = 0; i < count; i++) {
    const waitMs = startedAt + i * interval - performance.now()
    if (waitMs > 0) await sleep(waitMs)

    try {
      // 셰이더 캔버스는 devicePixelRatio 배율로 잡혀 있을 수 있으므로 항상 저작 폭으로 정규화한다
      bitmaps.push(
        await createImageBitmap(source, {
          resizeWidth: tileSize,
          resizeHeight: tileSize,
          resizeQuality: 'high',
        })
      )
    } catch {
      // data URL 교체 직후처럼 순간적으로 디코딩되지 않은 프레임은 직전 프레임으로 대체한다
      const previous = bitmaps[bitmaps.length - 1]
      if (!previous) throw new Error('배경 미리보기 프레임을 읽지 못했습니다. 잠시 후 다시 시도해주세요.')
      bitmaps.push(previous)
    }

    onProgress?.('capture', i + 1, count)
  }

  return bitmaps
}

/** 캡처한 정사각 타일을 세로로 이어붙인 뒤 H.264로 인코딩하고 MP4로 먹싱한다 */
async function encodeTiles(
  tiles: ImageBitmap[],
  tileSize: number,
  onProgress?: BakeProgressHandler
): Promise<Blob> {
  const width = tileSize
  const height = tileSize * BACKGROUND_VIDEO_TILE_ROWS

  // 전진 후 되감기 — 끝점(0, N-1)은 중복시키지 않는다
  const order: number[] = []
  for (let i = 0; i < tiles.length; i++) order.push(i)
  for (let i = tiles.length - 2; i >= 1; i--) order.push(i)

  let codec: string | null = null
  for (const candidate of CODEC_CANDIDATES) {
    const support = await window.VideoEncoder.isConfigSupported({
      codec: candidate,
      width,
      height,
      bitrate: BACKGROUND_VIDEO_BITRATE,
      framerate: BACKGROUND_VIDEO_FPS,
    })
    if (support.supported) {
      codec = candidate
      break
    }
  }
  if (!codec) {
    throw new Error('이 브라우저에서는 H.264 영상을 만들 수 없습니다. Chrome 또는 Edge 최신 버전에서 저장해주세요.')
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: BACKGROUND_VIDEO_FPS },
    // moov 박스를 파일 앞에 둔다 — 모바일 브라우저가 전체를 받기 전에 재생을 시작할 수 있다
    fastStart: 'in-memory',
  })

  let encodeError: Error | null = null
  const encoder = new window.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encodeError = err instanceof Error ? err : new Error(String(err))
    },
  })

  encoder.configure({
    codec,
    width,
    height,
    bitrate: BACKGROUND_VIDEO_BITRATE,
    // bitrateMode는 지정하지 않는다 — 'constant'는 실측상 결과 크기가 달라지지 않았고
    // 'quantizer'는 미지원이라, 브라우저별 지원 편차만 늘리는 값이 된다 (20260819_012 실측).
    framerate: BACKGROUND_VIDEO_FPS,
    latencyMode: 'quality',
    avc: { format: 'avc' },
  })

  const stage = document.createElement('canvas')
  stage.width = width
  stage.height = height
  const stageCtx = stage.getContext('2d')
  if (!stageCtx) throw new Error('배경 영상을 만들 캔버스를 준비하지 못했습니다.')

  const frameDurationUs = Math.round(1_000_000 / BACKGROUND_VIDEO_FPS)

  for (let i = 0; i < order.length; i++) {
    if (encodeError) throw encodeError

    const tile = tiles[order[i]]
    for (let row = 0; row < BACKGROUND_VIDEO_TILE_ROWS; row++) {
      stageCtx.drawImage(tile, 0, row * tileSize, tileSize, tileSize)
    }

    const frame = new window.VideoFrame(stage, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    })
    // 키프레임은 첫 프레임 1개뿐 — 루프는 항상 0초로 되감기므로 중간 키프레임이 필요 없다
    encoder.encode(frame, { keyFrame: i === 0 })
    frame.close()

    // 인코더 큐가 밀리면 메모리가 급증하므로 적당히 흘려보낸다
    if (encoder.encodeQueueSize > 8) await sleep(0)
    onProgress?.('encode', i + 1, order.length)
  }

  await encoder.flush()
  encoder.close()
  if (encodeError) throw encodeError

  muxer.finalize()
  return new Blob([muxer.target.buffer], { type: 'video/mp4' })
}

/** 첫 프레임 타일 1장을 정지 PNG로 굽는다 — poster / 폴백 / reduced-motion 대체용 */
function tileToPosterBlob(tile: ImageBitmap, tileSize: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = tileSize
  canvas.height = tileSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('배경 poster 이미지를 만들 캔버스를 준비하지 못했습니다.')
  ctx.drawImage(tile, 0, 0, tileSize, tileSize)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('배경 poster 이미지를 만들지 못했습니다.'))
    }, 'image/png')
  })
}

/**
 * 미리보기 컨테이너를 반복 재생 MP4 + poster PNG로 굽는다.
 *
 * @param container 배경 레이어 DOM 노드(`bakePreviewToBlob`과 동일한 노드를 넘긴다)
 * @param tileSize  정사각 타일 한 변의 px — 실제 서비스 앱 컬럼 폭(SERVICE_WIDTH)
 */
export async function bakeBackgroundVideo(
  container: HTMLElement,
  tileSize: number,
  onProgress?: BakeProgressHandler
): Promise<BakedBackgroundVideo> {
  if (!isBackgroundVideoBakeSupported()) {
    throw new Error('이 브라우저에서는 배경 영상을 만들 수 없습니다. Chrome 또는 Edge 최신 버전에서 저장해주세요.')
  }

  const source = findPreviewSource(container)
  const tiles = await captureTiles(source, tileSize, BACKGROUND_VIDEO_FORWARD_FRAMES, onProgress)

  try {
    const video = await encodeTiles(tiles, tileSize, onProgress)
    const poster = await tileToPosterBlob(tiles[0], tileSize)
    return {
      video,
      poster,
      frameCount: BACKGROUND_VIDEO_TOTAL_FRAMES,
      durationSec: BACKGROUND_VIDEO_TOTAL_FRAMES / BACKGROUND_VIDEO_FPS,
    }
  } finally {
    // 캡처 실패로 같은 비트맵이 중복 저장됐을 수 있으므로 중복 close를 피한다
    for (const tile of new Set(tiles)) tile.close()
  }
}
