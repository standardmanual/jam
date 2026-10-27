'use client'

/**
 * 코드 고정 정책의 [개발 요청] 영역 (티켓 20261026_2027 3-1, PRD admin-boards §7·§8)
 *
 * - 열린 요청이 없으면 [개발 요청] 버튼이다. 누르면 대화상자가 열리고(제목은 정책 제목으로 채움, 내용은 선택 입력)
 *   [요청 보내기]가 `POST /api/admin/dev-requests`(`origin: 'eco'`, `policyId`)를 부른다.
 * - 성공하면 토스트와 함께 「요청 N번 접수됨」과 [접기]로 바뀐다. 409면 대화상자 안에 「같은 정책의 요청 N번이 이미 열려 있어요」를 보인다.
 * - 열린 요청이 있으면(처음부터든, 방금 접수했든) 「요청 N번 접수됨」과 [접기]를 보인다. [접기]는 그 요청을 닫는다(`status: 'dismissed'`).
 *
 * 서버 모듈을 가져오지 않는다(`devRequestClient`와 상수 모듈만).
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/admin/ui/dialog'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { DEV_REQUEST_MAX_DETAIL, DEV_REQUEST_MAX_TITLE } from '@/lib/admin/devRequests/constants'
import { dismissDevRequest, postDevRequest } from './devRequestClient'

export interface OpenDevRequest {
  id: string
  no: number
}

export interface DevRequestButtonProps {
  policyId: string
  policyTitle: string
  /** 이 정책에 이미 열린 요청. 없으면 `null` */
  openRequest: OpenDevRequest | null
}

export function DevRequestButton({ policyId, policyTitle, openRequest }: DevRequestButtonProps) {
  const [open, setOpen] = useState<OpenDevRequest | null>(openRequest)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [title, setTitle] = useState(policyTitle.slice(0, DEV_REQUEST_MAX_TITLE))
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    const outcome = await postDevRequest({ title, detail, policyId })
    setBusy(false)
    if (outcome.kind === 'created') {
      setOpen({ id: outcome.id, no: outcome.no })
      setDialogOpen(false)
      setDetail('')
      toast.success(`개발 요청 ${outcome.no}번을 접수했어요`)
      return
    }
    setError(outcome.message)
  }

  async function dismiss() {
    if (open === null) return
    setBusy(true)
    const outcome = await dismissDevRequest(open.id)
    setBusy(false)
    if (outcome.kind === 'dismissed') {
      toast.success(`개발 요청 ${open.no}번을 접었어요`)
      setOpen(null)
      return
    }
    toast.error(outcome.message)
  }

  if (open !== null) {
    return (
      <div data-dev-request="open" className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-emerald-700 break-keep wrap-break-word">요청 {open.no}번 접수됨</span>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={dismiss} className="whitespace-nowrap">
          접기
        </Button>
      </div>
    )
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(next) => {
        setDialogOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="whitespace-nowrap">
          개발 요청
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-balance break-keep wrap-break-word">개발 요청</DialogTitle>
          <DialogDescription className="text-pretty break-keep wrap-break-word">
            코드에 고정된 값이라 개발로 바꿔야 해요. 바꾸고 싶은 내용을 적어 주세요
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">제목</span>
            <Input value={title} maxLength={DEV_REQUEST_MAX_TITLE} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">내용 (선택)</span>
            <Textarea value={detail} maxLength={DEV_REQUEST_MAX_DETAIL} rows={5} onChange={(event) => setDetail(event.target.value)} />
          </label>
          {error !== null ? (
            <p role="alert" className="text-sm text-red-700 break-keep wrap-break-word">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setDialogOpen(false)}>
            취소
          </Button>
          <Button type="button" disabled={busy || title.trim() === ''} onClick={submit}>
            요청 보내기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
