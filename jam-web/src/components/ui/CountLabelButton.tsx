import type { ReactNode } from 'react'

/**
 * «숫자 + 이름» 누르는 칸 (티켓 20261126_1540, 프로필 팔로워·팔로잉·포인트 칸에서 옮겨 온 정본).
 * 숫자를 위에 크게, 이름을 아래에 작게 쌓은 왼쪽 정렬 칸이다. 선택 표시는 이름 색 전환뿐이다(밑줄·면 없음).
 * `aria-pressed`로 선택 상태를 알린다. 숫자는 호출부가 넘긴다(팔로워 수의 pop-in 같은 연출을 호출부가 얹을 수 있게 ReactNode).
 * 칸 폭은 부모가 정한다(프로필은 `grid-cols-3`). 눌림 높이는 44px 이상이다.
 *
 * @summary 숫자 위·이름 아래로 쌓은 누르는 칸이다. 프로필의 팔로워·팔로잉·포인트 칸에서 쓴다.
 */
export interface CountLabelButtonProps {
  /** 칸 아래의 이름 */
  label: string
  /** 칸 위의 숫자 */
  value: ReactNode
  /** 선택된 칸이면 이름이 진한 글자색이 된다 */
  selected?: boolean
  onClick: () => void
}

export default function CountLabelButton({ label, value, selected = false, onClick }: CountLabelButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="flex flex-col items-start min-w-0 min-h-11 text-left whitespace-nowrap break-keep wrap-break-word active:scale-95 transition-transform duration-100 motion-reduce:transition-none cursor-pointer"
    >
      <strong className="text-xl leading-tight font-bold tabular-nums text-foreground">{value}</strong>
      <span className={`text-sm transition-colors duration-150 motion-reduce:transition-none ${selected ? 'text-foreground' : 'text-muted'}`}>
        {label}
      </span>
    </button>
  )
}
