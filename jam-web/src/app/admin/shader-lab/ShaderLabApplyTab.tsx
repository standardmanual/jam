'use client'

import { useState, type RefObject } from 'react'
import { IconCircleCheck, IconCircleX, IconSearch } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'
import { MAX_APPLY_IMAGE_BYTES } from '@/lib/admin/applyGeneratedImage'

// 쉐이더 랩 -> 배지/미션/컬렉션 적용 탭 (티켓 20260913_0414)
// ShaderTextBadgeApply.tsx(검색 -> 선택 -> 미리보기 -> 적용)의 UI 패턴을 target별로
// 재사용하도록 일반화했다. image_gen_params 저장/복원(재편집)은 이번에 넣지 않는다 -
// 사용자 확정 요구사항은 검색/선택/미리보기/적용까지이고, 세 대상 테이블 중 badges만
// 그 컬럼이 있어 형평에 맞지 않는다(완료 기록의 주요 의사결정 참고).
export type ShaderLabApplyTarget = 'badge' | 'mission' | 'collection'

interface SearchItem {
  id: string
  name: string
  imageUrl: string | null
}

interface ApplyResult {
  id: string
  name: string
  imageUrl: string
  bytes: number
}

const TARGET_LABEL: Record<ShaderLabApplyTarget, string> = {
  badge: `배지`,
  mission: `미션`,
  collection: `컬렉션`,
}

const TARGET_PLACEHOLDER: Record<ShaderLabApplyTarget, string> = {
  badge: `배지 이름 검색`,
  mission: `미션 이름 검색`,
  collection: `컬렉션 이름 검색`,
}

interface BadgeSearchRow {
  id: string
  name: string
  image_url: string | null
}

