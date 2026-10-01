'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/admin/ui/alert-dialog'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import MultiBadgeSearchSelect, { type SelectedBadge } from '@/components/admin/MultiBadgeSearchSelect'
import PoiMultiSearchSelect, { type SelectedPoi } from '@/components/admin/PoiMultiSearchSelect'
import { AMBIENT_SCHEDULE_MAX_TOTAL, AMBIENT_SCHEDULE_TITLE_MAX } from '@/lib/ambient-drop/scheduleSpec'
import {
  bookExposure,
  buildScheduleBody,
  describeNowRunOutcome,
  formatScheduleAt,
  kstYmd,
  nowDeployConfirmText,
  scheduleAtParts,
  scheduleDraftTotal,
  type AmbientDropSchedulePreview,
  type ScheduleDraft,
  type ScheduleWhen,
} from '@/lib/ambient-drop/scheduleView'
import type { AmbientDropItemMode, AmbientDropPoiMode } from '@/types/database'

export interface ScheduleFormBook {
  id: string
  name: string
  valid_from: string | null
  valid_until: string | null
}

interface ScheduleFormProps {
  /** 서버가 넘기는 기준 시각(하이드레이션 일치를 위해 렌더 중 `new Date()`를 부르지 않는다) */
  nowIso: string
  categories: { slug: string; label: string }[]
  books: ScheduleFormBook[]
  tribes: { id: string; name: string }[]
  /** 등록에 성공했을 때 부른다. 부모가 toast와 목록 재조회를 맡는다 */
  onRegistered: (scheduledAtIso: string) => void
  /** 「지금」 지정 배포에 성공했을 때 부른다. 부모가 toast와 이력 갱신을 맡는다(저장 행이 없어 예약 목록은 그대로다) */
  onDeployed?: (resultText: string) => void
}

const ALL_CATEGORY_VALUE = '__ALL__'
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const pad2 = (n: number) => String(n).padStart(2, '0')

/** 미리 확인 결과 안내. 입력이 바뀌어 낡았으면 흐리게 하고 다시 확인하라고 알린다 */
export function SchedulePreviewNotice({
  preview,
  stale = false,
}: {
  preview: AmbientDropSchedulePreview | null
  stale?: boolean
}) {
  if (!preview) return null

  let body: React.ReactNode
  if (preview.problem) {
    body = <p className="text-sm text-red-600">{preview.problem}</p>
  } else if (preview.poiMode === 'category') {
    body = (
      <p className="text-sm text-foreground">
        운영 중인 지점 {preview.eligiblePoiCount}곳에 흩어 드랍해요. 한도를 넘는 지점은 건너뛰고, 자리가 모자라면
        있는 만큼만 드랍해요.
      </p>
    )
  } else if (preview.overlappedPoiCount > 0) {
    body = (
      <p className="text-sm text-amber-700">
        이미 드랍이 있는 지점 {preview.overlappedPoiCount}곳(겹쳐서 놓여요)
      </p>
    )
  } else {
    body = <p className="text-sm text-foreground">이미 드랍이 있는 지점은 없어요. 겹치지 않고 놓여요.</p>
  }

  return (
    <div
      className={`rounded-xl border border-border bg-muted/40 px-4 py-3 space-y-1 ${stale ? 'opacity-50' : ''}`}
      data-stale={stale ? 'true' : 'false'}
    >
      {body}
      {stale && <p className="text-xs text-muted-foreground">입력이 바뀌었어요. 다시 확인해 주세요.</p>}
    </div>
  )
}

/** 공개 예정일을 「10/5」 꼴로 */
function monthDay(iso: string): string {
  const [, m, d] = scheduleAtParts(iso).ymd.split('-')
  return `${Number(m)}/${Number(d)}`
}

