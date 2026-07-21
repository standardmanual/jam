'use client'

import { useRouter } from 'next/navigation'

/** 배지 상세 화면 상단의 뒤로가기 — 진입 경로(피드/배지 목록/아이템북)와 무관하게 이전 페이지로 이동 */
export default function BackButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      aria-label="이전 페이지로"
      className="flex items-center justify-center w-9 h-9 rounded-xl text-jam-ink active:scale-95 transition-transform"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}
