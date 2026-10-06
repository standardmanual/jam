'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { IconX } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { Card } from '@/components/admin/ui/card'

/**
 * 오른쪽 서랍의 빈 틀(티켓 20260930_1817, 채원 화면 설계 「S3 기획 상세」).
 *
 * PRD §4 「서랍이 열려도 원래 화면이 그대로 보인다」를 지키려고 `ui/sheet.tsx`(`bg-black/80` 딤)를 쓰지 않고
 * 그리드 안의 인라인 `aside`로 그린다. 딤도 포커스 가둠도 없다. Esc와 「서랍 닫기」 버튼으로 닫힌다.
 * 열림은 URL `?drawer=…`이다(S3는 `empty`, 일정표 S4는 `item`·`day`, 티켓 20261006_1537 ③-b). 여는 버튼과 안쪽 내용은 쓰는 쪽이 채운다.
 *
 * 제목(`title`)은 기본 「서랍」이다. 제목 글자는 `tabIndex={-1}`이라 틀이 처음 그려질 때 포커스가 거기로 온다(채원 판정 「열면 서랍 제목으로 포커스」).
 * 닫을 때 누른 칸으로 되돌리는 일은 쓰는 쪽이 한다.
 *
 * 열 배치(S3는 3열로 밀어내기, S4는 달력 옆 2열, 좁으면 아래로 쌓임)는 부모의 그리드가 정한다.
 */

interface OpsDrawerFrameProps {
  onClose: () => void
  /** 서랍 머리 글자. 없으면 「서랍」이다. */
  title?: string
  children?: ReactNode
  className?: string
}

const DEFAULT_TITLE = '서랍'

/** 서랍이 열려 있는 동안 Esc로 닫는다. 다른 창(확인창·목록 상자)이 열려 있으면 그 창이 Esc를 쓰도록 비켜선다. */
function useCloseOnEscape(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]')) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])
}

export function OpsDrawerFrame({ onClose, title = DEFAULT_TITLE, children, className }: OpsDrawerFrameProps) {
  useCloseOnEscape(onClose)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  return (
    <aside aria-label={title} className={className}>
      <Card className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 ref={titleRef} tabIndex={-1} className="min-w-0 break-words text-sm font-semibold focus:outline-none">
            {title}
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="서랍 닫기">
            <IconX aria-hidden="true" />
            닫기
          </Button>
        </div>
        <div className="p-4">
          {children ?? <p className="text-sm text-muted-foreground">서랍은 곧 열려요</p>}
        </div>
      </Card>
    </aside>
  )
}
