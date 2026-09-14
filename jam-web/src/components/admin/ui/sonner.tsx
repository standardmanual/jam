'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * 어드민 전용 shadcn `sonner` Toaster. 어드민은 다크모드를 쓰지 않고 항상 라이트로
 * 고정돼 있으므로(`AdminBodyThemeFix`) `theme`도 라이트로 고정한다.
 * (티켓 20260907_1219 — 어드민 일괄 작업 결과 알림 네이티브 alert() → shadcn 표준 전환)
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'font-[inherit]',
        },
      }}
      {...props}
    />
  )
}
