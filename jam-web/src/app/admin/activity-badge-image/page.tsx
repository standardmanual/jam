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
  MAX_CONDITION_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_NAME_LENGTH,
  buildInitialActivityBadgeImageParams,
  serializeActivityBadgeImageParams,
  type ActivityBadgeImageParams,
} from '@/lib/admin/activityBadgeImage'
import { ensureBadgeImageFonts } from '@/lib/admin/composeActivityBadgeImage'
import { slotLabelOf } from '@/lib/admin/badge-families'
import { getBadgeBlobPreset, hasBadgeBlobPreset } from '@/lib/badgeBlobPresets'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import type { ActivityType, BadgeRarity } from '@/types/database'
import ActivityBadgeImageCanvas from './ActivityBadgeImageCanvas'

interface SearchResultBadge {
  id: string
  name: string
  description: string
  /** 무한레벨형은 등급이 없다(마이그레이션 130) — 등급 칩을 그리지 않는다 */
  rarity: BadgeRarity | null
  level: number | null
  /** 서버가 `badgeKind.ts`의 `isLeveledBadge`로 판정해 내려준 값 */
  leveled: boolean
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

/**
 * 볼륨 색상 프리셋 Select용 활동 종목 목록. `ACTIVITY_OPTIONS`(검색 필터)와 달리
 * `badgeBlobPresets.ts`가 실제로 값을 갖고 있는 5종만 노출한다 — `ActivityType`에 없는
 * `road_running` 같은 레거시 필터 키를 고르면 `getBadgeBlobPreset`이 깨진다.
 */
const PRESET_ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'walking', label: ACTIVITY_TYPE_LABELS.walking },
  { value: 'running', label: ACTIVITY_TYPE_LABELS.running },
  { value: 'cycling', label: ACTIVITY_TYPE_LABELS.cycling },
  { value: 'hiking', label: ACTIVITY_TYPE_LABELS.hiking },
  { value: 'trail_running', label: ACTIVITY_TYPE_LABELS.trail_running },
]

/** 배지에 활동 종목이 지정돼 있지 않을 때 프리셋 Select에 보여줄 기본 선택지(적용은 안 함). */
const DEFAULT_PRESET_ACTIVITY: ActivityType = 'walking'

/**
 * 배지 종류 필터 (티켓 20260905_0032 C-1). 무한레벨형은 등급이 없어 **등급 필터로 좁힐 수
 * 없다** — 550종에서 레벨형만 골라내려면 별도 축이 필요하다.
 */
