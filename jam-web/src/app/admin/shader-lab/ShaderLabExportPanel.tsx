'use client'

// 쉐이더 랩 -> PNG 내보내기 + 배지/미션/컬렉션 적용 (티켓 20260912_1951, 20260913_0414)
// 로컬 PNG 다운로드는 그대로 유지하고, 배지/미션/컬렉션(아이템북) 대표이미지로 곧바로
// 적용하는 탭 3종을 추가했다(3차, 티켓 20260913_0414). 1:1 1280x1280 고정 - 캔버스 백킹
// 스토어 자체가 이미 그 크기다(ShaderLabViewport 참고).
import { useState, type RefObject } from 'react'
import { IconDownload } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'
import ShaderLabApplyTab from './ShaderLabApplyTab'

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
          <ShaderLabApplyTab target="badge" canvasRef={canvasRef} />
        </TabsContent>
        <TabsContent value="mission">
          <ShaderLabApplyTab target="mission" canvasRef={canvasRef} />
        </TabsContent>
        <TabsContent value="collection">
          <ShaderLabApplyTab target="collection" canvasRef={canvasRef} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
