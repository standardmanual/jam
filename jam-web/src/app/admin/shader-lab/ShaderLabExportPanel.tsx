'use client'

// 쉐이더 랩 -> PNG 내보내기 + 배지/미션/컬렉션 적용 (티켓 20260912_1951, 20260913_0414)
// 로컬 PNG 다운로드는 그대로 유지하고, 배지/미션/컬렉션(아이템북) 대표이미지로 곧바로
// 적용하는 탭 3종을 추가했다(3차, 티켓 20260913_0414). 1:1 1920x1920 고정(티켓 20260914_1045,
// 1280에서 상향) - 캔버스 백킹 스토어 자체가 이미 그 크기다(ShaderLabViewport 참고).
// 모서리 라운드 토글 추가(티켓 20260917_1443) — PNG 다운로드·적용 탭 3종 공통 설정.
// 72px는 600x600 기준 반경이라, 1920x1920 다운로드에는 72 * (1920/600)로 비례 확대해 적용한다.
import { useState, type RefObject } from 'react'
import { IconDownload } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Switch } from '@/components/admin/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'
import { APPLY_IMAGE_SIZE_PX, APPLY_ROUND_RADIUS_PX, canvasToImage, drawImageToCanvas } from './shaderLabCanvasUtils'
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
  const [roundEnabled, setRoundEnabled] = useState(false)

  async function downloadPng() {
    setError(null)
    try {
      const canvas = canvasRef.current
      if (!canvas) throw new Error('캔버스를 찾지 못했습니다.')

      let blob: Blob
      if (roundEnabled) {
        const image = await canvasToImage(canvas)
        const downloadRadiusPx = APPLY_ROUND_RADIUS_PX * (canvas.width / APPLY_IMAGE_SIZE_PX)
        const clipped = drawImageToCanvas(image, canvas.width, downloadRadiusPx)
        blob = await canvasToBlob(clipped)
      } else {
        blob = await canvasToBlob(canvas)
      }
      downloadBlob(blob, 'shader-lab.png')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PNG 내보내기에 실패했습니다.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-col">
          <span className="text-sm text-foreground">모서리 라운드 (72px)</span>
          <span className="text-xs text-muted-foreground">
            켜면 모서리를 둥글게 잘라내고 잘려나간 영역을 투명하게 저장해요.
          </span>
        </div>
        <Switch checked={roundEnabled} onCheckedChange={setRoundEnabled} />
      </div>

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
          <ShaderLabApplyTab target="badge" canvasRef={canvasRef} roundEnabled={roundEnabled} />
        </TabsContent>
        <TabsContent value="mission">
          <ShaderLabApplyTab target="mission" canvasRef={canvasRef} roundEnabled={roundEnabled} />
        </TabsContent>
        <TabsContent value="collection">
          <ShaderLabApplyTab target="collection" canvasRef={canvasRef} roundEnabled={roundEnabled} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