async function searchBadges(query: string): Promise<SearchItem[]> {
  const res = await fetch(`/api/admin/badges/search?query=${encodeURIComponent(query)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? '검색에 실패했어요.')
  return (data.badges as BadgeSearchRow[]).map((b) => ({ id: b.id, name: b.name, imageUrl: b.image_url }))
}

async function searchMissions(query: string): Promise<SearchItem[]> {
  const res = await fetch(`/api/admin/missions/search?q=${encodeURIComponent(query)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? '검색에 실패했어요.')
  return data.missions as SearchItem[]
}

async function searchItemBooks(query: string): Promise<SearchItem[]> {
  const res = await fetch(`/api/admin/itembooks/search?q=${encodeURIComponent(query)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? '검색에 실패했어요.')
  return data.itemBooks as SearchItem[]
}

async function searchTarget(target: ShaderLabApplyTarget, query: string): Promise<SearchItem[]> {
  if (target === 'badge') {
    return searchBadges(query)
  }
  if (target === 'mission') {
    return searchMissions(query)
  }
  return searchItemBooks(query)
}

async function applyToTarget(target: ShaderLabApplyTarget, id: string, blob: Blob): Promise<ApplyResult> {
  const form = new FormData()
  form.append('target', target)
  form.append('id', id)
  form.append('image', new File([blob], `${id}.png`, { type: `image/png` }))

  const res = await fetch('/api/admin/shader-lab/apply', { method: `POST`, body: form })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? '적용에 실패했어요.')
  return data as ApplyResult
}

interface ShaderLabApplyTabProps {
  target: ShaderLabApplyTarget
  canvasRef: RefObject<HTMLCanvasElement | null>
  applyDisabled: boolean
}

export default function ShaderLabApplyTab({ target, canvasRef, applyDisabled }: ShaderLabApplyTabProps) {
  const [query, setQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [results, setResults] = useState<SearchItem[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [selected, setSelected] = useState<SearchItem | null>(null)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)

  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)

  async function runSearch() {
    setSearchError(null)
    setSearchLoading(true)
    try {
      const items = await searchTarget(target, query)
      setResults(items)
    } catch (e) {
      setResults(null)
      setSearchError(e instanceof Error ? e.message : '검색에 실패했어요.')
    } finally {
      setSearchLoading(false)
    }
  }

  function selectItem(item: SearchItem) {
    setSelected(item)
    setPreviewDataUrl(null)
    setApplyError(null)
    setApplyResult(null)
  }

  function snapshotPreview() {
    const canvas = canvasRef.current
    if (!canvas) return
    setPreviewDataUrl(canvas.toDataURL('image/png'))
  }

  async function runApply() {
    if (!selected) return
    setApplyError(null)
    setApplying(true)
    try {
      const canvas = canvasRef.current
      if (!canvas) throw new Error('캔버스를 찾지 못했어요.')
      const blob = await canvasToBlob(canvas)
      if (blob.size > MAX_APPLY_IMAGE_BYTES) {
        const mb = (blob.size / 1024 / 1024).toFixed(1)
        throw new Error(`이미지가 너무 커요(${mb}MB). 5MB 이하만 반영할 수 있어요.`)
      }
      const result = await applyToTarget(target, selected.id, blob)
      setApplyResult(result)
      setResults((prev) => {
        if (!prev) return prev
        return prev.map((it) => (it.id === selected.id ? { ...it, imageUrl: result.imageUrl } : it))
      })
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : '적용에 실패했어요.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder={TARGET_PLACEHOLDER[target]}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === `Enter`) runSearch()
          }}
          className="sm:flex-1"
        />
        <Button onClick={runSearch} disabled={searchLoading}>
          <IconSearch className="h-4 w-4 mr-1" />
          {searchLoading ? `검색 중…` : `검색`}
        </Button>
      </div>
      {searchError && (
        <Alert variant="destructive">
          <IconCircleX className="h-4 w-4" />
          <AlertTitle>검색 오류</AlertTitle>
          <AlertDescription>{searchError}</AlertDescription>
        </Alert>
      )}

      {results && (
        <>
          <p className="text-xs text-muted-foreground">검색 결과 {results.length}건</p>
          <div className="max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{TARGET_LABEL[target]} 이름</TableHead>
                  <TableHead>현재 이미지</TableHead>
                  <TableHead className="text-right">선택</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((item) => (
                  <TableRow key={item.id} data-state={selected?.id === item.id ? `selected` : undefined}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="h-10 w-10 rounded object-contain border border-border" />
                      ) : (
                        <span className="text-xs text-muted-foreground">없음</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => selectItem(item)}>
                        선택
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {selected && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-sm text-foreground">
            대상 {TARGET_LABEL[target]}: <span className="font-medium">{selected.name}</span>
          </p>

          <div className="flex items-center gap-4">
            <div
              className="relative w-40 h-40 shrink-0 rounded-xl overflow-hidden border border-border"
              style={{ backgroundColor: `#1f1f1f` }}
            >
              {selected.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.imageUrl} alt="" className="absolute inset-0 w-full h-full object-contain opacity-30" />
              )}
              {previewDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewDataUrl} alt="적용 미리보기" className="absolute inset-0 w-full h-full object-contain" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" size="sm" variant="outline" onClick={snapshotPreview}>
                미리보기 갱신
              </Button>
              <span className="text-xs text-muted-foreground max-w-56">
                흐린 이미지가 지금 이미지, 선명한 이미지가 적용하면 바뀔 모습이에요.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={runApply} disabled={applying || applyDisabled}>
              {applying ? `적용 중…` : `적용`}
            </Button>
            {applyDisabled && (
              <span className="text-xs text-muted-foreground">재생 중에는 적용할 수 없어요.</span>
            )}
          </div>

          {applyError && (
            <Alert variant="destructive">
              <IconCircleX className="h-4 w-4" />
              <AlertTitle>적용 오류</AlertTitle>
              <AlertDescription>{applyError}</AlertDescription>
            </Alert>
          )}

          {applyResult && (
            <Alert>
              <IconCircleCheck className="h-4 w-4" />
              <AlertTitle>적용 완료</AlertTitle>
              <AlertDescription className="space-y-2">
                <span className="block">
                  「{applyResult.name}」에 반영했어요. ({Math.round(applyResult.bytes / 1024)}KB)
                </span>
                <a href={applyResult.imageUrl} target="_blank" rel="noreferrer" className="block break-all underline text-xs">
                  {applyResult.imageUrl}
                </a>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  )
}
