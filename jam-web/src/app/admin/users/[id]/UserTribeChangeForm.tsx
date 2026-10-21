'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Textarea } from '@/components/admin/ui/textarea'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'

export interface TribeChangeTribeOption {
  id: string
  name: string
}

export interface TribeChangeReasonOption {
  value: string
  label: string
}

interface Props {
  userId: string
  /** 지금 트라이브 이름(확인창에 «옛 → 새»로 보인다) */
  currentTribeName: string
  /** 바꿀 수 있는 트라이브: 활성이고 지금 트라이브가 아닌 것 */
  options: TribeChangeTribeOption[]
  /** 사유 고정 목록. `lib/admin/user-tribe.ts`의 `TRIBE_CHANGE_REASONS`를 서버 구역이 넘겨 준다(그 파일은 서버 전용이라 여기서 가져오지 않는다) */
  reasons: readonly TribeChangeReasonOption[]
  /** 메모가 필수인 사유 값(`TRIBE_CHANGE_MEMO_REQUIRED_REASON`) */
  memoRequiredReason: string
  /** 메모 길이 상한(`TRIBE_CHANGE_MEMO_MAX_LENGTH`) */
  memoMaxLength: number
}

interface CancelledMissionItem {
  id: string
  title: string
}

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; missions: CancelledMissionItem[] }
  | { status: 'failed'; message: string }

const PREVIEW_FAILED = '취소되는 미션을 불러오지 못했어요.'
const CHANGE_FAILED = '트라이브를 바꾸지 못했어요.'
// 기존 어드민 화면의 네트워크 오류 문구 꼴(«네트워크 오류로 ○○하지 못했어요. 연결을 확인하고 다시 시도해 주세요.»)을 따른다.
// 요청이 서버에 닿은 뒤 응답만 잃었어도 다시 시도하면 서버가 같은 트라이브(same_tribe 409)로 거절하므로 이중 변경은 일어나지 않는다.
const PREVIEW_NETWORK_ERROR = '네트워크 오류로 취소되는 미션을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'
const CHANGE_NETWORK_ERROR = '네트워크 오류로 트라이브를 바꾸지 못했어요. 연결을 확인하고 다시 시도해 주세요.'
// API의 403 문구는 영어 «Forbidden»이라 그대로 보이지 않고 한국어로 바꾼다
const FORBIDDEN_TEXT = '이 작업을 할 권한이 없어요. 어드민 계정으로 로그인했는지 확인해 주세요.'
const UNTITLED_MISSION = '이름을 읽지 못한 미션'

