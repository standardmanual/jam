'use client'

/**
 * JAM! 에셋 제너레이터 — PNG·영상 저장 (티켓 20260924_2156)
 *
 * 원본: docs/assets/prototypes/20260924_jam-asset-generator.html
 * (pngBtn 클릭 처리 523줄, loadMuxer 533줄, pickCodec 544줄, exportPrecise 558줄,
 * exportRealtime 602줄, videoBtn 클릭 처리 631줄, readSeconds 515줄).
 *
 * 영상 저장은 프로토타입과 같은 mp4-muxer@5.2.2 CDN URL·무결성 해시를 그대로 쓴다
 * (`MP4_MUXER_SCRIPT_URL`·`MP4_MUXER_SCRIPT_INTEGRITY`, assetGeneratorHelpers.ts).
 * WebCodecs(H.264 정밀 인코딩)를 쓸 수 없는 브라우저에서는 MediaRecorder 실시간 녹화로
 * 대체한다 — 두 경로 모두 프로토타입과 동일하다.
 *
 * 이미지 레이어 로드 대기(재작업, 20260924_2157): 캡처 직전에
 * `viewport.areImageAssetsReady()`로 확인하고, 아직 로드 중이면 안내 토스트를 띄운 뒤
 * `waitForImageAssets()`로 기다렸다가 캡처한다(버튼은 `busy`로 이미 잠겨 있다). 기다린
 * 뒤에도 로드에 실패한 레이어가 있으면(`getMissingImageAssetCount`) 조용히 건너뛰지 않고
 * 오류 토스트로 알린다.
 *
 * 텍스트 레이어 폰트 로드 대기(티켓 20260924_2158): 같은 패턴을 `areFontsReady`·
 * `waitForFonts`·`getMissingFontCount`로 그대로 반복한다 — 구글 폰트 다운로드가 끝나기 전에
 * PNG·영상을 캡처하면 폴백 글꼴로 저장될 수 있기 때문이다(완료 조건).
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { IconPhoto, IconVideo } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'
import type { RibbonLayerConfig, StageRatio } from '@/lib/asset-generator'
import type { AssetGeneratorViewportHandle } from './AssetGeneratorViewport'
import {
  buildExportFileName,
  clampDurationSeconds,
  DEFAULT_VIDEO_DURATION_SECONDS,
  H264_CODEC_CANDIDATES,
  MP4_MUXER_SCRIPT_INTEGRITY,
  MP4_MUXER_SCRIPT_URL,
  resolveStageSize,
  VIDEO_BITRATE_BPS,
  VIDEO_FPS,
} from './assetGeneratorHelpers'

// mp4-muxer(MIT)를 CDN script로 불러온 뒤 window에 붙는 전역 — 실제 npm 의존성으로 설치하지
// 않고 프로토타입과 같은 방식(런타임 CDN 로드)을 그대로 쓰므로, 여기서만 최소 타입을 선언한다.
interface Mp4MuxerTarget {
  buffer: ArrayBuffer
}
interface Mp4MuxerInstance {
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void
  finalize(): void
  target: Mp4MuxerTarget
}
interface Mp4MuxerNamespace {
  ArrayBufferTarget: new () => Mp4MuxerTarget
  Muxer: new (options: {
    target: Mp4MuxerTarget
    video: { codec: 'avc'; width: number; height: number; frameRate: number }
    fastStart: 'in-memory'
    firstTimestampBehavior: 'offset'
  }) => Mp4MuxerInstance
}
declare global {
  interface Window {
    Mp4Muxer?: Mp4MuxerNamespace
  }
}

interface AssetGeneratorExportProps {
  viewportRef: React.RefObject<AssetGeneratorViewportHandle | null>
  stageRatio: StageRatio
  layer: RibbonLayerConfig
  play: boolean
  onPlayChange: (play: boolean) => void
  /** 영상을 만드는 동안 설정 패널을 잠근다(원본 panel.inert, 635줄). */
  onExportingChange: (exporting: boolean) => void
}

