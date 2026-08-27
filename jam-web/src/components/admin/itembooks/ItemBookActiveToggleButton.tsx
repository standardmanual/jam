'use client'

import { useState, type MouseEvent } from 'react'
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

interface ItemBookActiveToggleButtonProps {
  itemBookId: string
  isActive: boolean
  className?: string
}

/**
 * 컬렉션 목록 화면에서 즉시 활성/비활성을 토글하는 버튼(20260823_006).
 * ItemBookForm.tsx(수정 폼)의 "저장 시점까지 반영을 미루는" 기존 Switch 흐름과는 완전히
 * 별개의 코드 경로 — 클릭 즉시 PATCH /api/admin/itembooks/[id]를 호출해 반영한다(별도 저장
 * 버튼 없음). 비활성화(끄기)는 폼과 동일하게 /deactivation-impact로 영향 범위(소속 활성
 * 배지 수·보유 유저 수)를 조회해 AlertDialog로 보여준 뒤 확인받고, 활성화(켜기)는 확인 없이
 * 즉시 반영한다.
 */
export function ItemBookActiveToggleButton({ itemBookId, isActive, className }: ItemBookActiveToggleButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [impactLoading, setImpactLoading] = useState(false)
  const [impact, setImpact] = useState<{ badgeCount: number; holderUserCount: number } | null>(null)
  const [impactFailed, setImpactFailed] = useState(false)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(20260827_002 게이트 리뷰에서 alert-dialog.tsx 팔레트 전환 후 미연결 시 흰
  // 배경 위 흰 글씨로 안 보이는 회귀를 발견해 추가).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const toggle = async (nextActive: boolean) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/itembooks/${itemBookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextActive }),
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

  const openDeactivateConfirm = async () => {
    setImpact(null)
    setImpactFailed(false)
    setShowConfirm(true)
    setImpactLoading(true)
    try {
      const res = await fetch(`/api/admin/itembooks/${itemBookId}/deactivation-impact`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '영향 범위 조회 실패')
      setImpact({ badgeCount: data.badgeCount, holderUserCount: data.holderUserCount })
    } catch {
      setImpactFailed(true)
    } finally {
      setImpactLoading(false)
    }
  }

  const handleClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isActive) {
      openDeactivateConfirm()
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
            <AlertDialogTitle>컬렉션 비활성화</AlertDialogTitle>
            <AlertDialogDescription>
              {impactLoading && '영향 범위를 확인하는 중이에요...'}
              {!impactLoading && impactFailed && '영향 범위를 확인할 수 없습니다 — 신중히 진행하세요.'}
              {!impactLoading && !impactFailed && impact &&
                `이 컬렉션을 비활성화하면 소속 아이템배지 ${impact.badgeCount}개가 함께 비활성화되고, 이미 획득한 유저 ${impact.holderUserCount}명에게서 회수됩니다. 계속하시겠습니까?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setShowConfirm(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={loading || impactLoading}
              onClick={() => toggle(false)}
            >
              계속
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
