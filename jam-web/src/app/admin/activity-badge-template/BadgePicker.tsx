'use client'

/**
 * 배지 검색 카드와 결과 표 (표시 전용, 티켓 20261116_0555).
 * 옛 화면(activity-badge-image)의 검색 UI를 본보기로 옮겼다. 옛 화면은 2026-11-16에 지웠다(지금은 이 화면으로 보내는 페이지만 남음).
 */
import { useState } from 'react'
import { IconCircleX, IconSearch } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { slotLabelOf } from '@/lib/admin/badge-families'
import { BADGE_TEMPLATE_CLASS_LABEL, type BadgeTemplateClassKey } from '@/lib/admin/activityBadgeTemplate/resolveTemplateText'
import type { TemplateBadgeParams } from '@/lib/admin/activityBadgeTemplate/templateParams'
import { optimizedImageUrl } from '@/lib/imageSrc'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import type { ActivityType, BadgeRarity } from '@/types/database'

export const ALL_VALUE = '__all__'

export const RARITY_OPTIONS: { value: BadgeRarity; label: string }[] = [
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'mystic', label: 'Mystic' },
]

export const ACTIVITY_OPTIONS = Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => ({ value, label }))

/** 무한레벨형은 등급이 없어 등급 필터로 좁힐 수 없다 — 종류 필터가 따로 있다. */
export const KIND_OPTIONS = [
  { value: 'graded', label: '등급형' },
  { value: 'leveled', label: '레벨형' },
]

/** 분류 선택지. 이름은 규칙 파일의 라벨이 단일 원천이다 */
export const CLASS_OPTIONS = Object.entries(BADGE_TEMPLATE_CLASS_LABEL).map(([value, label]) => ({ value, label }))

const WRAP = 'break-keep wrap-break-word'

export interface StudioSearchBadge {
  id: string
  name: string
  rarity: BadgeRarity | null
  level: number | null
  leveled: boolean
  activityTypes: ActivityType[]
  hasImage: boolean
  /** 등록된 이미지 주소(`badges.image_url`). 없으면 null */
  imageUrl: string | null
  templateClass: BadgeTemplateClassKey | null
  templateClassLabel: string | null
  templateValue: string | null
  familyKey: string | null
  templateParams: TemplateBadgeParams | null
}

/** 결과 표의 썸네일 — 표시 48px의 2배인 96px 변환 주소를 쓴다(티켓 20261116_1640) */
export const THUMB_WIDTH = 96

/** 썸네일 표시 부분. 불러오기에 실패했으면(`failed`) «불러오지 못함»을 보인다 */
export function BadgeThumbView({
  name,
  imageUrl,
  failed,
  onError,
}: {
  name: string
  imageUrl: string
  failed: boolean
  onError: () => void
}) {
  if (failed) return <Badge variant="outline" className={WRAP}>불러오지 못함</Badge>
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 어드민의 다른 화면과 같이 <img>를 쓴다(badge-image/page.tsx)
    <img
      src={optimizedImageUrl(imageUrl, THUMB_WIDTH) ?? imageUrl}
      alt={`${name} 이미지`}
      loading="lazy"
      decoding="async"
      onError={onError}
      className="h-12 w-12 rounded-md border bg-muted object-contain"
    />
  )
}

/** 부르는 쪽이 `key`에 주소를 넣어, 주소가 바뀌면 실패 상태를 지우고 다시 시도한다 */
function BadgeThumb({ name, imageUrl }: { name: string; imageUrl: string }) {
  const [failed, setFailed] = useState(false)
  return <BadgeThumbView name={name} imageUrl={imageUrl} failed={failed} onError={() => setFailed(true)} />
}

export interface BadgeFilters {
  query: string
  templateClass: string
  kind: string
  rarity: string
  activity: string
}

interface Props {
  filters: BadgeFilters
  onFiltersChange: (next: BadgeFilters) => void
  loading: boolean
  error: string | null
  results: StudioSearchBadge[] | null
  total: number
  page: number
  totalPages: number
  selectedId: string | null
  onSearch: (page: number) => void
  onSelect: (badge: StudioSearchBadge) => void
  /** 등록하는 동안 다른 배지를 고르지 못하게 한다 */
  selectDisabled?: boolean
}

export default function BadgePicker({
  filters,
  onFiltersChange,
  loading,
  error,
  results,
  total,
  page,
  totalPages,
  selectedId,
  onSearch,
  onSelect,
  selectDisabled = false,
}: Props) {
  const set = (patch: Partial<BadgeFilters>) => onFiltersChange({ ...filters, ...patch })
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className={WRAP}>배지 검색</CardTitle>
          <CardDescription className={WRAP}>
            액티비티 배지만 검색해요. 이름이 같은 배지는 등급·레벨과 값을 확인하고 골라 주세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="배지 이름 검색 (예: 저녁)"
              value={filters.query}
              onChange={(e) => set({ query: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearch(1)
              }}
              className="sm:flex-1"
            />
            <Select value={filters.templateClass} onValueChange={(v) => set({ templateClass: v })}>
              <SelectTrigger className="sm:w-36">
                <SelectValue placeholder="분류" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>전체 분류</SelectItem>
                {CLASS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.kind} onValueChange={(v) => set({ kind: v })}>
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
            {filters.kind !== 'leveled' && (
              <Select value={filters.rarity} onValueChange={(v) => set({ rarity: v })}>
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
            <Select value={filters.activity} onValueChange={(v) => set({ activity: v })}>
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
            <Button onClick={() => onSearch(1)} disabled={loading}>
              <IconSearch className="h-4 w-4 mr-1" />
              {loading ? '검색 중…' : '검색'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <IconCircleX className="h-4 w-4" />
          <AlertTitle className={WRAP}>검색 오류</AlertTitle>
          <AlertDescription className={WRAP}>{error}</AlertDescription>
        </Alert>
      )}

      {results && (
        <Card>
          <CardHeader>
            <CardTitle className={WRAP}>검색 결과 {total}건</CardTitle>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className={`text-sm text-muted-foreground ${WRAP}`}>검색 결과가 없어요</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>배지 이름</TableHead>
                      <TableHead>등급 · 레벨</TableHead>
                      <TableHead>분류</TableHead>
                      <TableHead>값</TableHead>
                      <TableHead>이미지</TableHead>
                      <TableHead className="text-right">선택</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((b) => (
                      <TableRow key={b.id} data-state={selectedId === b.id ? 'selected' : undefined}>
                        <TableCell className={`font-medium ${WRAP}`}>{b.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{slotLabelOf(b)}</Badge>
                        </TableCell>
                        <TableCell className={`text-muted-foreground ${WRAP}`}>{b.templateClassLabel ?? '없음'}</TableCell>
                        <TableCell className={`text-muted-foreground ${WRAP}`}>{b.templateValue ?? '-'}</TableCell>
                        <TableCell>
                          {b.imageUrl ? (
                            <BadgeThumb key={b.imageUrl} name={b.name} imageUrl={b.imageUrl} />
                          ) : (
                            <Badge variant="outline" className={WRAP}>없음</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" disabled={selectDisabled} onClick={() => onSelect(b)}>
                            선택
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => onSearch(page - 1)}>
                  이전
                </Button>
                <span className="text-xs text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || page >= totalPages}
                  onClick={() => onSearch(page + 1)}
                >
                  다음
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
