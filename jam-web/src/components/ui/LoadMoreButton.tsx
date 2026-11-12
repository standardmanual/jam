import type { ReactNode } from 'react'
import Button from '@/components/ui/Button'

/**
 * 더보기 버튼 — 알림·포인트 내역·친구 피드가 함께 쓴다.
 *
 * MODULAR `design-system/components/buttons/LoadMoreButton.jsx`와 병존하는 쌍이다.
 * 자체 색·치수를 갖지 않고 `Button variant="outline" fullWidth`(폭 전체·52px·--btn-secondary 알약)에
 * 위 간격 16px(mt-4)만 얹는다. 호출부가 모양을 덮어쓰지 못하도록 className은 받지 않는다.
 * 더 불러올 것이 없으면 호출부가 렌더하지 않는다(cursor/hasMore 제어).
 * 오류 뒤 재시도도 같은 버튼이다 — children만 «다시 시도»로 바꿔 넘긴다.
 */
interface LoadMoreButtonProps {
  /** true면 스피너와 함께 비활성(중복 탭 차단) */
  loading?: boolean
  onClick: () => void
  children: ReactNode
}

export default function LoadMoreButton({ loading = false, onClick, children }: LoadMoreButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      surface="main"
      fullWidth
      loading={loading}
      onClick={onClick}
      className="mt-4 break-keep wrap-break-word"
    >
      {children}
    </Button>
  )
}
