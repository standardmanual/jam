'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BadgeMetricLabelRow } from '@/types/database'

interface EditState {
  labelKo: string
  unitKo: string
}

function toEditState(row: BadgeMetricLabelRow): EditState {
  return { labelKo: row.label_ko, unitKo: row.unit_ko ?? '' }
}

export default function BadgeMetricLabelsManager({ initial }: { initial: BadgeMetricLabelRow[] }) {
  const router = useRouter()

  // 생성 폼 상태
  const [metricKey, setMetricKey] = useState('')
  const [labelKo, setLabelKo] = useState('')
  const [unitKo, setUnitKo] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const res = await fetch('/api/admin/badge-metric-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric_key: metricKey, label_ko: labelKo, unit_ko: unitKo || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '생성 실패')
      setMetricKey('')
      setLabelKo('')
      setUnitKo('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성 중 오류가 발생했습니다.')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (row: BadgeMetricLabelRow) => {
    setEditingKey(row.metric_key)
    setEditState(toEditState(row))
    setRowError((prev) => ({ ...prev, [row.metric_key]: '' }))
  }

  const handleSaveEdit = async (targetKey: string) => {
    if (!editState) return
    setRowError((prev) => ({ ...prev, [targetKey]: '' }))
    try {
      const res = await fetch(`/api/admin/badge-metric-labels/${targetKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label_ko: editState.labelKo, unit_ko: editState.unitKo || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '수정 실패')
      setEditingKey(null)
      setEditState(null)
      router.refresh()
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [targetKey]: err instanceof Error ? err.message : '수정 중 오류가 발생했습니다.',
      }))
    }
  }

  const handleDelete = async (targetKey: string) => {
    setRowError((prev) => ({ ...prev, [targetKey]: '' }))
    try {
      const res = await fetch(`/api/admin/badge-metric-labels/${targetKey}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      setDeletingKey(null)
      router.refresh()
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [targetKey]: err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.',
      }))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleCreate} className="flex flex-col gap-3 bg-white border border-border rounded-2xl p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-foreground">metric_key *</span>
            <input
              required
              value={metricKey}
              onChange={(e) => setMetricKey(e.target.value)}
              placeholder="distance_km"
              className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-foreground">라벨 *</span>
            <input
              required
              value={labelKo}
              onChange={(e) => setLabelKo(e.target.value)}
              placeholder="누적 거리"
              className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-foreground">단위</span>
            <input
              value={unitKo}
              onChange={(e) => setUnitKo(e.target.value)}
              placeholder="km (없으면 비워둠)"
              className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="bg-primary text-white font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {creating ? '추가 중...' : '지표 추가'}
          </button>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      <div className="bg-white border border-border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="px-5 py-3 font-medium">metric_key</th>
              <th className="px-5 py-3 font-medium">라벨</th>
              <th className="px-5 py-3 font-medium">단위</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {initial.map((row) => {
              const isEditing = editingKey === row.metric_key
              return (
                <tr key={row.metric_key} className="border-b border-border hover:bg-muted transition-colors align-top">
                  <td className="px-5 py-3 font-mono text-foreground whitespace-nowrap">{row.metric_key}</td>
                  <td className="px-5 py-3 min-w-[140px]">
                    {isEditing && editState ? (
                      <input
                        value={editState.labelKo}
                        onChange={(e) => setEditState({ ...editState, labelKo: e.target.value })}
                        className="bg-white border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:border-primary/50 text-sm w-full"
                      />
                    ) : (
                      row.label_ko
                    )}
                  </td>
                  <td className="px-5 py-3 min-w-[120px]">
                    {isEditing && editState ? (
                      <input
                        value={editState.unitKo}
                        onChange={(e) => setEditState({ ...editState, unitKo: e.target.value })}
                        placeholder="없으면 비워둠"
                        className="bg-white border border-border rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 text-sm w-full"
                      />
                    ) : row.unit_ko ? (
                      row.unit_ko
                    ) : (
                      <span className="text-muted-foreground text-xs">단위 없음</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleSaveEdit(row.metric_key)}
                          className="text-foreground hover:text-foreground/80 px-2 py-1"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => { setEditingKey(null); setEditState(null) }}
                          className="text-muted-foreground hover:text-foreground px-2 py-1"
                        >
                          취소
                        </button>
                      </div>
                    ) : deletingKey === row.metric_key ? (
                      <div className="flex gap-2 justify-end items-center">
                        <span className="text-muted-foreground text-xs">정말 삭제할까요?</span>
                        <button
                          onClick={() => handleDelete(row.metric_key)}
                          className="text-red-600 hover:text-red-700 px-2 py-1"
                        >
                          삭제 확인
                        </button>
                        <button
                          onClick={() => setDeletingKey(null)}
                          className="text-muted-foreground hover:text-foreground px-2 py-1"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => startEdit(row)}
                          className="text-foreground hover:text-foreground px-2 py-1"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => setDeletingKey(row.metric_key)}
                          className="text-red-500 hover:text-red-600 px-2 py-1"
                        >
                          삭제
                        </button>
                      </div>
                    )}
                    {rowError[row.metric_key] && (
                      <p className="text-red-600 text-xs mt-1">{rowError[row.metric_key]}</p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
