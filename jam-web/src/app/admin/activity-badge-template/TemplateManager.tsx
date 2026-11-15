'use client'

/**
 * 액티비티 배지 템플릿 등록 화면의 상태 관리 (티켓 20261116_0426).
 * 파일을 고르면 브라우저에서 먼저 검증해 «저장 전 확인» 상태로 두고, 저장을 눌러야 서버에 보낸다.
 */
import { useState } from 'react'
import { toast } from 'sonner'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import type { BadgeTemplateClassKey } from '@/lib/admin/activityBadgeTemplate/resolveTemplateText'
import type { TemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import { validateTemplateSvg } from '@/lib/admin/activityBadgeTemplate/validateTemplate'
import TemplateCard, { type TemplatePending } from './TemplateCard'

const WRAP = 'break-keep wrap-break-word'

export default function TemplateManager({ initial }: { initial: TemplateItem[] }) {
  const [items, setItems] = useState<TemplateItem[]>(initial)
  const [pending, setPending] = useState<Partial<Record<BadgeTemplateClassKey, TemplatePending>>>({})
  const [busyKey, setBusyKey] = useState<BadgeTemplateClassKey | null>(null)
  const [deleting, setDeleting] = useState<TemplateItem | null>(null)

  const setPendingFor = (key: BadgeTemplateClassKey, value: TemplatePending | null) =>
    setPending((prev) => {
      const next = { ...prev }
      if (value) next[key] = value
      else delete next[key]
      return next
    })

  const handlePick = async (key: BadgeTemplateClassKey, file: File) => {
    const raw = await file.text()
    const result = validateTemplateSvg(raw)
    if (result.ok) {
      setPendingFor(key, {
        kind: 'ready',
        fileName: file.name,
        svg: result.svg,
        rawSvg: raw,
        removed: result.removed,
        slots: result.slots,
      })
    } else {
      setPendingFor(key, { kind: 'invalid', fileName: file.name, error: result.error })
    }
  }

  const handleSave = async (item: TemplateItem) => {
    const p = pending[item.classKey]
    if (p?.kind !== 'ready') return
    setBusyKey(item.classKey)
    try {
      const res = await fetch(`/api/admin/activity-badge-templates/${item.classKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ svg: p.rawSvg }),
      })
      const json = (await res.json().catch(() => null)) as { template?: TemplateItem; error?: string } | null
      if (!res.ok || !json?.template) {
        toast.error(json?.error ?? '템플릿을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
        return
      }
      const saved = json.template
      setItems((prev) => prev.map((it) => (it.classKey === saved.classKey ? saved : it)))
      setPendingFor(item.classKey, null)
      toast.success(`${item.label} 템플릿을 저장했어요.`)
    } catch {
      toast.error('템플릿을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusyKey(null)
    }
  }

  const handleDelete = async (item: TemplateItem) => {
    setDeleting(null)
    setBusyKey(item.classKey)
    try {
      const res = await fetch(`/api/admin/activity-badge-templates/${item.classKey}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        toast.error(json?.error ?? '템플릿을 지우지 못했어요. 잠시 후 다시 시도해 주세요.')
        return
      }
      setItems((prev) =>
        prev.map((it) =>
          it.classKey === item.classKey
            ? { ...it, svg: null, slots: null, updatedAt: null, updatedBy: null }
            : it
        )
      )
      setPendingFor(item.classKey, null)
      toast.success(`${item.label} 템플릿을 지웠어요.`)
    } catch {
      toast.error('템플릿을 지우지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertTitle className={WRAP}>피그마에서 내보내는 방법</AlertTitle>
        <AlertDescription>
          <ol className={`list-decimal space-y-1 pl-4 ${WRAP}`}>
            <li>이름 글자의 레이어 이름은 name, 값 글자의 레이어 이름은 value로 지어 주세요.</li>
            <li>내보내기 설정에서 Include &quot;id&quot; attribute를 켜고 Outline text를 꺼 주세요.</li>
            <li>형식을 SVG로 골라 내보낸 뒤 여기에 올려 주세요. 1MB까지 올릴 수 있어요.</li>
          </ol>
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((item) => (
          <TemplateCard
            key={item.classKey}
            item={item}
            pending={pending[item.classKey] ?? null}
            busy={busyKey === item.classKey}
            onPickFile={(file) => void handlePick(item.classKey, file)}
            onSave={() => void handleSave(item)}
            onCancel={() => setPendingFor(item.classKey, null)}
            onDelete={() => setDeleting(item)}
          />
        ))}
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className={WRAP}>{deleting?.label} 템플릿을 지울까요?</AlertDialogTitle>
            <AlertDialogDescription className={WRAP}>
              이미 등록한 배지 이미지는 그대로 남아요. 이 분류의 배지는 템플릿을 다시 올릴 때까지 새로 만들 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && void handleDelete(deleting)}>지우기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