const KIND_OPTIONS = [
  { value: 'graded', label: '등급형' },
  { value: 'leveled', label: '레벨형' },
]

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
  const [kindFilter, setKindFilter] = useState<string>(ALL_VALUE)
  const [searchLoading, setSearchLoading] = useState(false)
  const [results, setResults] = useState<SearchResultBadge[] | null>(null)
  // 페이징(티켓 C-1). 550종에서는 상위 50건만 보여주면 나머지에 도달할 수 없다.
  const [searchPage, setSearchPage] = useState(1)
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchTotalPages, setSearchTotalPages] = useState(1)
  /** 서버가 정한 페이지 크기 — 화면이 다시 정하면 「몇 번째 배지」 표기가 서버와 갈린다 */
  const [searchPageSize, setSearchPageSize] = useState(50)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [selected, setSelected] = useState<SearchResultBadge | null>(null)
  const [draft, setDraft] = useState<ActivityBadgeImageParams | null>(null)
  const [restored, setRestored] = useState(false)
  // 볼륨 색상 프리셋 Select 2개(활동 종목·등급)의 현재 값. 배지를 고르면 그 배지 기준으로
  // 초기화되고(요구사항 3), 운영자가 드롭다운을 바꾸면 즉시 draft.background.colors만 교체한다
  // (요구사항 2·4 — bgColor·speed 등 다른 값과 커스텀 입력 자체는 건드리지 않는다).
  const [presetActivity, setPresetActivity] = useState<ActivityType>(DEFAULT_PRESET_ACTIVITY)
  const [presetRarity, setPresetRarity] = useState<BadgeRarity>('common')
  const [playing, setPlaying] = useState(false)
  /**
   * 배지를 고를 때마다 1씩 오르는 선택 토큰. 미리보기 캔버스가 누적한 위상이 **어느 선택에
   * 속하는지** 가려내는 데 쓴다.
   *
   * 재생 중에 다른 배지를 고르면 `setPlaying(false)`와 `setDraft(새 배지)`가 같은 렌더에 올라가고,
   * React는 rAF 정리 함수를 새 effect보다 **먼저** 실행한다. 그래서 정리 함수가 올려 보내는
   * 이전 배지의 누적 위상이 이미 교체된 새 배지 draft를 덮어썼다(재생 중 배지 전환 시 저장 위상
   * 대신 이전 배지 위상으로 그려지던 버그). 토큰이 다르면 그 갱신을 버린다.
   *
   * ref는 이벤트 핸들러에서 **동기적으로** 올려 둔다 — effect로 미루면 정리 함수보다 늦게 돌아
   * 비교가 무의미해진다. state는 캔버스에 prop으로 내려보내기 위해 함께 둔다.
   */
  const [selectionKey, setSelectionKey] = useState(0)
  const selectionKeyRef = useRef(0)

  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  async function runSearch(page = 1) {
    setSearchError(null)
    setSearchLoading(true)
    try {
      const res = await fetch('/api/admin/activity-badge-image/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: query,
          // 레벨형에는 등급이 없다 — 종류 필터가 레벨형이면 등급 필터를 보내지 않는다.
          rarity: rarityFilter === ALL_VALUE || kindFilter === 'leveled' ? undefined : rarityFilter,
          activityType: activityFilter === ALL_VALUE ? undefined : activityFilter,
          kind: kindFilter === ALL_VALUE ? undefined : kindFilter,
          page,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '검색에 실패했습니다.')
      setResults(data.badges)
      setSearchPage(data.page ?? page)
      setSearchTotal(data.total ?? 0)
      setSearchTotalPages(data.totalPages ?? 1)
      setSearchPageSize(data.pageSize ?? searchPageSize)
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : '검색에 실패했습니다.')
      setResults(null)
    } finally {
      setSearchLoading(false)
    }
  }

  function selectBadge(badge: SearchResultBadge) {
    // 같은 배지를 다시 고를 때도 새 선택이다 — 이전 재생의 누적 위상이 저장 위상을 덮지 않도록
    // 항상 토큰을 올린다.
    selectionKeyRef.current += 1
    setSelectionKey(selectionKeyRef.current)
    setPlaying(false)
    setSelected(badge)
    setApplyError(null)
    setApplyResult(null)
    // 프리셋 Select 초기값 — 배지의 첫 활동 종목(없으면 기본 선택지)과 등급으로 맞춰 둔다.
    // **레벨형은 등급이 없다**(마이그레이션 130). 등급 자리에 아무 값이나 넣으면 그 배지의
    // 등급인 것처럼 보이므로 색상 톤 기본값(common)만 두고 자동 적용하지 않는다(티켓 C-1).
    // 종목은 프리셋 표에 있는 값만 고른다 — `activity_types`는 text[]라 레거시 키
    // (`road_running` 등)가 남아 있으면 `getBadgeBlobPreset`이 깨진다.
    const badgeActivityType = badge.activityTypes[0]
    setPresetActivity(
      badgeActivityType && hasBadgeBlobPreset(badgeActivityType) ? badgeActivityType : DEFAULT_PRESET_ACTIVITY
    )
    setPresetRarity(badge.rarity ?? 'common')
    // 저장된 저작 파라미터가 있으면 그대로 복원한다(정지 위상까지) — 같은 이미지를 다시 굽거나
    // 일부만 고칠 수 있어야 한다. 없으면 DB의 등급·이름·설명으로 초기값을 채운다.
    if (badge.imageGenParams) {
      setDraft(badge.imageGenParams)
      setRestored(true)
    } else {
      // 신규 배지(아직 저작한 적 없음)만 프리셋을 자동 적용한다 — 판정은 순수 함수가 갖는다
      // (레벨형에는 등급 기반 프리셋을 쓰지 않는다, 티켓 C-1).
      setDraft(buildInitialActivityBadgeImageParams(badge))
      setRestored(false)
    }
  }

  /** 프리셋 Select(활동 종목·등급) 변경 시 draft.background.colors만 즉시 교체한다. */
  function applyPreset(activityType: ActivityType, rarity: BadgeRarity) {
    const colors = getBadgeBlobPreset(activityType, rarity)
    setDraft((prev) => (prev ? { ...prev, background: { ...prev.background, colors } } : prev))
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
            액티비티 배지만 검색합니다. 이름이 같은 배지가 여러 개 있으니 등급·레벨·활동 종목까지 보고 고르세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="배지 이름 검색 (예: 산책왕)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch(1)
              }}
              className="sm:flex-1"
            />
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="sm:w-36">
                <SelectValue placeholder="종류" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>전체 종류</SelectItem>
                {KIND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* 레벨형은 등급이 없어 등급으로 좁힐 수 없다 — 종류가 레벨형이면 감춘다. */}
            {kindFilter !== 'leveled' && (
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
            )}
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
            <Button onClick={() => runSearch(1)} disabled={searchLoading}>
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
            <CardTitle>검색 결과 {searchTotal}건</CardTitle>
            {searchTotal > 0 && (
              <CardDescription>
                {searchPage}/{searchTotalPages} 페이지 · {(searchPage - 1) * searchPageSize + 1}–
                {(searchPage - 1) * searchPageSize + results.length}번째 배지를 보고 있어요.
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
                      <TableHead>등급 · 레벨</TableHead>
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
                          {/* 레벨형은 「Lv.N」 — 계열 관리 화면과 같은 자리 라벨을 쓴다 */}
                          <Badge variant="outline">{slotLabelOf(b)}</Badge>
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

            {/* 페이징 — 550종에서는 상위 50건만으로 원하는 배지에 도달할 수 없다(티켓 C-1) */}
            {searchTotalPages > 1 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={searchLoading || searchPage <= 1}
                  onClick={() => runSearch(searchPage - 1)}
                >
                  이전
                </Button>
                <span className="text-xs text-muted-foreground">
                  {searchPage} / {searchTotalPages}
                </span>
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
              {/* 레벨형(rarity IS NULL)은 등급이 없다 — 등급 Select를 두면 없는 등급을 고르게
                  된다. 대신 자리(Lv.N)를 읽기 전용으로 보여주고 칩을 그리지 않는다(티켓 C-1). */}
              {selected.leveled ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-foreground">배지 종류</span>
                  <p className="text-sm">레벨형 · {slotLabelOf(selected)}</p>
                  <span className="text-xs text-muted-foreground">
                    레벨형 배지는 등급이 없어서 이미지에 등급 칩을 그리지 않아요.
                  </span>
                </div>
              ) : (
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
              )}

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

              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">볼륨 색상 프리셋</span>
                <div className="flex gap-2">
                  <Select
                    value={presetActivity}
                    onValueChange={(v) => {
                      const activityType = v as ActivityType
                      setPresetActivity(activityType)
                      applyPreset(activityType, presetRarity)
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESET_ACTIVITY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={presetRarity}
                    onValueChange={(v) => {
                      const rarity = v as BadgeRarity
                      setPresetRarity(rarity)
                      applyPreset(presetActivity, rarity)
                    }}
                  >
                    <SelectTrigger className="flex-1">
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
                </div>
                <span className="text-xs text-muted-foreground">
                  활동 종목·등급을 고르면 아래 블롭 색상에 어울리는 4색이 채워져요. 채운 뒤에도
                  각 색상은 자유롭게 다시 조정할 수 있어요.
                  {selected.leveled &&
                    ' 레벨형 배지는 등급이 없어요 — 여기 등급은 배지 등급이 아니라 색상 톤을 고르는 값이에요.'}
                </span>
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
                selectionKey={selectionKey}
                onPause={(phase, forSelection) => {
                  // 이미 다른 배지를 고른 뒤 도착한 갱신은 버린다(위상 오염 방지 — 위 주석 참조).
                  if (forSelection !== selectionKeyRef.current) return
                  setDraft((prev) => (prev ? { ...prev, background: { ...prev.background, phase } } : prev))
                }}
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
