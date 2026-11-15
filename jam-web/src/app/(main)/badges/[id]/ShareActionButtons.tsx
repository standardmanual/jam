import type { ReactNode } from 'react'
import { CopyIcon, DownloadIcon, MoreIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

/**
 * 아이콘은 56px 서클 안, 이름표는 서클 아래에 놓는 세로 배치(사용자 지시 2026-11-15, 티켓 20261115_1405).
 * 이전의 알약 버튼은 폭 320~360px에서 한 칸이 88~99px라 아이콘과 이름표를 한 줄에 두기 어려웠다. 서클 방식은 칸 폭과
 * 무관하게 56px 서클이 가운데에 놓이고 이름표는 서클 아래 한 줄이다. 터치 영역은 서클과 이름표를 함께 감싼 칸 전체다.
 */
export const SHARE_ACTION_CIRCLE_CLASS = 'flex h-14 w-14 items-center justify-center rounded-full'
const SHARE_ACTION_ITEM_CLASS =
  'flex flex-1 min-w-0 flex-col items-center gap-2 text-sm text-foreground whitespace-nowrap break-keep active:scale-95 transition-transform duration-100'

interface ShareActionButtonsProps {
  /** 복사하는 동안 true — `aria-busy`를 달고, 중복 탭은 호출부가 무시한다 */
  copying: boolean
  /** 이미지가 준비된 시점에 `canShare({ files })`가 참이었는지. 거짓이면 «더보기»를 그리지 않는다(비활성으로 남기지 않는다) */
  canNativeShare: boolean
  onCopy: () => void
  onSave: () => void
  onMore: () => void
}

function ActionItem({
  label,
  primary = false,
  busy,
  onClick,
  children,
}: {
  label: string
  /** 가장 흔한 행동 하나만 검은 서클(복사하기), 나머지는 회색 서클 */
  primary?: boolean
  busy?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={SHARE_ACTION_ITEM_CLASS} aria-busy={busy || undefined} onClick={onClick}>
      <span
        aria-hidden="true"
        className={`${SHARE_ACTION_CIRCLE_CLASS} ${primary ? 'bg-background-inverse text-snow' : 'bg-border text-foreground'}`}
      >
        {children}
      </span>
      <span>{label}</span>
    </button>
  )
}

/**
 * 공유 시트 footer의 버튼 줄. 복사하기만 검은 서클(가장 흔한 행동), 저장하기·더보기는 회색 서클이다.
 * 서클은 `aria-hidden`이라 이름표 글자가 곧 접근 가능한 이름이다.
 */
export function ShareActionButtons({ copying, canNativeShare, onCopy, onSave, onMore }: ShareActionButtonsProps) {
  return (
    <div className="flex gap-2">
      <ActionItem label={d.badges.shareActionCopy} primary busy={copying} onClick={onCopy}>
        <CopyIcon />
      </ActionItem>
      <ActionItem label={d.badges.shareActionDownload} onClick={onSave}>
        <DownloadIcon />
      </ActionItem>
      {canNativeShare && (
        <ActionItem label={d.badges.shareActionMore} onClick={onMore}>
          <MoreIcon />
        </ActionItem>
      )}
    </div>
  )
}
