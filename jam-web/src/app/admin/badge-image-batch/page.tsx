'use client'

import { useState } from 'react'
import { IconCircleCheck, IconCircleX, IconCopy, IconDownload } from '@tabler/icons-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Input } from '@/components/admin/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { BADGE_IMAGE_DESIGNS } from '@/lib/admin/badgeImageDesigns'

interface PreviewResult {
  design: string
  total: number
  sample: { id: string; name: string }[]
  sampleTruncated: boolean
}

interface ExecuteResult {
  design: string
  ok: number
  fail: number
  errors: { id: string; name: string; message: string }[]
  filesWritten: boolean
  outputDir: string
  sqlPath: string | null
  sql: string
  fallbackImages: { id: string; filename: string; base64: string }[]
  fallbackTruncated: boolean
}

/**
 * 체크인 배지 이미지 배치 생성 (티켓 20260830_1252).
 *
 * scripts/badge-image-gen/의 디자인(config)을 골라 대상 배지를 먼저 미리보기(preview)하고,
 * 확인 후 실행(execute)한다. DB의 image_url 반영은 이 화면에서 하지 않는다 — 실행 결과로
 * 받은 SQL을 확인 후 별도로 Supabase에 적용해야 한다(이미지 배포 확인이 먼저 — 20260824_020).
 */
export default function BadgeImageBatchPage() {
  const [design, setDesign] = useState(BADGE_IMAGE_DESIGNS[0]?.configId ?? '')
  const [limit, setLimit] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [executeLoading, setExecuteLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [execResult, setExecResult] = useState<ExecuteResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const selectedDesign = BADGE_IMAGE_DESIGNS.find((d) => d.configId === design)
  const parsedLimit = limit.trim() ? parseInt(limit, 10) : undefined

  async function runPreview() {
    setError(null)
    setExecResult(null)
    setPreviewLoading(true)
    try {
      const res = await fetch('/api/admin/badge-image-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, mode: 'preview', limit: parsedLimit }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '미리보기에 실패했습니다.')
      setPreview(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '미리보기에 실패했습니다.')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function runExecute() {
    setError(null)
    setExecuteLoading(true)
    try {
      const res = await fetch('/api/admin/badge-image-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, mode: 'execute', limit: parsedLimit }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '실행에 실패했습니다.')
      setExecResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '실행에 실패했습니다.')
    } finally {
      setExecuteLoading(false)
    }
  }

  async function copySql() {
    if (!execResult?.sql) return
    await navigator.clipboard.writeText(execResult.sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">체크인 배지 이미지 배치 생성</h1>
        <p className="text-muted-foreground text-sm mt-1">
          디자인을 골라 대상 배지를 미리 확인한 뒤 이미지를 생성합니다. DB의 image_url 반영은
          여기서 자동으로 실행되지 않습니다 — 생성된 SQL을 이미지 배포 확인 후 직접 적용하세요.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>디자인 선택</CardTitle>
          <CardDescription>{selectedDesign?.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select
              value={design}
              onValueChange={(v) => {
                setDesign(v)
                setPreview(null)
                setExecResult(null)
              }}
            >
              <SelectTrigger className="sm:w-72">
                <SelectValue placeholder="디자인 선택" />
              </SelectTrigger>
              <SelectContent>
                {BADGE_IMAGE_DESIGNS.map((d) => (
                  <SelectItem key={d.configId} value={d.configId}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="number"
              min={1}
              placeholder="개수 제한 (선택)"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="sm:w-48"
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={runPreview} disabled={previewLoading}>
              {previewLoading ? '조회 중…' : '대상 미리보기'}
            </Button>
            <Button onClick={runExecute} disabled={!preview || executeLoading} variant="secondary">
              {executeLoading ? '생성 중…' : '이미지 생성 실행'}
            </Button>
          </div>
          {!preview && (
            <p className="text-xs text-muted-foreground">실행 전 먼저 대상을 미리보기해야 합니다.</p>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <IconCircleX className="h-4 w-4" />
          <AlertTitle>오류</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {preview && !execResult && (
        <Card>
          <CardHeader>
            <CardTitle>대상 배지 {preview.total}개</CardTitle>
            <CardDescription>
              {preview.sampleTruncated
                ? `상위 ${preview.sample.length}개만 표시합니다.`
                : '전체 대상입니다.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 max-h-64 overflow-y-auto">
              {preview.sample.map((row) => (
                <li key={row.id} className="text-muted-foreground">
                  {row.name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {execResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {execResult.fail === 0 ? (
                <IconCircleCheck className="h-5 w-5 text-emerald-600" />
              ) : (
                <IconCircleX className="h-5 w-5 text-amber-600" />
              )}
              실행 결과 — 성공 {execResult.ok}개, 실패 {execResult.fail}개
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {execResult.filesWritten ? (
              <Alert>
                <AlertDescription>
                  이미지가 <code>public/{execResult.outputDir}/</code>에 저장됐습니다.
                  {execResult.sqlPath && (
                    <>
                      {' '}
                      SQL 파일도 <code>{execResult.sqlPath}</code>에 저장됐습니다.
                    </>
                  )}{' '}
                  변경된 파일을 커밋·배포한 뒤, 이미지가 실제로 보이는지 확인하고 아래 SQL을
                  Supabase에 직접 적용하세요.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>파일 시스템에 쓰기가 막혀 있습니다</AlertTitle>
                <AlertDescription>
                  이 환경(배포된 서버)에서는 public/ 디렉터리에 새 파일을 저장할 수 없습니다.
                  아래에서 생성된 이미지를 개별 다운로드해 저장소에 직접 커밋하세요. 이 기능은
                  로컬 개발 서버(npm run dev)에서 실행하면 파일이 자동 저장됩니다.
                  {execResult.fallbackTruncated && (
                    <> 응답 크기 제한으로 처음 {execResult.fallbackImages.length}개만 담겼습니다.</>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {execResult.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">실패 목록</p>
                <ul className="text-sm space-y-1 max-h-40 overflow-y-auto text-red-600">
                  {execResult.errors.map((e) => (
                    <li key={e.id}>
                      {e.name}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {execResult.sql && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">image_url 반영 SQL</p>
                  <Button size="sm" variant="outline" onClick={copySql}>
                    <IconCopy className="h-3.5 w-3.5 mr-1" />
                    {copied ? '복사됨' : '복사'}
                  </Button>
                </div>
                <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                  {execResult.sql}
                </pre>
              </div>
            )}

            {!execResult.filesWritten && execResult.fallbackImages.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">생성된 이미지 다운로드</p>
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                  {execResult.fallbackImages.map((img) => (
                    <li key={img.id}>
                      <a
                        href={`data:image/png;base64,${img.base64}`}
                        download={img.filename}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <IconDownload className="h-3.5 w-3.5 shrink-0" />
                        {img.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
