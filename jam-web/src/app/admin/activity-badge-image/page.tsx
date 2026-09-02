'use client'

import { useRef, useState } from 'react'
import { IconCircleCheck, IconCircleX, IconPlayerPause, IconPlayerPlay, IconSearch } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { Textarea } from '@/components/admin/ui/textarea'
import BlobAnimationFields from '@/app/admin/badges/BlobAnimationFields'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'
import {
  DEFAULT_ACTIVITY_BADGE_BACKGROUND,
  MAX_CONDITION_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_NAME_LENGTH,
  ACTIVITY_BADGE_IMAGE_PARAMS_VERSION,
  serializeActivityBadgeImageParams,
  type ActivityBadgeImageParams,
} from '@/lib/admin/activityBadgeImage'
import { ensureBadgeImageFonts } from '@/lib/admin/composeActivityBadgeImage'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import type { ActivityType, BadgeRarity } from '@/types/database'
import ActivityBadgeImageCanvas from './ActivityBadgeImageCanvas'

interface SearchResultBadge {
  id: string
  name: string
  description: string
  rarity: BadgeRarity
  activityTypes: ActivityType[]
  hasImage: boolean
  imageGenParams: ActivityBadgeImageParams | null
}

interface ApplyResult {
  badgeId: string
  badgeName: string
  imageUrl: string
  bytes: number
}

const ALL_VALUE = '__all__'

const RARITY_OPTIONS: { value: BadgeRarity; label: string }[] = [
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'mystic', label: 'Mystic' },
]

const ACTIVITY_OPTIONS = Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => ({ value, label }))

function activityLabels(types: ActivityType[]): string {
  if (types.length === 0) return '지정 없음'
  return types.map((t) => ACTIVITY_TYPE_LABELS[t] ?? t).join(', ')
}

/**
 * 액티비티 배지 이미지 생성 (티켓 20260902_1613)
 *
 * 피그마 node 8:33(540×540)을 클라이언트 캔버스로 합성해 `badges.image_url`을 교체하는 저작
 * 도구다. 체크인 배지 생성기(`/admin/badge-image`)와 파이프라인이 완전히 다르다 — 그쪽은 서버
 * satori 렌더, 이쪽은 브라우저 Canvas 2D다. 그래서 화면을 확장하지 않고 따로 뒀다.
 *
 * 흐름: 배지 검색 → 선택(저장된 저작 파라미터가 있으면 그대로 복원) → 등급·이름·설명·배경 편집
 * → 원하는 프레임에서 일시정지 → 적용(업로드 + DB 반영).
 */
