'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/admin/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import {
  formatScheduleAt,
  kstYmd,
  scheduleAtParts,
  toScheduledAtIso,
  type AmbientDropScheduleListItem,
  type AmbientDropScheduleNames,
} from '@/lib/ambient-drop/scheduleView'
import ScheduleForm, { type ScheduleFormBook } from './ScheduleForm'
import ScheduleList from './ScheduleList'

interface ScheduleSectionProps {
  initialItems: AmbientDropScheduleListItem[]
  initialNames: AmbientDropScheduleNames
  /** 서버가 첫 목록을 읽지 못했을 때의 문장 */
  initialError?: string | null
  /** 서버가 넘기는 기준 시각 */
  nowIso: string
  categories: { slug: string; label: string }[]
  books: ScheduleFormBook[]
  tribes: { id: string; name: string }[]
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** 「날짜 예약」 구역 — 등록 폼·목록·취소·시각 수정. 첫 데이터는 서버가 props로 준다(마운트 때 조회하지 않는다) */
export default function ScheduleSection({
  initialItems,
  initialNames,
  initialError = null,
  nowIso,
  categories,
  books,
  tribes,
}: ScheduleSectionProps) {
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const [items, setItems] = useState(initialItems)
  const [names, setNames] = useState(initialNames)
  const [listError, setListError] = useState<string | null>(initialError)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [cancelTarget, setCancelTarget] = useState<AmbientDropScheduleListItem | null>(null)
  const [editTarget, setEditTarget] = useState<AmbientDropScheduleListItem | null>(null)
  const [editYmd, setEditYmd] = useState('')
  const [editHour, setEditHour] = useState(9)
  const [editError, setEditError] = useState<string | null>(null)

  /** 목록 재조회. 성공하면 true */
  const reload = async (): Promise<boolean> => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/ambient-drop/schedules')
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? '예약 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.')
        return false
      }
      setItems(json.schedules)
      setNames(json.names)
      setListError(null)
      return true
    } catch {
      toast.error('네트워크 오류로 목록을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
      return false
    } finally {
      setRefreshing(false)
    }
  }

  const handleRegistered = async (scheduledAtIso: string) => {
    toast.success(scheduledAtIso ? `예약을 등록했어요. ${formatScheduleAt(scheduledAtIso)}에 드랍해요.` : '예약을 등록했어요.')
    await reload()
  }

  const handleDeployed = (resultText: string) => {
    toast.success(resultText)
  }

  const handleCancel = async () => {
    const target = cancelTarget
    if (!target) return
    setBusyId(target.id)
    try {
      const res = await fetch(`/api/admin/ambient-drop/schedules/${target.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error ?? '예약을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.')
      } else {
        toast.success('예약을 취소했어요. 이 예약은 드랍하지 않아요.')
      }
      setCancelTarget(null)
      await reload()
    } catch {
      toast.error('네트워크 오류로 취소하지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setBusyId(null)
    }
  }

  const openEdit = (item: AmbientDropScheduleListItem) => {
    const parts = scheduleAtParts(item.scheduledAt)
    setEditYmd(parts.ymd)
    setEditHour(parts.hour)
    setEditError(null)
    setEditTarget(item)
  }

  const handleEdit = async () => {
    const target = editTarget
    if (!target) return
    setBusyId(target.id)
    setEditError(null)
    try {
      const res = await fetch(`/api/admin/ambient-drop/schedules/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: toScheduledAtIso(editYmd, editHour) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEditError(json.error ?? '시각을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.')
        return
      }
      toast.success('시각을 바꿨어요.')
      setEditTarget(null)
      await reload()
    } catch {
      setEditError('네트워크 오류로 시각을 수정하지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="bg-white border border-border rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="font-bold mb-1">날짜 예약</h2>
        <p className="text-muted-foreground text-xs">
          날짜(한국 시각 정시)·장소·아이템을 정해 두면 그 시각에 한 번 드랍해요. 예약 배포 설정은 쓰지도 바꾸지도
          않아요. 드랍한 뒤에는 내리지 않아요. 실행 전에는 취소하거나 시각을 바꿀 수 있고, 내용을 바꾸려면
          취소하고 새로 등록해요. 「지금」을 고르면 저장 없이 바로 한 번 드랍해요.
        </p>
      </div>

      <ScheduleForm
        nowIso={nowIso}
        categories={categories}
        books={books}
        tribes={tribes}
        onRegistered={handleRegistered}
        onDeployed={handleDeployed}
      />

      <div className="border-t border-border pt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">예약 목록 (최근 50건)</h3>
          <Button type="button" size="sm" variant="outline" disabled={refreshing} onClick={() => void reload()}>
            {refreshing ? '불러오는 중…' : '새로고침'}
          </Button>
        </div>
        {listError && <p className="text-sm text-red-600 mb-2">{listError}</p>}
        <ScheduleList
          items={items}
          names={names}
          categories={categories}
          onCancel={setCancelTarget}
          onReschedule={openEdit}
          busyId={busyId}
        />
      </div>

      <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>이 예약을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget ? `${formatScheduleAt(cancelTarget.scheduledAt)} 예약이에요. ` : ''}
              취소하면 드랍하지 않아요. 목록에는 「취소」로 남고 다시 되살릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleCancel()
              }}
              disabled={busyId !== null}
            >
              예약 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent container={themeContainer ?? undefined}>
          <DialogHeader>
            <DialogTitle>드랍 시각 수정</DialogTitle>
            <DialogDescription>
              장소·아이템은 바꾸지 않고 시각만 바꿔요. 내용을 바꾸려면 취소하고 새로 등록해 주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              className="w-auto"
              min={kstYmd(nowIso)}
              value={editYmd}
              onChange={(e) => setEditYmd(e.target.value)}
              aria-label="새 드랍 날짜"
            />
            <Select value={String(editHour)} onValueChange={(v) => setEditHour(Number(v))}>
              <SelectTrigger className="w-auto min-w-[6rem]" aria-label="새 드랍 시">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={themeContainer ?? undefined}>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {String(h).padStart(2, '0')}시
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {editError && <p className="text-sm text-red-600">{editError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
              닫기
            </Button>
            <Button type="button" disabled={editYmd === '' || busyId !== null} onClick={() => void handleEdit()}>
              시각 바꾸기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
