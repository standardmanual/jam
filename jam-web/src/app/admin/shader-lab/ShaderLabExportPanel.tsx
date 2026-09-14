'use client'

// 쉐이더 랩 -> PNG 내보내기 + 배지/미션/컬렉션 적용 (티켓 20260912_1951, 20260913_0414)
// 로컬 PNG 다운로드는 그대로 유지하고, 배지/미션/컬렉션(아이템북) 대표이미지로 곧바로
// 적용하는 탭 3종을 추가했다(3차, 티켓 20260913_0414). 1:1 1920x1920 고정(티켓 20260914_1045,
// 1280에서 상향) - 캔버스 백킹 스토어 자체가 이미 그 크기다(ShaderLabViewport 참고).
// PNG 투명배경 근본 원인 수정(티켓 20260914_1139): WebGPU 캔버스를 `canvas.toBlob()`로 직접
// 읽으면 premultiplied swap chain 문제로 alpha가 항상 255로 고정된다 — 렌더타겟 raw 픽셀을
// 직접 읽는 `captureFrameRef`(`useShaderLabPlayback.ts`가 노출)를 대신 쓴다.
import { useState, type RefObject } from 'react'
import { IconDownload } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import { captureShaderLabFrameToBlob, type ShaderLabCaptureFrameFn } from '@/lib/admin/shaderLab/captureShaderLabFrameToBlob'
import ShaderLabApplyTab from './ShaderLabApplyTab'

interface ShaderLabExportPanelProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  captureFrameRef: RefObject<ShaderLabCaptureFrameFn | null>
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ShaderLabExportPanel({ canvasRef, captureFrameRef }: ShaderLabExportPanelProps) {
  const [error, setError] = useState<string | null>(null)

  async function downloadPng() {
    setError(null)
    try {
      const canvas = canvasRef.current
      const captureFrame = captureFrameRef.current
      if (!canvas) throw new Error('캔버스를 찾지 못했습니다.')
      if (!captureFrame) throw new Error('렌더러가 아직 준비되지 않았습니다.')
      const blob = await captureShaderLabFrameToBlob(captureFrame, canvas.width, canvas.height)
      downloadBlob(blob, 'shader-lab.png')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PNG 내보내기에 실패했습니다.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
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

      <Tabs defaultValue="badge">
        <TabsList>
          <TabsTrigger value="badge">배지 이미지</TabsTrigger>
          <TabsTrigger value="mission">미션 대표이미지</TabsTrigger>
          <TabsTrigger value="collection">컬렉션 대표이미지</TabsTrigger>
        </TabsList>
        <TabsContent value="badge">
          <ShaderLabApplyTab target="badge" canvasRef={canvasRef} captureFrameRef={captureFrameRef} />
        </TabsContent>
        <TabsContent value="mission">
          <ShaderLabApplyTab target="mission" canvasRef={canvasRef} captureFrameRef={captureFrameRef} />
        </TabsContent>
        <TabsContent value="collection">
          <ShaderLabApplyTab target="collection" canvasRef={canvasRef} captureFrameRef={captureFrameRef} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