export default function ActivityBadgeImagePage() {
  const [query, setQuery] = useState('')
  const [rarityFilter, setRarityFilter] = useState<string>(ALL_VALUE)
  const [activityFilter, setActivityFilter] = useState<string>(ALL_VALUE)
  const [searchLoading, setSearchLoading] = useState(false)
  const [results, setResults] = useState<SearchResultBadge[] | null>(null)
  const [searchTruncated, setSearchTruncated] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [selected, setSelected] = useState<SearchResultBadge | null>(null)
  const [draft, setDraft] = useState<ActivityBadgeImageParams | null>(null)
  const [restored, setRestored] = useState(false)
  const [playing, setPlaying] = useState(false)

  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  async function runSearch() {
    setSearchError(null)
    setSearchLoading(true)
    try {
      const res = await fetch('/api/admin/activity-badge-image/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: query,
          rarity: rarityFilter === ALL_VALUE ? undefined : rarityFilter,
          activityType: activityFilter === ALL_VALUE ? undefined : activityFilter,
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
    setPlaying(false)
    setSelected(badge)
    setApplyError(null)
    setApplyResult(null)
    // 저장된 저작 파라미터가 있으면 그대로 복원한다(정지 위상까지) — 같은 이미지를 다시 굽거나
    // 일부만 고칠 수 있어야 한다. 없으면 DB의 등급·이름·설명으로 초기값을 채운다.
    if (badge.imageGenParams) {
      setDraft(badge.imageGenParams)
      setRestored(true)
    } else {
      setDraft({
        version: ACTIVITY_BADGE_IMAGE_PARAMS_VERSION,
        rarity: badge.rarity,
        name: badge.name,
        condition: badge.description,
        background: DEFAULT_ACTIVITY_BADGE_BACKGROUND,
      })
      setRestored(false)
    }
  }

  async function runApply() {
    if (!selected || !draft) return
    setApplyError(null)
    setApplying(true)
    try {
      // 캔버스에 마지막으로 그려진 프레임을 그대로 굽는다(별도 재렌더링 없음 — WYSIWYG).
      await ensureBadgeImageFonts()
      const canvas = canvasRef.current
      if (!canvas) throw new Error('미리보기 캔버스를 찾지 못했습니다.')
      const blob = await canvasToBlob(canvas)
      if (blob.size > MAX_IMAGE_BYTES) {
        throw new Error(
          `이미지가 너무 큽니다(${(blob.size / 1024 / 1024).toFixed(1)}MB). 배경 색 수를 줄이거나 블러를 조정해 주세요.`
        )
      }

      const form = new FormData()
      form.append('badgeId', selected.id)
      form.append('params', JSON.stringify(serializeActivityBadgeImageParams(draft)))
      form.append('image', new File([blob], `${selected.id}.png`, { type: 'image/png' }))

      const res = await fetch('/api/admin/activity-badge-image/generate', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '적용에 실패했습니다.')
      setApplyResult(data)
      // 목록의 상태(이미지 있음 / 저장된 파라미터)도 함께 맞춰 둔다 — 다시 선택하면 방금 저장한
      // 값으로 복원되어야 한다.
      setResults((prev) =>
        prev?.map((b) => (b.id === selected.id ? { ...b, hasImage: true, imageGenParams: draft } : b)) ?? prev
      )
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : '적용에 실패했습니다.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">액티비티 배지 이미지 생성</h1>
        <p className="text-muted-foreground text-sm mt-1">
          액티비티 배지 1개를 골라 등급 칩·이름·설명·배경을 합성해 이미지를 만듭니다.
          적용하면 즉시 반영됩니다 — 별도 배포나 SQL 적용이 필요 없습니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>배지 검색</CardTitle>
          <CardDescription>
            액티비티 배지만 검색합니다. 이름이 같은 배지가 여러 개 있으니 등급·활동 종목까지 보고 고르세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="배지 이름 검색 (예: 산책왕)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch()
              }}
              className="sm:flex-1"
            />
            <Select value={rarityFilter} onValueChange={setRarityFilter}>
              <SelectTrigger className="sm:w-40">
                <SelectValue placeholder="등급" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>전체 등급</SelectItem>
                {RARITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="활동 종목" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>전체 활동 종목</SelectItem>
                {ACTIVITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runSearch} disabled={searchLoading}>
              <IconSearch className="h-4 w-4 mr-1" />
              {searchLoading ? '검색 중…' : '검색'}
            </Button>
          </div>
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
              <CardDescription>
                결과가 많아 상위 {results.length}건만 표시합니다. 검색어나 필터를 더 좁혀 주세요.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">검색 결과가 없습니다.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>배지 이름</TableHead>
                      <TableHead>등급</TableHead>
                      <TableHead>활동 종목</TableHead>
                      <TableHead>이미지</TableHead>
                      <TableHead className="text-right">선택</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((b) => (
                      <TableRow key={b.id} data-state={selected?.id === b.id ? 'selected' : undefined}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{b.rarity}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{activityLabels(b.activityTypes)}</TableCell>
                        <TableCell>
                          <Badge variant={b.imageGenParams ? 'default' : b.hasImage ? 'secondary' : 'outline'}>
                            {b.imageGenParams ? '생성됨' : b.hasImage ? '있음' : '없음'}
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
            )}
          </CardContent>
        </Card>
      )}

      {selected && draft && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>설정</CardTitle>
              <CardDescription>
                {restored
                  ? '저장된 저작 파라미터를 불러왔어요. 고친 뒤 다시 적용하면 이미지가 교체돼요.'
                  : '배지의 등급·이름·설명으로 초기값을 채웠어요. 이미지에 그릴 문구는 여기서 직접 고쳐요.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">등급</span>
                <Select
                  value={draft.rarity}
                  onValueChange={(v) => setDraft({ ...draft, rarity: v as BadgeRarity })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RARITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  Common은 이미지에 등급 칩을 그리지 않아요.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">배지 이름</span>
                <Textarea
                  value={draft.name}
                  maxLength={MAX_NAME_LENGTH}
                  rows={3}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder={'동네 산책러\n레벨업'}
                />
                <span className="text-xs text-muted-foreground">
                  줄바꿈이 이미지에 그대로 들어가요. 글자가 넘치면 줄바꿈이나 문구를 직접 줄여 주세요.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">설명</span>
                <Textarea
                  value={draft.condition}
                  maxLength={MAX_CONDITION_LENGTH}
                  rows={3}
                  onChange={(e) => setDraft({ ...draft, condition: e.target.value })}
                  placeholder="누적 30000회"
                />
              </div>

              <BlobAnimationFields
                value={draft.background}
                onChange={(next) => setDraft({ ...draft, background: { ...next, phase: draft.background.phase } })}
                speedAccessory={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setPlaying((p) => !p)}
                  >
                    {playing ? (
                      <>
                        <IconPlayerPause className="h-4 w-4 mr-1" />
                        일시정지
                      </>
                    ) : (
                      <>
                        <IconPlayerPlay className="h-4 w-4 mr-1" />
                        재생
                      </>
                    )}
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>미리보기</CardTitle>
              <CardDescription>
                아래 캔버스가 그대로 이미지로 구워져요. 재생하다가 마음에 드는 배경에서 일시정지한 뒤 적용하세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ActivityBadgeImageCanvas
                params={draft}
                playing={playing}
                onPause={(phase) =>
                  setDraft((prev) => (prev ? { ...prev, background: { ...prev.background, phase } } : prev))
                }
                canvasRef={canvasRef}
              />
              <p className="text-xs text-muted-foreground">
                정지 위상 {draft.background.phase.toFixed(2)} · 1080×1080 PNG · 대상 배지 「{selected.name}」
              </p>

              <div className="flex items-center gap-3">
                <Button onClick={runApply} disabled={applying || playing}>
                  {applying ? '적용 중…' : '적용'}
                </Button>
                {playing && (
                  <span className="text-xs text-muted-foreground">
                    재생 중에는 적용할 수 없어요. 원하는 프레임에서 일시정지해 주세요.
                  </span>
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
                      「{applyResult.badgeName}」에 반영했어요. ({Math.round(applyResult.bytes / 1024)}KB)
                    </span>
                    <a
                      href={applyResult.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block break-all underline text-xs"
                    >
                      {applyResult.imageUrl}
                    </a>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={applyResult.imageUrl}
                      alt="반영된 배지 이미지"
                      className="w-40 h-40 rounded-xl"
                      style={{ backgroundColor: '#1f1f1f' }}
                    />
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
