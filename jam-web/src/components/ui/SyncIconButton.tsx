'use client'

import { SyncIcon } from '@/components/ui/icons'

/**
 * TopNav 동기화 서클 (티켓 20261114_1349)
 *
 * 홈(/)을 뺀 화면의 TopNav는 «동기화» 글자 알약 대신 알림 종(NotificationBell)과 같은 규격의
 * 아이콘 서클을 쓴다 — 44×44 터치 영역 안에 36px 서클(`bg-border text-foreground`), 16px 아이콘.
 *
 * - `-mr-1`: 종·아바타와 시각 간격을 12px로 맞춘다(NotificationBell과 같은 이유).
 * - 로딩: 아이콘만 돌린다(서클 전체가 흔들리지 않게). 모션 줄이기에서는 회전 대신 서클을 흐리게 한다.
 *   `aria-busy`는 모든 환경에서 켠다.
 * - 새 색·그림자·테두리 없음. 빨강 점은 종 전용이라 여기에는 쓰지 않는다.
 */
export default function SyncIconButton({
  label,
  loading = false,
  disabled = false,
  onClick,
}: {
  /** aria-label. 눈에 보이는 글자가 없어 스크린리더가 읽는 이름이다 */
  label: string
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={loading}
      disabled={disabled}
      onClick={onClick}
      className="w-11 h-11 -mr-1 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform duration-100"
    >
      <span
        className={`w-9 h-9 rounded-full bg-border text-foreground flex items-center justify-center${
          loading ? ' motion-reduce:opacity-60' : ''
        }`}
      >
        <SyncIcon className={`w-4 h-4${loading ? ' animate-spin motion-reduce:animate-none' : ''}`} />
      </span>
    </button>
  )
}