interface VideoExportResult {
  blob: Blob
  ext: string
  how: string
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 캡처 전에 이미지 레이어 원본 로드를 기다린다(재작업, 20260924_2157). 이미 다 불러왔으면
 * 즉시 반환한다 — 대부분의 경우 안내 토스트 없이 조용히 지나간다. */
async function ensureImageAssetsReady(viewport: AssetGeneratorViewportHandle): Promise<void> {
  if (viewport.areImageAssetsReady()) return
  toast.info('이미지를 불러오는 중이에요. 완료되면 자동으로 진행할게요.')
  await viewport.waitForImageAssets()
}

/** 기다린 뒤에도 로드에 실패해 저장 결과에서 빠지는 레이어가 있으면 오류로 알린다(조용히
 * 건너뛰지 않는다). */
function warnIfImageAssetsMissing(viewport: AssetGeneratorViewportHandle): void {
  const missing = viewport.getMissingImageAssetCount()
  if (missing > 0) {
    toast.error(`이미지 레이어 ${missing}개를 불러오지 못해 저장 결과에서 빠졌어요.`)
  }
}

/** 캡처 전에 텍스트 레이어의 구글 폰트 다운로드를 기다린다(티켓 20260924_2158). 이미 다
 * 불러왔으면 즉시 반환한다. */
async function ensureFontsReady(viewport: AssetGeneratorViewportHandle): Promise<void> {
  if (viewport.areFontsReady()) return
  toast.info('폰트를 불러오는 중이에요. 완료되면 자동으로 진행할게요.')
  await viewport.waitForFonts()
}

/** 기다린 뒤에도 로드에 실패해 폴백 글꼴로 저장되는 텍스트 레이어가 있으면 오류로 알린다. */
function warnIfFontsMissing(viewport: AssetGeneratorViewportHandle): void {
  const missing = viewport.getMissingFontCount()
  if (missing > 0) {
    toast.error(`텍스트 레이어 ${missing}개의 폰트를 불러오지 못해 기본 글꼴로 저장했어요.`)
  }
}

function loadMp4MuxerScript(): Promise<void> {
  if (window.Mp4Muxer) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = MP4_MUXER_SCRIPT_URL
    script.integrity = MP4_MUXER_SCRIPT_INTEGRITY
    script.crossOrigin = 'anonymous'
    script.onload = () => (window.Mp4Muxer ? resolve() : reject(new Error('MP4 라이브러리를 불러오지 못했어요.')))
    script.onerror = () => reject(new Error('MP4 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'))
    document.head.appendChild(script)
  })
}

async function pickSupportedCodec(width: number, height: number): Promise<string | null> {
  for (const codec of H264_CODEC_CANDIDATES) {
    try {
      const result = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: VIDEO_BITRATE_BPS, framerate: VIDEO_FPS })
      if (result.supported) return codec
    } catch {
      // 다음 후보를 시도한다
    }
  }
  return null
}

/** 정밀 인코딩(원본 exportPrecise, 558줄): 머리 위치를 1/60초씩 정확히 이동해 프레임을 그린다. */
async function exportVideoPrecise(
  seconds: number,
  viewport: AssetGeneratorViewportHandle,
  layer: RibbonLayerConfig,
  width: number,
  height: number,
  onProgress: (ratio: number) => void
): Promise<VideoExportResult> {
  await loadMp4MuxerScript()
  const codec = await pickSupportedCodec(width, height)
  if (!codec) throw new Error('이 브라우저에서는 H.264 인코딩을 쓸 수 없어요.')
  const Mp4Muxer = window.Mp4Muxer
  if (!Mp4Muxer) throw new Error('MP4 라이브러리를 불러오지 못했어요.')

  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: VIDEO_FPS },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  })
  let encodeError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e instanceof Error ? e : new Error(String(e))
    },
  })
  encoder.configure({ codec, width, height, bitrate: VIDEO_BITRATE_BPS, framerate: VIDEO_FPS })

  const total = Math.round(seconds * VIDEO_FPS)
  const startHead = viewport.getHead()
  const pathTotal = viewport.getPathTotal()
  viewport.setExporting(true)
  try {
    for (let i = 0; i < total; i++) {
      if (encodeError) throw encodeError as Error
      const head = pathTotal > 0 ? (startHead + (layer.speed * i) / VIDEO_FPS) % pathTotal : 0
      viewport.drawAtHead(head)
      const canvas = viewport.getCanvas()
      if (!canvas) throw new Error('캔버스를 찾지 못했어요.')
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / VIDEO_FPS),
        duration: Math.round(1e6 / VIDEO_FPS),
      })
      encoder.encode(frame, { keyFrame: i % (VIDEO_FPS * 2) === 0 })
      frame.close()
      while (encoder.encodeQueueSize > 8) await wait(4)
      if (i % 6 === 0) {
        onProgress(i / total)
        await wait(0)
      }
    }
    await encoder.flush()
    if (encodeError) throw encodeError as Error
    muxer.finalize()
  } finally {
    try {
      encoder.close()
    } catch {
      // 이미 닫혔으면 무시한다
    }
    viewport.setExporting(false)
    viewport.setHead(startHead)
  }
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', how: '정밀 인코딩, H.264' }
}

