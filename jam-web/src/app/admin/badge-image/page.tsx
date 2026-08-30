'use client'

import { useState } from 'react'
import { IconCircleCheck, IconCircleX, IconSearch } from '@tabler/icons-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Input } from '@/components/admin/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Badge } from '@/components/admin/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { BADGE_IMAGE_DESIGNS } from '@/lib/admin/badgeImageDesigns'

interface SearchResultBadge {
  id: string
  name: string
  hasImage: boolean
  poiName: string | null
  poiCategory: string | null
}

interface GenerateResult {
  badgeId: string
  badgeName: string
  design: string
  text: string
  imageUrl: string
}

const ALL_CATEGORIES_VALUE = '__all__'

/**
 * 체크인 배지 이미지 생성 (티켓 20260830_1500 — Storage 업로드 + 즉시 DB 반영으로 재설계.
 * 이전 이력: 20260830_1349 단건 선택 방식, 20260830_1252 배치 방식).
 *
 * 검색(이름 키워드 + 카테고리 필터) → 목록에서 배지 1개 선택 → 디자인·텍스트 확인/편집 →
 * 이미지 1장 생성. 생성 API가 Supabase Storage 업로드와 badges.image_url UPDATE까지 한
 * 요청 안에서 끝내므로, 이 화면에서 별도로 파일을 다운로드하거나 SQL을 복사·적용할 필요가
 * 없다 — 생성이 끝나면 이미 서비스에 반영된 상태다.
 */
export default function BadgeImagePage() {
  const [query, setQuery] = useState('')
  const [categoryDesignId, setCategoryDesignId] = useState<string>(ALL_CATEGORIES_VALUE)
  const [searchLoading, setSearchLoading] = useState(false)
  const [results, setResults] = useState<SearchResultBadge[] | null>(null)
  const [searchTruncated, setSearchTruncated] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [selected, setSelected] = useState<SearchResultBadge | null>(null)
  const [design, setDesign] = useState<string>(BADGE_IMAGE_DESIGNS[0]?.configId ?? '')
  const [text, setText] = useState('')

  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [genResult, setGenResult] = useState<GenerateResult | null>(null)

  async function runSearch() {
    setSearchError(null)
    setSearchLoading(true)
    try {
      const res = await fetch('/api/admin/badge-image/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: query,
          designId: categoryDesignId === ALL_CATEGORIES_VALUE ? undefined : categoryDesignId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '검색에 실패했습니다.')
      setResults(data.badges)
      setSearchTruncated(Boolean(data.truncated))
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : '검색에 실패했습니다.')
      setResults(null)
    } finally {
      setSearchLoading(false)
    }
  }

  function selectBadge(badge: SearchResultBadge) {
    setSelected(badge)
    setGenResult(null)
    setGenError(null)
    setText(badge.poiName ?? badge.name)
    // 검색에 사용한 카테고리 필터가 특정 디자인이면 그 디자인을 기본값으로 미리 채워둔다.
    if (categoryDesignId !== ALL_CATEGORIES_VALUE) setDesign(categoryDesignId)
  }

  async function runGenerate() {
    if (!selected) return
    setGenError(null)
    setGenLoading(true)
    try {
      const res = await fetch('/api/admin/badge-image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badgeId: selected.id, designId: design, text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '생성에 실패했습니다.')
      setGenResult(data)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '생성에 실패했습니다.')
    } finally {
      setGenLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">체크인 배지 이미지 생성</h1>
        <p className="text-muted-foreground text-sm mt-1">
          체크인 배지 1개를 검색해 선택하고, 표시할 텍스트를 입력해 이미지를 생성합니다.
          생성하면 즉시 반영됩니다 — 별도 배포나 SQL 적용이 필요 없습니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>배지 검색</CardTitle>
          <CardDescription>배지 이름 또는 연결된 POI 이름으로 검색합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="이름 검색 (예: 강남역, 북한산)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch()
              }}
              className="sm:flex-1"
            />
            <Select value={categoryDesignId} onValueChange={setCategoryDesignId}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder="카테고리 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES_VALUE}>전체 카테고리</SelectItem>
                {BADGE_IMAGE_DESIGNS.map((d) => (
                  <SelectItem key={d.configId} value={d.configId}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runSearch} disabled={searchLoading}>
              <IconSearch className="h-4 w-4 mr-1" />
              {searchLoading ? '검색 중…' : '검색'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            검색어 또는 카테고리 필터 중 최소 하나는 입력해야 결과가 나옵니다.
          </p>
        </CardContent>
      </Card>

      {searchError && (
        <Alert variant="destructive">
          <IconCircleX className="h-4 w-4" />
          <AlertTitle>검색 오류</AlertTitle>
          <AlertDescription>{searchError}</AlertDescription>
        </Alert>
      )}

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>검색 결과 {results.length}건</CardTitle>
            {searchTruncated && (
              <CardDescription>결과가 많아 상위 {results.length}건만 표시합니다. 검색어를 더 구체화하세요.</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">검색 결과가 없습니다.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>배지 이름</TableHead>
                      <TableHead>연결 POI</TableHead>
                      <TableHead>이미지</TableHead>
                      <TableHead className="text-right">선택</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((b) => (
                      <TableRow key={b.id} data-state={selected?.id === b.id ? 'selected' : undefined}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {b.poiName ? `${b.poiName}${b.poiCategory ? ` (${b.poiCategory})` : ''}` : '연결 없음'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.hasImage ? 'secondary' : 'outline'}>
                            {b.hasImage ? '있음' : '없음'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={selected?.id === b.id ? 'default' : 'outline'}
                            onClick={() => selectBadge(b)}
                          >
                            {selected?.id === b.id ? '선택됨' : '선택'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>이미지 생성 — {selected.name}</CardTitle>
            <CardDescription>렌더링할 디자인과 표시할 텍스트를 확인·편집한 뒤 생성하세요.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="sm:w-64 space-y-1.5">
                <label className="text-sm font-medium">디자인</label>
                <Select value={design} onValueChange={setDesign}>
                  <SelectTrigger>
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
              </div>
              <div className="sm:flex-1 space-y-1.5">
                <label className="text-sm font-medium">이미지에 표시할 텍스트</label>
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 강남역" />
              </div>
            </div>

            <Button onClick={runGenerate} disabled={genLoading || !text.trim()}>
              {genLoading ? '생성 중…' : '이미지 생성/교체 실행'}
            </Button>

            {genError && (
              <Alert variant="destructive">
                <IconCircleX className="h-4 w-4" />
                <AlertTitle>생성 오류</AlertTitle>
                <AlertDescription>{genError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {genResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconCircleCheck className="h-5 w-5 text-emerald-600" />
              생성 완료 — {genResult.badgeName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4">
              {/* Storage 절대 URL 미리보기 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={genResult.imageUrl}
                alt={`${genResult.badgeName} 미리보기`}
                className="h-32 w-32 rounded-lg border object-cover shrink-0"
              />
              <div className="text-sm text-muted-foreground space-y-1">
                <p>텍스트: {genResult.text}</p>
                <p>디자인: {genResult.design}</p>
              </div>
            </div>

            <Alert>
              <AlertDescription>
                이미지가 즉시 반영됐습니다. 배지 화면에서 바로 확인할 수 있습니다.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
