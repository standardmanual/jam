'use client'

import { useState, type RefObject } from 'react'
import { IconCircleCheck, IconCircleX, IconSearch } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'
import { MAX_IMAGE_BYTES, serializeShaderTextParams, type ShaderTextParams } from '@/lib/admin/shaderTextDissolve'
import type { BadgeRarity, BadgeType } from '@/types/database'

interface SearchResultBadge {
  id: string
  name: string
  type: BadgeType
  rarity: BadgeRarity | null
  imageUrl: string | null
  imageGenParams: ShaderTextParams | null
}

interface ApplyResult {
  badgeId: string
  badgeName: string
  imageUrl: string
  bytes: number
}

const ALL_VALUE = '__all__'
const TYPE_LABELS: Record<BadgeType, string> = { activity: '액티비티', item: '아이템', checkin: '체크인' }
const RARITY_LABELS: Record<BadgeRarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic' }

interface ShaderTextBadgeApplyProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  params: ShaderTextParams
  onRestore: (params: ShaderTextParams) => void
  applyDisabled: boolean
}

/**
 * 배지 검색 → 미리보기 → 적용 (티켓 20260912_1532)
 *
 * `20260902_1613`(액티비티 배지 이미지 생성기)의 검색·적용 패턴을 따르되, **대상 배지 타입
 * 제한이 없다**(activity/item/checkin 전체, 티켓 명시). "적용했을 때 미리보기"는 Hero 카드
 * 전체를 재현하지 않고, 현재 배지 이미지 위에 지금 캔버스 스냅샷을 겹쳐 보여주는 정도로
 * 충분하다(티켓 명시) — 실시간 동기화 대신 **버튼으로 스냅샷을 찍는 방식**을 택했다. 캔버스
 * 리렌더(폰트 로딩 대기 포함)가 비동기라 매 프레임 자동 캡처하면 미리보기가 한 프레임 뒤처질
 * 수 있어, 명시적 스냅샷이 더 정직하다.
 */
export default function ShaderTextBadgeApply({ canvasRef, params, onRestore, applyDisabled }: ShaderTextBadgeApplyProps) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>(ALL_VALUE)
  const [searchLoading, setSearchLoading] = useState(false)
  const [results, setResults] = useState<SearchResultBadge[] | null>(null)
  const [searchPage, setSearchPage] = useState(1)
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchTotalPages, setSearchTotalPages] = useState(1)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [selected, setSelected] = useState<SearchResultBadge | null>(null)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)

  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)

  async function runSearch(page = 1) {
    setSearchError(null)
    setSearchLoading(true)
    try {
      const res = await fetch('/api/admin/shader-text/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: query,
          type: typeFilter === ALL_VALUE ? undefined : typeFilter,
          page,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '검색에 실패했습니다.')
      setResults(data.badges)
      setSearchPage(data.page ?? page)
      setSearchTotal(data.total ?? 0)
      setSearchTotalPages(data.totalPages ?? 1)
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : '검색에 실패했습니다.')
      setResults(null)
    } finally {
      setSearchLoading(false)
    }
  }

  function selectBadge(badge: SearchResultBadge) {
    setSelected(badge)
    setPreviewDataUrl(null)
    setApplyError(null)
    setApplyResult(null)
    if (badge.imageGenParams) onRestore(badge.imageGenParams)
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
      if (!canvas) throw new Error('미리보기 캔버스를 찾지 못했습니다.')
      const blob = await canvasToBlob(canvas)
      if (blob.size > MAX_IMAGE_BYTES) {
        throw new Error(
          `이미지가 너무 큽니다(${(blob.size / 1024 / 1024).toFixed(1)}MB). 에코 개수나 노이즈·그레인 강도를 줄여 주세요.`
        )
      }

      const form = new FormData()
      form.append('badgeId', selected.id)
      form.append('params', JSON.stringify(serializeShaderTextParams(params)))
      form.append('image', new File([blob], `${selected.id}.png`, { type: 'image/png' }))

      const res = await fetch('/api/admin/shader-text/generate', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '적용에 실패했습니다.')
      setApplyResult(data)
      setResults((prev) =>
        prev?.map((b) => (b.id === selected.id ? { ...b, imageUrl: data.imageUrl, imageGenParams: params } : b)) ??
        prev
      )
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : '적용에 실패했습니다.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="배지 이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runSearch(1)
          }}
          className="sm:flex-1"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="sm:w-36">
            <SelectValue placeholder="타입" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>전체 타입</SelectItem>
            {(Object.keys(TYPE_LABELS) as BadgeType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => runSearch(1)} disabled={searchLoading}>
          <IconSearch className="h-4 w-4 mr-1" />
          {searchLoading ? '검색 중…' : '검색'}
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
          <p className="text-xs text-muted-foreground">검색 결과 {searchTotal}건</p>
          <div className="max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>배지 이름</TableHead>
                  <TableHead>타입</TableHead>
                  <TableHead>등급</TableHead>
                  <TableHead>이미지</TableHead>
                  <TableHead className="text-right">선택</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((b) => (
                  <TableRow key={b.id} data-state={selected?.id === b.id ? 'selected' : undefined}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>{TYPE_LABELS[b.type]}</TableCell>
                    <TableCell>{b.rarity ? RARITY_LABELS[b.rarity] : '레벨형'}</TableCell>
                    <TableCell>
                      <Badge variant={b.imageGenParams ? 'default' : b.imageUrl ? 'secondary' : 'outline'}>
                        {b.imageGenParams ? '이 도구로 생성됨' : b.imageUrl ? '있음' : '없음'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => selectBadge(b)}>
                        선택
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {searchTotalPages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" disabled={searchLoading || searchPage <= 1} onClick={() => runSearch(searchPage - 1)}>
                이전
              </Button>
              <span className="text-xs text-muted-foreground">{searchPage} / {searchTotalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={searchLoading || searchPage >= searchTotalPages}
                onClick={() => runSearch(searchPage + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </>
      )}

      {selected && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-sm text-foreground">
            대상 배지: <span className="font-medium">{selected.name}</span> ({TYPE_LABELS[selected.type]})
          </p>

          <div className="flex items-center gap-4">
            <div
              className="relative w-40 h-40 shrink-0 rounded-xl overflow-hidden border border-border"
              style={{ backgroundColor: '#1f1f1f' }}
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
                흐린 이미지가 지금 배지, 선명한 이미지가 적용하면 바뀔 모습이에요.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={runApply} disabled={applying || applyDisabled}>
              {applying ? '적용 중…' : '적용'}
            </Button>
            {applyDisabled && <span className="text-xs text-muted-foreground">재생 중에는 적용할 수 없어요.</span>}
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
                  「{applyResult.badgeName}」에 반영했어요. ({Math.round(applyResult.bytes / 1024)}KB)
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
