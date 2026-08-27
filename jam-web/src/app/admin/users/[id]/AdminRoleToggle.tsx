'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Switch } from '@/components/admin/ui/switch'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'

interface Props {
  userId: string
  userName: string
  initialIsAdmin: boolean
  /** ADMIN_EMAILS 환경변수 화이트리스트로 이미 접근 가능한 계정인지 (읽기 전용 안내용) */
  isWhitelisted: boolean
}

/**
 * 유저 어드민 권한 부여/해제 토글 (20260827_015).
 * 실수로 클릭해 권한이 즉시 바뀌지 않도록, Switch 클릭 시 바로 반영하지 않고
 * AlertDialog로 확인 후에만 API를 호출한다.
 */
export function AdminRoleToggle({ userId, userName, initialIsAdmin, isWhitelisted }: Props) {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin)
  const [pendingValue, setPendingValue] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(ItemBookForm.tsx·PoiBlockTable.tsx와 동일 패턴).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const handleConfirm = async () => {
    if (pendingValue === null) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}/admin-role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: pendingValue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '권한 변경에 실패했습니다.')
      setIsAdmin(pendingValue)
      setPendingValue(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '권한 변경 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border p-4 max-w-xl flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold">어드민 권한</p>
        <p className="text-muted-foreground text-xs mt-0.5">
          {isWhitelisted
            ? 'ADMIN_EMAILS 화이트리스트로 이미 어드민 권한이 있습니다.'
            : isAdmin
              ? '이 유저는 어드민 권한을 보유하고 있습니다.'
              : '이 유저는 어드민 권한이 없습니다.'}
        </p>
        {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
      </div>

      <Switch
        checked={isAdmin}
        disabled={loading}
        onCheckedChange={(checked) => {
          setError(null)
          setPendingValue(checked)
        }}
      />

      <AlertDialog
        open={pendingValue !== null}
        onOpenChange={(open) => {
          if (!open && !loading) setPendingValue(null)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingValue ? '어드민 권한 부여' : '어드민 권한 해제'}</AlertDialogTitle>
            <AlertDialogDescription>
              &apos;{userName}&apos;님에게 어드민 권한을 {pendingValue ? '부여' : '해제'}할까요?{' '}
              {pendingValue
                ? '어드민 화면 전체에 접근할 수 있게 됩니다.'
                : '어드민 화면 접근 권한이 사라집니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? '처리 중...' : '확인'}
            </button>
            <button
              type="button"
              onClick={() => setPendingValue(null)}
              disabled={loading}
              className="flex-1 bg-white text-foreground py-2.5 rounded-xl hover:bg-muted disabled:opacity-50 transition-colors"
            >
              취소
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