async function readJsonObject(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await res.json()
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 실패 응답의 문구. API가 돌려준 `error` 고정 문구를 그대로 쓰고, 없으면(본문이 JSON이 아닌 서버 오류 등) 상태 코드를 알린다 */
function failureMessage(status: number, body: Record<string, unknown> | null, fallback: string): string {
  if (status === 403) return FORBIDDEN_TEXT
  const apiError = typeof body?.error === 'string' ? body.error.trim() : ''
  return apiError.length > 0 ? apiError : `${fallback} 서버가 ${status} 오류로 응답했어요. 잠시 후 다시 시도해 주세요.`
}

/** `GET ...?newTribeId=` 응답의 `preview.cancelledMissions`. 모양이 다르면 null — 빈 목록(취소 없음)으로 보이지 않게 한다 */
function parseCancelledMissions(body: Record<string, unknown> | null): CancelledMissionItem[] | null {
  const preview = body?.preview
  if (typeof preview !== 'object' || preview === null) return null
  const list = (preview as Record<string, unknown>).cancelledMissions
  if (!Array.isArray(list)) return null
  const missions: CancelledMissionItem[] = []
  for (const item of list) {
    const row = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>
    if (typeof row.id !== 'string') return null
    missions.push({ id: row.id, title: typeof row.title === 'string' ? row.title : '' })
  }
  return missions
}

/**
 * 유저 상세 «트라이브» 구역의 변경 양식 (티켓 20261021_1247 3회, 운영 로직 2.4절)
 *
 * 흐름: 바꿀 트라이브를 고르면 영향 미리 보기(`GET /api/admin/users/{id}/tribe?newTribeId=`)를 읽어 «취소되는 미션»을 보이고,
 * 사유와 메모를 채운 뒤 «트라이브 바꾸기» → 확인창(`AlertDialog`) → 확정(`POST /api/admin/users/{id}/tribe`).
 * - 영향 미리 보기를 읽지 못하면 영향을 모른 채 바꾸지 않도록 확정을 막는다(다시 불러오기로 풀 수 있다).
 * - 실패(409·400·403·404·500·네트워크)는 확인창을 닫고 양식 위에 문구를 보이며 입력을 그대로 둔다. 성공이면 성공 문구와 함께 양식을 비우고 `router.refresh()`로 구역을 새로 읽는다.
 * - 진행 중에는 입력과 버튼을 잠그고, 같은 틱의 중복 클릭은 `submittingRef`로 막는다.
 */
export function UserTribeChangeForm({ userId, currentTribeName, options, reasons, memoRequiredReason, memoMaxLength }: Props) {
  const router = useRouter()
  const [newTribeId, setNewTribeId] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const [memo, setMemo] = useState('')
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const submittingRef = useRef(false)
  /** 미리 보기 요청 번호 — 트라이브를 연달아 바꿀 때 늦게 온 옛 응답이 새 선택의 결과를 덮지 않게 한다 */
  const previewSeqRef = useRef(0)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(AdminRoleToggle.tsx와 동일 패턴).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const selectedTribe = options.find((o) => o.id === newTribeId) ?? null
  const memoRequired = reasonCode === memoRequiredReason
  const memoTrimmed = memo.trim()
  const canSubmit =
    selectedTribe !== null &&
    reasonCode !== '' &&
    (!memoRequired || memoTrimmed.length > 0) &&
    preview.status === 'ready' &&
    !submitting

  const loadPreview = async (tribeId: string) => {
    const seq = ++previewSeqRef.current
    setPreview({ status: 'loading' })
    try {
      const res = await fetch(`/api/admin/users/${userId}/tribe?newTribeId=${encodeURIComponent(tribeId)}`)
      const body = await readJsonObject(res)
      if (seq !== previewSeqRef.current) return
      if (!res.ok) {
        setPreview({ status: 'failed', message: failureMessage(res.status, body, PREVIEW_FAILED) })
        return
      }
      const missions = parseCancelledMissions(body)
      setPreview(
        missions === null
          ? { status: 'failed', message: `${PREVIEW_FAILED} 잠시 후 다시 시도해 주세요.` }
          : { status: 'ready', missions }
      )
    } catch {
      if (seq === previewSeqRef.current) setPreview({ status: 'failed', message: PREVIEW_NETWORK_ERROR })
    }
  }

  const handleTribeChange = (tribeId: string) => {
    setNewTribeId(tribeId)
    setError(null)
    setSuccess(null)
    void loadPreview(tribeId)
  }

  const submit = async () => {
    if (submittingRef.current || !canSubmit) return
    submittingRef.current = true
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}/tribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newTribeId, reasonCode, ...(memoTrimmed.length > 0 ? { memo: memoTrimmed } : {}) }),
      })
      const body = await readJsonObject(res)
      if (!res.ok) {
        setError(failureMessage(res.status, body, CHANGE_FAILED))
        setConfirmOpen(false)
        return
      }
      const cancelledCount = Array.isArray(body?.cancelledMissions) ? body.cancelledMissions.length : null
      setSuccess(
        cancelledCount === null
          ? '트라이브를 바꿨어요.'
          : `트라이브를 바꿨어요. 취소된 미션은 ${cancelledCount}개예요.`
      )
      setNewTribeId('')
      setReasonCode('')
      setMemo('')
      previewSeqRef.current += 1
      setPreview({ status: 'idle' })
      setConfirmOpen(false)
      router.refresh()
    } catch {
      setError(CHANGE_NETWORK_ERROR)
      setConfirmOpen(false)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <p className="text-sm font-bold break-keep wrap-break-word">트라이브 바꾸기</p>

      {success && (
        <div
          role="status"
          className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-green-700 text-sm break-keep wrap-break-word"
        >
          {success}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-600 text-sm break-keep wrap-break-word"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">바꿀 트라이브</span>
        <Select value={newTribeId} onValueChange={handleTribeChange} disabled={submitting}>
          <SelectTrigger aria-label="바꿀 트라이브">
            <SelectValue placeholder="트라이브를 골라 주세요" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {newTribeId !== '' && (
        <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm space-y-1.5">
          {preview.status === 'loading' && (
            <p className="text-muted-foreground break-keep wrap-break-word">취소되는 미션을 확인하고 있어요.</p>
          )}
          {preview.status === 'failed' && (
            <>
              <p role="alert" className="text-red-600 break-keep wrap-break-word text-pretty">
                {preview.message}
              </p>
              <button
                type="button"
                onClick={() => void loadPreview(newTribeId)}
                className="text-sm font-bold underline whitespace-nowrap"
              >
                다시 불러오기
              </button>
            </>
          )}
          {preview.status === 'ready' && preview.missions.length === 0 && (
            <p className="text-foreground break-keep wrap-break-word">취소되는 미션이 없어요</p>
          )}
          {preview.status === 'ready' && preview.missions.length > 0 && (
            <>
              <p className="font-bold text-foreground break-keep wrap-break-word">취소되는 미션 {preview.missions.length}개</p>
              <ul className="list-disc pl-5 text-foreground">
                {preview.missions.map((m) => (
                  <li key={m.id} className="break-keep wrap-break-word">
                    {m.title.length > 0 ? m.title : UNTITLED_MISSION}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">사유</span>
        <Select value={reasonCode} onValueChange={setReasonCode} disabled={submitting}>
          <SelectTrigger aria-label="사유">
            <SelectValue placeholder="사유를 골라 주세요" />
          </SelectTrigger>
          <SelectContent>
            {reasons.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`tribe-change-memo-${userId}`} className="text-xs text-muted-foreground break-keep wrap-break-word">
            {memoRequired ? '메모 (필수)' : '메모 (선택)'}
          </label>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {memo.length}/{memoMaxLength}
          </span>
        </div>
        <Textarea
          id={`tribe-change-memo-${userId}`}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={memoMaxLength}
          rows={3}
          disabled={submitting}
          placeholder={memoRequired ? '바꾸는 이유를 적어 주세요' : '남기고 싶은 내용이 있으면 적어 주세요'}
        />
      </div>

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={!canSubmit}
        className="bg-primary text-white font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm whitespace-nowrap"
      >
        트라이브 바꾸기
      </button>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !submitting) setConfirmOpen(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-keep wrap-break-word text-balance">트라이브를 바꿀까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 break-keep wrap-break-word text-pretty">
                <p className="text-foreground font-bold">
                  {currentTribeName} → {selectedTribe?.name ?? ''}
                </p>
                <p>이미 가진 배지·잼·챕터는 그대로예요.</p>
                <p>
                  {preview.status === 'ready' && preview.missions.length > 0
                    ? `참가 중인 트라이브 미션 ${preview.missions.length}개가 취소돼요.`
                    : '취소되는 미션이 없어요.'}
                </p>
                <p>바꾼 뒤 유저에게 알림이 가요.</p>
                <p>되돌릴 때는 다시 바꾸면 돼요.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {submitting ? '바꾸는 중' : '바꾸기'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
              className="flex-1 bg-white text-foreground py-2.5 rounded-xl hover:bg-muted disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              취소
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