export default function ScheduleForm({ nowIso, categories, books, tribes, onRegistered, onDeployed }: ScheduleFormProps) {
  // Select 드롭다운(Radix Portal)은 어드민 테마 스코프 노드 안에 그려야 한다(AmbientDropForm과 같은 패턴)
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const [title, setTitle] = useState('')
  const [whenKind, setWhenKind] = useState<ScheduleWhen['kind']>('at')
  const [ymd, setYmd] = useState('')
  const [hour, setHour] = useState(9)
  const [poiMode, setPoiMode] = useState<AmbientDropPoiMode>('list')
  const [pois, setPois] = useState<SelectedPoi[]>([])
  const [perPoiCount, setPerPoiCount] = useState(1)
  const [poiCategory, setPoiCategory] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(10)
  const [itemMode, setItemMode] = useState<AmbientDropItemMode>('items')
  const [badges, setBadges] = useState<SelectedBadge[]>([])
  const [collectionIds, setCollectionIds] = useState<string[]>([])

  const [preview, setPreview] = useState<{ key: string; value: AmbientDropSchedulePreview } | null>(null)
  const [busy, setBusy] = useState<'preview' | 'register' | 'deploy' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deployResult, setDeployResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const draft: ScheduleDraft = {
    title,
    when: whenKind === 'now' ? { kind: 'now' } : { kind: 'at', ymd, hour },
    poiMode,
    poiIds: pois.map((p) => p.id),
    perPoiCount,
    poiCategory,
    totalCount,
    itemMode,
    badgeIds: badges.map((b) => b.id),
    collectionIds,
  }
  const body = buildScheduleBody(draft)
  const bodyKey = JSON.stringify(body)
  const total = scheduleDraftTotal(draft)
  const overLimit = total > AMBIENT_SCHEDULE_MAX_TOTAL

  const poiReady = poiMode === 'list' ? pois.length >= 1 && perPoiCount >= 1 : totalCount >= 1
  const itemReady = itemMode === 'items' ? badges.length >= 1 : collectionIds.length >= 1
  const canPreview = (whenKind === 'now' || ymd !== '') && poiReady && itemReady && !overLimit && busy === null

  const freshPreview = preview && preview.key === bodyKey ? preview.value : null
  const canRegister = canPreview && freshPreview !== null && !freshPreview.problem

  const isNow = whenKind === 'now'
  const poiCount = poiMode === 'list' ? pois.length : null

  const readNumber = (raw: string) => {
    const n = Number(raw)
    return Number.isFinite(n) ? Math.trunc(n) : 0
  }

  const handlePreview = async () => {
    setBusy('preview')
    setError(null)
    setDeployResult(null)
    try {
      const res = await fetch('/api/admin/ambient-drop/schedules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyKey,
      })
      const json = await res.json()
      if (!res.ok) {
        setPreview(null)
        setError(json.error ?? '미리 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
      } else {
        setPreview({ key: bodyKey, value: json.preview })
      }
    } catch {
      setError('네트워크 오류로 미리 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setBusy(null)
    }
  }

  const handleRegister = async () => {
    setBusy('register')
    setError(null)
    try {
      const res = await fetch('/api/admin/ambient-drop/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyKey,
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '예약을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.')
      } else {
        const scheduledAt = typeof json.schedule?.scheduledAt === 'string' ? json.schedule.scheduledAt : null
        setTitle('')
        setYmd('')
        setPois([])
        setBadges([])
        setCollectionIds([])
        setPreview(null)
        onRegistered(scheduledAt ?? '')
      }
    } catch {
      setError('네트워크 오류로 등록하지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setBusy(null)
    }
  }

  const handleDeploy = async () => {
    setBusy('deploy')
    setError(null)
    setDeployResult(null)
    try {
      const res = await fetch('/api/admin/ambient-drop/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyKey,
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '지금 드랍하지 못했어요. 잠시 후 다시 시도해 주세요.')
      } else {
        const text = describeNowRunOutcome(json.outcome)
        setDeployResult(text)
        if (json.outcome?.status === 'done') {
          setTitle('')
          setPois([])
          setBadges([])
          setCollectionIds([])
          setPreview(null)
        }
        onDeployed?.(text)
      }
    } catch {
      setError('네트워크 오류로 드랍하지 못했어요. 연결을 확인하고 이력에서 결과를 확인해 주세요.')
    } finally {
      setBusy(null)
      setConfirmOpen(false)
    }
  }

  const toggleCollection = (id: string, checked: boolean) =>
    setCollectionIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-sm text-foreground">이름 (선택)</span>
        <Input
          className="mt-1"
          maxLength={AMBIENT_SCHEDULE_TITLE_MAX}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 10월 첫째 주 카페 드랍"
        />
      </label>

      <div>
        <span className="text-sm text-foreground">드랍 시각 (한국 시각, 정시)</span>
        <Tabs value={whenKind} onValueChange={(v) => setWhenKind(v as ScheduleWhen['kind'])} className="mt-1">
          <TabsList>
            <TabsTrigger value="at">날짜 지정</TabsTrigger>
            <TabsTrigger value="now">지금</TabsTrigger>
          </TabsList>
          <TabsContent value="at">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                className="w-auto"
                min={kstYmd(nowIso)}
                value={ymd}
                onChange={(e) => setYmd(e.target.value)}
                aria-label="드랍 날짜"
              />
              <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
                <SelectTrigger className="w-auto min-w-[6rem]" aria-label="드랍 시">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={themeContainer ?? undefined}>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {pad2(h)}시
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
          <TabsContent value="now">
            <p className="text-xs text-muted-foreground">
              저장하지 않고 지정한 지점·아이템으로 지금 한 번만 드랍해요. 매일 배포 설정은 바뀌지 않아요.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      <div>
        <span className="text-sm text-foreground">지점</span>
        <Tabs value={poiMode} onValueChange={(v) => setPoiMode(v as AmbientDropPoiMode)} className="mt-1">
          <TabsList>
            <TabsTrigger value="list">지점 직접 선택</TabsTrigger>
            <TabsTrigger value="category">지점 종류+개수</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="space-y-2">
            <PoiMultiSearchSelect selected={pois} onChange={setPois} />
            <label className="block max-w-[10rem]">
              <span className="text-xs text-foreground">지점당 개수</span>
              <Input
                type="number"
                min={1}
                step={1}
                className="mt-1"
                value={perPoiCount}
                onChange={(e) => setPerPoiCount(readNumber(e.target.value))}
              />
            </label>
          </TabsContent>
          <TabsContent value="category" className="space-y-2">
            <Select
              value={poiCategory ?? ALL_CATEGORY_VALUE}
              onValueChange={(v) => setPoiCategory(v === ALL_CATEGORY_VALUE ? null : v)}
            >
              <SelectTrigger className="w-auto min-w-[10rem]" aria-label="지점 종류 선택">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={themeContainer ?? undefined}>
                <SelectItem value={ALL_CATEGORY_VALUE}>전체 종류</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="block max-w-[10rem]">
              <span className="text-xs text-foreground">총 개수</span>
              <Input
                type="number"
                min={1}
                step={1}
                className="mt-1"
                value={totalCount}
                onChange={(e) => setTotalCount(readNumber(e.target.value))}
              />
            </label>
          </TabsContent>
        </Tabs>
      </div>

      <div>
        <span className="text-sm text-foreground">놓을 것</span>
        <Tabs value={itemMode} onValueChange={(v) => setItemMode(v as AmbientDropItemMode)} className="mt-1">
          <TabsList>
            <TabsTrigger value="items">아이템 직접 선택</TabsTrigger>
            <TabsTrigger value="collections">컬렉션 선택</TabsTrigger>
          </TabsList>
          <TabsContent value="items">
            <MultiBadgeSearchSelect selected={badges} onChange={setBadges} tribes={tribes} itemBooks={books} badgeType="item" />
          </TabsContent>
          <TabsContent value="collections">
            <div className="max-h-56 overflow-y-auto space-y-1.5 border border-border rounded-xl p-3">
              {books.map((b) => {
                const exposure = bookExposure(b, nowIso)
                return (
                  <label key={b.id} className="flex items-center gap-2.5 text-sm py-1">
                    <Checkbox
                      checked={collectionIds.includes(b.id)}
                      disabled={exposure === 'ended'}
                      onCheckedChange={(checked) => toggleCollection(b.id, checked === true)}
                    />
                    {b.name}
                    {exposure === 'prelaunch' && b.valid_from && (
                      <Badge variant="outline">공개 전 · {monthDay(b.valid_from)} 공개</Badge>
                    )}
                    {exposure === 'ended' && <Badge variant="outline">기간 끝남</Badge>}
                  </label>
                )
              })}
              {books.length === 0 && <p className="text-xs text-muted-foreground">활성 컬렉션이 없어요.</p>}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <p className={`text-sm ${overLimit ? 'text-red-600' : 'text-muted-foreground'}`}>
        총 {total}개 · 한 예약 최대 {AMBIENT_SCHEDULE_MAX_TOTAL}개
      </p>

      <SchedulePreviewNotice preview={preview?.value ?? null} stale={preview !== null && freshPreview === null} />

      {freshPreview && !freshPreview.problem && !isNow && ymd !== '' && (
        <p className="text-xs text-muted-foreground">
          {formatScheduleAt(freshPreview.scheduledAt)}에 {freshPreview.requested}개를 드랍해요.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!canPreview} onClick={handlePreview}>
          {busy === 'preview' ? '확인 중…' : '확인하기'}
        </Button>
        {isNow ? (
          <Button type="button" disabled={!canRegister} onClick={() => setConfirmOpen(true)}>
            {busy === 'deploy' ? '드랍 중…' : '지금 드랍'}
          </Button>
        ) : (
          <Button type="button" disabled={!canRegister} onClick={handleRegister}>
            {busy === 'register' ? '등록 중…' : '예약 등록'}
          </Button>
        )}
        {!canRegister && canPreview && freshPreview === null && (
          <span className="text-xs text-muted-foreground">먼저 「확인하기」로 등록 전 점검을 받아 주세요.</span>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {deployResult && <p className="text-sm text-foreground">{deployResult}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={(open) => busy !== 'deploy' && setConfirmOpen(open)}>
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>지금 드랍할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {poiCount !== null ? nowDeployConfirmText(total, poiCount) : `지금 ${total}개를 드랍해요. 드랍한 뒤에는 되돌릴 수 없어요.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'deploy'}>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'deploy'}
              onClick={(e) => {
                e.preventDefault()
                void handleDeploy()
              }}
            >
              지금 드랍
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
