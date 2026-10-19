import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * 인라인 안내 블록 (티켓 20261018_1817, 채원 사전 판정 2026-10-19) — 서비스 전용, MODULAR 승격은 하지 않는다.
 *
 * 화면 안에서 «지금은 안 되는 까닭»을 한두 문장으로 말하는 조용한 블록이다. 쓰는 곳은 픽업 시트의 가득 참·장소 차단 안내와
 * 잠긴 개체 드랍 확인의 «채운 잼은 사라져요» 안내(와 그 조회 실패 안내)다. 홈 `SuspensionBanner`·인벤토리 가득 참 안내와 같은 문법이라
 * 3곳째가 되면 MODULAR 승격 후보다.
 *
 * 면은 `--background-secondary`, 모서리 `rounded-2xl`, 글자는 `--foreground`다. 오류색·경고 아이콘을 쓰지 않는다 — 사용자가 잘못한 일이 아니라서
 * 심각도는 문구가 전한다. 고정 위치나 애니메이션은 없고 부모 흐름 안에 놓인다. 보조 동작이 필요하면 `action`에 버튼 하나를 넘긴다.
 * 상태가 바뀌었음을 스크린리더가 읽도록 `role="status"`(polite)를 쓴다.
 */
export default function InlineNotice({
  children,
  action,
  className,
}: {
  children: ReactNode
  /** 문구 아래에 놓는 보조 동작(예: [다시 확인]) */
  action?: ReactNode
  className?: string
}) {
  return (
    <div role="status" className={cn('flex flex-col gap-2 rounded-2xl bg-background-secondary px-4 py-3 text-left', className)}>
      <p className="m-0 text-base text-foreground break-keep wrap-break-word text-pretty">{children}</p>
      {action}
    </div>
  )
}
