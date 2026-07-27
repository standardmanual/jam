'use client'

import { useState } from 'react'
import UserGrantForm from './UserGrantForm'

interface SearchUser {
  id: string
  username: string | null
  email: string
  balance: number
}

/** 대시보드 전용: 유저를 검색해 선택하면 공용 지급/회수 폼(UserGrantForm)을 띄운다. */
export default function AdminUserSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchUser | null>(null)

  const search = async () => {
    if (q.trim().length === 0) return
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/points?q=${encodeURIComponent(q.trim())}`)
      const data = await res.json()
      setResults(data.users ?? [])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search() }}
          placeholder="유저 검색 (닉네임 또는 이메일)"
          className="flex-1 bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 text-sm"
        />
        <button
          onClick={search}
          disabled={searching}
          className="bg-[#f3f4f6] text-[#111111] font-bold px-5 py-2.5 rounded-xl hover:bg-[#e5e7eb] disabled:opacity-50 transition-colors text-sm"
        >
          {searching ? '검색 중…' : '검색'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="bg-white border border-[#e5e7eb] rounded-2xl divide-y divide-[#f3f4f6]">
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => { setSelected(u); setResults([]); setQ('') }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#f8f9fa] transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{u.username ?? '(닉네임 없음)'}</p>
                <p className="text-xs text-[#6b7280] truncate">{u.email}</p>
              </div>
              <span className="text-sm font-bold text-[#111111] shrink-0 ml-3">{u.balance.toLocaleString('ko-KR')}P</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#374151]">
              선택됨: <span className="font-bold text-[#111111]">{selected.username ?? selected.email}</span>
            </p>
            <button onClick={() => setSelected(null)} className="text-xs text-[#6b7280] hover:text-[#111111] transition-colors">
              선택 해제
            </button>
          </div>
          <UserGrantForm key={selected.id} userId={selected.id} username={selected.username} />
        </div>
      )}
    </div>
  )
}
