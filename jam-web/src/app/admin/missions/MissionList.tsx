'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MissionRow } from '@/types/database'
import { MissionTable } from './MissionTable'

interface Props {
  missions: MissionRow[]
  completionCounts: Map<string, number>
}

/**
 * 미션 목록(티켓 20260911_2035) — 상세/수정은 `/admin/missions/[id]` 페이지 이동으로 연다
 * (예전에는 이 컴포넌트 안에서 폼을 토글했다 — 저작 폼 자체는 `MissionForm.tsx`로 옮겼다).
 */
export default function MissionList({ missions, completionCounts }: Props) {
  const router = useRouter()

  const startEdit = useCallback(
    (m: MissionRow) => {
      router.push(`/admin/missions/${m.id}`)
    },
    [router]
  )

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('미션을 삭제하시겠습니까?')) return
    const res = await fetch(`/api/admin/missions/${id}`, { method: 'DELETE' })
    // 참여·완료 이력이 있으면 서버가 409로 차단한다(20260907_1134 참조 가드) — 응답을
    // 확인하지 않으면 실패해도 목록이 그냥 새로고침돼 "삭제된 것처럼" 보인다.
    if (!res.ok) {
      const payload = await res.json().catch(() => null)
      alert(typeof payload?.error === 'string' ? payload.error : '미션을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.')
      return
    }
    router.refresh()
  }, [router])

  return (
    <div className="space-y-6">
      <Link
        href="/admin/missions/new"
        className="inline-block bg-primary text-white font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm"
      >
        + 미션 생성
      </Link>

      {/* 미션 목록 */}
      <MissionTable missions={missions} completionCounts={completionCounts} onEdit={startEdit} onDelete={handleDelete} />
    </div>
  )
}
