'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface UserSearchBarProps {
  /** 검색 결과 페이지 등에서 초기 검색어를 채워둘 때 사용 */
  defaultValue?: string
}

export default function UserSearchBar({ defaultValue = '' }: UserSearchBarProps) {
  const router = useRouter()
  const [q, setQ] = useState(defaultValue)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = q.trim()
    if (!trimmed) return // 빈 검색어·공백만이면 제출 무시
    router.push(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-3 flex items-center gap-2"
    >
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="아이디 또는 이메일로 유저 검색"
        aria-label="유저 검색"
        className="flex-1 min-w-0 bg-transparent px-2 py-1.5 text-sm font-semibold text-jam-ink placeholder:text-jam-ink/40 focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 bg-[#AEEA00] text-jam-ink font-black text-sm px-4 py-2 rounded-xl border-[3px] border-jam-ink"
      >
        검색
      </button>
    </form>
  )
}
