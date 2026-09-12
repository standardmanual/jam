'use client'

import { useState, type RefObject } from 'react'
import { IconDownload } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'

/** WebM 녹화 길이(초). 짧은 루프 하나면 소재 확인 용도로 충분하다(구현자 재량, 티켓 명시). */
const RECORD_SECONDS = 4
const RECORD_FPS = 30

interface ShaderTextExportPanelProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  /** 애니메이션 관련 옵션이 하나도 켜져 있지 않으면 WebM은 의미가 없다(정지 이미지와 같다). */
  hasAnimation: boolean
  playing: boolean
  onSetPlaying: (playing: boolean) => void
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 내보내기 — PNG(투명 배경 지원) / WebM (티켓 20260912_1532). MP4는 범위 밖(브라우저 인코딩
 * 지원이 갈려 별도 검토 필요, 티켓 명시).
 *
 * 배지 적용(`ShaderTextBadgeApply`)과 별개 동작이다 — 마케팅 소재용으로 그냥 다운로드하는
 * 경로를 따로 둔다(티켓 5절).
 */
export default function ShaderTextExportPanel({ canvasRef, hasAnimation, playing, onSetPlaying }: ShaderTextExportPanelProps) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function downloadPng() {
    setError(null)
    try {
      const canvas = canvasRef.current
      if (!canvas) throw new Error('캔버스를 찾지 못했습니다.')
      const blob = await canvasToBlob(canvas)
      downloadBlob(blob, 'shader-text.png')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PNG 내보내기에 실패했습니다.')
    }
  }

  async function downloadWebm() {
    setError(null)
    const canvas = canvasRef.current
    if (!canvas) {
      setError('캔버스를 찾지 못했습니다.')
      return
    }
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      setError('이 브라우저는 WebM 녹화를 지원하지 않아요.')
      return
    }

    setRecording(true)
    const wasPlaying = playing
    onSetPlaying(true)
    try {
      // 재생 루프(rAF)가 붙을 시간을 잠깐 준다 — 곧바로 captureStream을 시작하면 첫 프레임이
      // 정지 프레임으로 녹화될 수 있다.
      await new Promise((resolve) => setTimeout(resolve, 80))

      const stream = canvas.captureStream(RECORD_FPS)
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
      })
      recorder.start()
      await new Promise((resolve) => setTimeout(resolve, RECORD_SECONDS * 1000))
      recorder.stop()
      await stopped

      downloadBlob(new Blob(chunks, { type: 'video/webm' }), 'shader-text.webm')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'WebM 녹화에 실패했습니다.')
    } finally {
      onSetPlaying(wasPlaying)
      setRecording(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={downloadPng}>
          <IconDownload className="h-4 w-4 mr-1" />
          PNG 다운로드
        </Button>
        <Button type="button" variant="outline" onClick={downloadWebm} disabled={!hasAnimation || recording}>
          <IconDownload className="h-4 w-4 mr-1" />
          {recording ? `녹화 중… (${RECORD_SECONDS}초)` : 'WebM 다운로드'}
        </Button>
        {!hasAnimation && (
          <span className="text-xs text-muted-foreground">
            애니메이션 옵션(메인 문구·에코·노이즈)이 꺼져 있으면 WebM은 정지 이미지와 같아 비활성화돼요.
          </span>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>내보내기 오류</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
