'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

const BUTTON_CLASS =
  'flex items-center justify-center w-9 h-9 rounded-xl text-jam-ink active:scale-95 transition-transform'

const ARROW = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)

interface BackButtonProps {
  /** 지정되면 이 경로로 이동(다른 유저의 배지를 보고 있는 경우, 그 유저의 프로필로). 없으면 브라우저 히스토리로 뒤로가기 */
  href?: string
}

/** 배지 상세 화면 상단의 뒤로가기 */
export default function BackButton({ href }: BackButtonProps) {
  const router = useRouter()

  if (href) {
    return (
      <Link href={href} aria-label="이전 페이지로" className={BUTTON_CLASS}>
        {ARROW}
      </Link>
    )
  }

  return (
    <button onClick={() => router.back()} aria-label="이전 페이지로" className={BUTTON_CLASS}>
      {ARROW}
    </button>
  )
}