/** 대체 경로(원본 exportRealtime, 602줄): 화면에 재생되는 모습을 그대로 녹화한다. */
function exportVideoRealtime(
  seconds: number,
  viewport: AssetGeneratorViewportHandle,
  wasPlaying: boolean,
  onPlayChange: (play: boolean) => void,
  onProgress: (ratio: number) => void
): Promise<VideoExportResult> {
  return new Promise((resolve, reject) => {
    const canvas = viewport.getCanvas()
    if (!canvas || !window.MediaRecorder || !canvas.captureStream) {
      reject(new Error('이 브라우저는 영상 녹화를 지원하지 않아요.'))
      return
    }
    const candidates = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    const type = candidates.find((t) => MediaRecorder.isTypeSupported(t))
    if (!type) {
      reject(new Error('녹화할 수 있는 영상 형식이 없어요.'))
      return
    }
    const stream = canvas.captureStream(VIDEO_FPS)
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: VIDEO_BITRATE_BPS })
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    recorder.onerror = (e) => {
      const error = (e as ErrorEvent).error
      reject(error instanceof Error ? error : new Error('녹화 중 오류가 발생했어요.'))
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      onPlayChange(wasPlaying)
      const isMp4 = type.includes('mp4')
      resolve({ blob: new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' }), ext: isMp4 ? 'mp4' : 'webm', how: '실시간 녹화' })
    }
    onPlayChange(true)
    recorder.start(100)
    const startedAt = performance.now()
    const tick = () => {
      const ratio = (performance.now() - startedAt) / (seconds * 1000)
      onProgress(Math.min(1, ratio))
      if (ratio >= 1) recorder.stop()
      else setTimeout(tick, 100)
    }
    tick()
  })
}

export default function AssetGeneratorExport({
  viewportRef,
  stageRatio,
  layer,
  play,
  onPlayChange,
  onExportingChange,
}: AssetGeneratorExportProps) {
  const [busy, setBusy] = useState(false)
  const [pngLabel, setPngLabel] = useState<string | null>(null)
  const [videoLabel, setVideoLabel] = useState<string | null>(null)
  const [durationInput, setDurationInput] = useState(DEFAULT_VIDEO_DURATION_SECONDS)

  async function handleDownloadPng() {
    const viewport = viewportRef.current
    if (!viewport || busy) return
    setBusy(true)
    setPngLabel('다운로드하는 중')
    try {
      await ensureImageAssetsReady(viewport)
      warnIfImageAssetsMissing(viewport)
      await ensureFontsReady(viewport)
      warnIfFontsMissing(viewport)
      viewport.drawAtHead(viewport.getHead())
      const canvas = viewport.getCanvas()
      if (!canvas) throw new Error('캔버스를 찾지 못했어요.')
      const blob = await canvasToBlob(canvas)
      downloadBlob(blob, buildExportFileName(stageRatio, 'png', new Date()))
      toast.success(`PNG를 다운로드했어요 (${canvas.width} × ${canvas.height}px).`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PNG를 만들지 못했어요.')
    } finally {
      setPngLabel(null)
      setBusy(false)
    }
  }

  async function handleDownloadVideo() {
    const viewport = viewportRef.current
    if (!viewport || busy) return
    const seconds = clampDurationSeconds(durationInput)
    setDurationInput(seconds)
    setBusy(true)
    onExportingChange(true)
    setVideoLabel('다운로드하는 중')
    const wasPlaying = play
    const { width, height } = resolveStageSize(stageRatio)
    let fallbackNote = ''
    try {
      await ensureImageAssetsReady(viewport)
      warnIfImageAssetsMissing(viewport)
      await ensureFontsReady(viewport)
      warnIfFontsMissing(viewport)
      let result: VideoExportResult | null = null
      if (typeof window !== 'undefined' && window.VideoEncoder && window.VideoFrame) {
        try {
          result = await exportVideoPrecise(seconds, viewport, layer, width, height, (ratio) =>
            setVideoLabel(`다운로드하는 중 ${Math.round(ratio * 100)}%`)
          )
        } catch (e) {
          fallbackNote = ` (정밀 인코딩 실패: ${e instanceof Error ? e.message : String(e)})`
        }
      }
      if (!result) {
        result = await exportVideoRealtime(seconds, viewport, wasPlaying, onPlayChange, (ratio) =>
          setVideoLabel(`다운로드하는 중 ${Math.round(ratio * 100)}%`)
        )
      }
      downloadBlob(result.blob, buildExportFileName(stageRatio, result.ext, new Date()))
      toast.success(
        `${seconds}초 영상을 다운로드했어요 (${width} × ${height}px, ${VIDEO_FPS}fps, ${result.how})${fallbackNote}.`
      )
    } catch (e) {
      toast.error(`영상을 만들지 못했어요: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setVideoLabel(null)
      setBusy(false)
      onExportingChange(false)
      onPlayChange(wasPlaying)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={handleDownloadPng} disabled={busy}>
          <IconPhoto className="h-4 w-4" />
          {pngLabel ?? 'PNG 다운로드'}
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={handleDownloadVideo} disabled={busy}>
          <IconVideo className="h-4 w-4" />
          {videoLabel ?? '영상 다운로드'}
        </Button>
      </div>
      <label className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        영상 길이
        <Input
          type="number"
          min={1}
          max={60}
          step={1}
          value={durationInput}
          onChange={(e) => setDurationInput(Number(e.target.value))}
          onBlur={() => setDurationInput(clampDurationSeconds(durationInput))}
          disabled={busy}
          className="h-8 w-16 text-right"
          aria-label="영상 길이(초)"
        />
        초
      </label>
    </div>
  )
}
