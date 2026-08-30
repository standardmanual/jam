'use client'

import { useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'

interface PoiActiveToggleButtonProps {
  poiId: string
  isActive: boolean
  className?: string
}

/**
 * POI 목록/상세 화면에서 즉시 활성/비활성을 토글하는 버튼(20260830_1619).
 * item_books.ItemBookActiveToggleButton.tsx와 달리 POI는 연쇄 영향(드랍/체크인 로직 미연동,
 * 후속 티켓 20260830_1620 참고)이 없으므로 확인 다이얼로그 없이 클릭 즉시
 * PATCH /api/admin/poi/[id]를 호출해 반영한다.
 */
export function PoiActiveToggleButton({ poiId, isActive, className }: PoiActiveToggleButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleClick = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/poi/${poiId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? '상태 변경에 실패했습니다. 다시 시도해주세요.')
        return
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
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
  )
}
