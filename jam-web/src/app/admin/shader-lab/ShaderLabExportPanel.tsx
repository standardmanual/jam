'use client'

/**
 * 쉐이더 랩 — PNG 내보내기 (티켓 20260912_1951)
 *
 * 1차는 로컬 PNG 다운로드만 지원한다(배지/컬렉션/미션 자동 등록은 3차 범위). 1:1 1280×1280
 * 고정 — 캔버스 백킹 스토어 자체가 이미 그 크기다(`ShaderLabViewport` 참고).
 */
import { useState, type RefObject } from 'react'
import { IconDownload } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'

interface ShaderLabExportPanelProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ShaderLabExportPanel({ canvasRef }: ShaderLabExportPanelProps) {
  const [error, setError] = useState<string | null>(null)

  async function downloadPng() {
    setError(null)
    try {
      const canvas = canvasRef.current
      if (!canvas) throw new Error('캔버스를 찾지 못했습니다.')
      const blob = await canvasToBlob(canvas)
      downloadBlob(blob, 'shader-lab.png')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PNG 내보내기에 실패했습니다.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="outline" onClick={downloadPng}>
        <IconDownload className="mr-1 h-4 w-4" />
        PNG 다운로드
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>내보내기 오류</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
