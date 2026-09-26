'use client'

import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { Button } from '@/components/admin/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'
import { runBulk, type BulkRunResponse } from '@/components/admin/data-table/admin-fetch'

interface AssignTribeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ids: string[]
  tribes: { id: string; name: string }[]
  pending: boolean
  onConfirm: (tribeId: string) => void
}

/**
 * 배지 트라이브 일괄 지정 다이얼로그(티켓 20260924_0944, 상위 티켓 §4.1 배지 행, 등급 1) —
 * 트라이브를 고르면 건너뛸 항목(체크인 배지·소속 컬렉션 트라이브 불일치)을 바로 미리보기로
 * 보여준다. 등급 1 확인창(`BulkConfirmDialog`)은 `level>=2`일 때만 영향 영역을 그리므로,
 * 이 미리보기를 넣으려면 별도 다이얼로그가 필요하다.
 */
export function AssignTribeDialog({ open, onOpenChange, ids, tribes, pending, onConfirm }: AssignTribeDialogProps) {
  const container = useAdminPortalContainer()

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onOpenChange(false)
      }}
    >
      <AlertDialogContent container={container ?? undefined}>
        {/* 내용을 별도 컴포넌트로 두면 닫힐 때 함께 사라져 선택·미리보기 상태가 저절로 초기화된다 */}
        <AssignTribeDialogBody
          ids={ids}
          tribes={tribes}
          pending={pending}
          container={container ?? undefined}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface AssignTribeDialogBodyProps {
  ids: string[]
  tribes: { id: string; name: string }[]
  pending: boolean
  container: HTMLElement | undefined
  onCancel: () => void
  onConfirm: (tribeId: string) => void
}

function AssignTribeDialogBody({ ids, tribes, pending, container, onCancel, onConfirm }: AssignTribeDialogBodyProps) {
  const [tribeId, setTribeId] = useState('')
  // 미리보기 결과에 어느 트라이브에 대한 것인지 함께 담아, 트라이브를 바꾸면 이전 결과가 자동으로 무효가 된다
  const [previewState, setPreviewState] = useState<{ tribeId: string; result: BulkRunResponse | null } | null>(null)

  // 부모가 `ids` 배열 참조를 렌더마다 새로 만들어도 미리보기가 다시 나가지 않도록, 효과는 내용이 같으면
  // 같은 값인 문자열 키에만 의존한다(티켓 20260924_1405). id는 UUID라 쉼표가 들어가지 않는다.
  const idsKey = ids.join(',')

  useEffect(() => {
    if (!tribeId) return
    let cancelled = false
    const previewIds = idsKey ? idsKey.split(',') : []
    runBulk('/api/admin/badges/list-bulk', { ids: previewIds, action: 'assign_tribe', payload: { tribe_id: tribeId }, dry_run: true })
      .then((result) => {
        if (!cancelled) setPreviewState({ tribeId, result })
      })
      .catch(() => {
        if (!cancelled) setPreviewState({ tribeId, result: null })
      })
    return () => {
      cancelled = true
    }
  }, [tribeId, idsKey])

  const previewReady = !!tribeId && previewState?.tribeId === tribeId
  const preview = previewReady ? previewState.result : null
  const previewLoading = !!tribeId && !previewReady
  const confirmDisabled = pending || !tribeId || previewLoading || (preview?.processed.length ?? 0) === 0

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>배지 트라이브 일괄 지정</AlertDialogTitle>
        <AlertDialogDescription>선택한 {ids.length}건에 트라이브를 지정할까요?</AlertDialogDescription>
      </AlertDialogHeader>

      <Select value={tribeId} onValueChange={setTribeId} disabled={pending}>
        <SelectTrigger aria-label="지정할 트라이브">
          <SelectValue placeholder="트라이브를 선택하세요" />
        </SelectTrigger>
        <SelectContent container={container}>
          {tribes.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {tribeId && (
        <div className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          {previewLoading ? (
            '영향을 확인하는 중...'
          ) : !preview ? (
            '영향을 확인하지 못했어요. 다시 선택해 주세요.'
          ) : preview.skipped.length > 0 ? (
            <>
              {preview.processed.length}건에 지정됩니다. {preview.skipped.length}건은 체크인 배지이거나 소속
              컬렉션의 트라이브와 달라 건너뜁니다.
            </>
          ) : (
            <>선택한 {preview.processed.length}건 모두에 지정됩니다.</>
          )}
        </div>
      )}

      <AlertDialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          취소
        </Button>
        <Button type="button" disabled={confirmDisabled} onClick={() => onConfirm(tribeId)}>
          {pending ? '처리 중...' : '지정'}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
