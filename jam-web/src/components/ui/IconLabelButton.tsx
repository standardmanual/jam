import type { ReactNode } from 'react'

/**
 * 동그라미 아이콘 + 아래 글자 세로 버튼 (티켓 20261126_1540, 배지 공유 시트 footer에서 옮겨 온 정본).
 * 아이콘은 56px 서클 안, 글자는 서클 아래에 놓는 세로 배치다. 터치 영역은 서클과 글자를 함께 감싼 칸 전체다.
 * 서클은 `aria-hidden`이라 글자가 곧 접근 가능한 이름이다. 가장 흔한 행동 하나만 `primary`(검은 서클)로 두고 나머지는 회색 서클이다.
 * 누름 중복 차단은 호출부가 한다(`busy`는 `aria-busy`만 단다). 가로 줄의 한 칸으로 놓이도록 `flex-1 min-w-0`을 가진다.
 *
 * @summary 동그라미 아이콘 아래에 글자를 둔 세로 버튼이다. 배지 공유 시트의 복사하기·저장하기·더보기에서 쓴다.
 */
export const ICON_LABEL_CIRCLE_CLASS = 'flex h-14 w-14 items-center justify-center rounded-full'
const ITEM_CLASS =
  'flex flex-1 min-w-0 flex-col items-center gap-2 text-sm text-foreground whitespace-nowrap break-keep wrap-break-word active:scale-95 transition-transform duration-100 motion-reduce:transition-none'

export interface IconLabelButtonProps {
  label: string
  /** 서클 안에 놓을 아이콘 */
  icon: ReactNode
  /** `primary`는 검은 서클, `default`는 회색 서클 */
  tone?: 'primary' | 'default'
  /** true면 `aria-busy`를 단다. 중복 탭 차단은 호출부 책임 */
  busy?: boolean
  onClick: () => void
}

export default function IconLabelButton({ label, icon, tone = 'default', busy, onClick }: IconLabelButtonProps) {
  return (
    <button type="button" className={ITEM_CLASS} aria-busy={busy || undefined} onClick={onClick}>
      <span
        aria-hidden="true"
        className={`${ICON_LABEL_CIRCLE_CLASS} ${tone === 'primary' ? 'bg-background-inverse text-snow' : 'bg-border text-foreground'}`}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}
