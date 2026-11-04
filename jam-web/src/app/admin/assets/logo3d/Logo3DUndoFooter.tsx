import { Button } from '@/components/admin/ui/button'

type Props = {
  canUndo: boolean
  onUndo: () => void
}

/** 3D 뷰포트 하단. Shape 뷰포트 footer와 같은 모양이며, 3D는 랜덤 생성을 지원하지 않아 되돌리기만 안내한다. */
export function Logo3DUndoFooter({ canUndo, onUndo }: Props) {
  return (
    <footer className="flex items-center justify-between gap-3 px-6 py-[18px] text-[11px] text-[#7f8582]">
      <span className="hidden sm:inline break-keep wrap-break-word">
        <kbd className="mr-1 rounded border border-[#cdd4c9] bg-[#fafcf7] px-1.5 py-0.5 text-[10px]">⌘/Ctrl Z</kbd>
        되돌리기
      </span>
      <div className="flex gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canUndo}
          onClick={onUndo}
          className="h-7 px-2.5 text-[11px] whitespace-nowrap"
        >
          되돌리기
        </Button>
      </div>
    </footer>
  )
}
