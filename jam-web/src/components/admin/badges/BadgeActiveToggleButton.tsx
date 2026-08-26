'use client'

import { useEffect, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'

interface BadgeActiveToggleButtonProps {
  badgeId: string
  isActive: boolean
  className?: string
}

/**
 * 배지 목록·상세 화면에서 즉시 활성/비활성을 토글하는 버튼(20260823_006).
 * BadgeForm.tsx의 저장 흐름과는 별개 — 클릭 즉시 PATCH /api/admin/badges/[id]를 호출해
 * 반영한다(별도 저장 버튼 없음). 비활성화(끄기)만 AlertDialog로 확인받고, 활성화(켜기)는
 * 확인 없이 즉시 반영한다.
 */
export function BadgeActiveToggleButton({ badgeId, isActive, className }: BadgeActiveToggleButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(20260827_002 게이트 리뷰에서 alert-dialog.tsx 팔레트 전환 후 미연결 시 흰
  // 배경 위 흰 글씨로 안 보이는 회귀를 발견해 추가).
  const [themeContainer, setThemeContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setThemeContainer(document.querySelector<HTMLElement>('[data-admin-theme]'))
  }, [])

  const toggle = async (nextActive: boolean) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/badges/${badgeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? '상태 변경에 실패했습니다. 다시 시도해주세요.')
        return
      }
      router.refresh()
    } finally {
      setLoading(false)
      setShowConfirm(false)
    }
  }

  const handleClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isActive) {
      setShowConfirm(true)
    } else {
      toggle(true)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className ?? 'h-8'}
        disabled={loading}
        onClick={handleClick}
      >
        {isActive ? '비활성화' : '활성화'}
      </Button>

      <AlertDialog
        open={showConfirm}
        onOpenChange={(open) => {
          if (!open && !loading) setShowConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>배지 비활성화</AlertDialogTitle>
            <AlertDialogDescription>
              이 배지를 비활성화하면 이미 획득한 유저에게 더 이상 보이지 않습니다. 계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={loading} onClick={() => setShowConfirm(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={loading} onClick={() => toggle(false)}>
              계속
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
