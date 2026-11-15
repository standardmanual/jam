'use client'

/** 등록 확인 대화상자 두 개 (표시 전용, 티켓 20261116_0748). */
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
import { slotLabelOf } from '@/lib/admin/badge-families'
import type { StudioSearchBadge } from './BadgePicker'

const WRAP = 'break-keep wrap-break-word'

export function SingleRegisterDialog({
  badge,
  onOpenChange,
  onConfirm,
}: {
  badge: StudioSearchBadge | null
  onOpenChange: (open: boolean) => void
  onConfirm: (badge: StudioSearchBadge) => void
}) {
  return (
    <AlertDialog open={badge !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className={WRAP}>
            {badge?.name} 배지 이미지를 {badge?.hasImage ? '바꿀까요?' : '등록할까요?'}
          </AlertDialogTitle>
          <AlertDialogDescription className={WRAP}>
            등록하면 서비스에 보이는 이 배지의 이미지가 바로 바뀌어요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction onClick={() => badge && onConfirm(badge)}>등록</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function BatchRegisterDialog({
  badges,
  onOpenChange,
  onConfirm,
}: {
  badges: StudioSearchBadge[] | null
  onOpenChange: (open: boolean) => void
  onConfirm: (badges: StudioSearchBadge[]) => void
}) {
  const list = badges ?? []
  return (
    <AlertDialog open={badges !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className={WRAP}>같은 계열 배지 {list.length}개에 이미지를 등록할까요?</AlertDialogTitle>
          <AlertDialogDescription className={WRAP}>
            지금 조정값 그대로 단계마다 이름과 값만 바꿔서 등록해요. 서비스에 보이는 이미지가 바로 바뀌어요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className={`max-h-60 space-y-1 overflow-y-auto text-sm ${WRAP}`}>
          {list.map((b) => (
            <li key={b.id}>
              {b.name} · {slotLabelOf(b)} · {b.templateValue ?? '-'}
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(list)}>{list.length}개 등록</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
