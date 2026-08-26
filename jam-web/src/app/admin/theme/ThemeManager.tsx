'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ThemePresetRow } from '@/types/database'

interface Props {
  initialPresets: ThemePresetRow[]
}

// 모바일 목업 미니어처 — 어드민이 저장/활성화 전에 실제 화면 톤을 가늠할 수 있게 함
function PreviewFrame({ mainColor, subColor }: { mainColor: string; subColor: string }) {
  return (
    <div
      className="w-40 h-80 rounded-[2rem] shrink-0 overflow-hidden border-4 border-border flex flex-col p-3 gap-2"
      style={{ backgroundColor: mainColor }}
    >
      <div className="h-3 w-16 rounded-full" style={{ backgroundColor: subColor, opacity: 0.4 }} />
      <div className="h-6 w-24 rounded-full" style={{ backgroundColor: subColor }} />
      <div className="flex-1 rounded-2xl mt-2" style={{ border: `1px solid ${subColor}` }} />
      <div className="h-10 rounded-full" style={{ backgroundColor: subColor }} />
    </div>
  )
}

export default function ThemeManager({ initialPresets }: Props) {
  const router = useRouter()
  const [presets, setPresets] = useState(initialPresets)
  const [name, setName] = useState('')
  const [mainColor, setMainColor] = useState('#0033e5')
  const [subColor, setSubColor] = useState('#f0f7ff')
  const [creating, setCreating] = useState(false)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const res = await fetch('/api/admin/theme-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, main_color: mainColor, sub_color: subColor }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '생성에 실패했습니다.')
        return
      }
      setPresets((prev) => [data.preset as ThemePresetRow, ...prev])
      setName('')
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setCreating(false)
    }
  }

  async function handleActivate(id: string) {
    setError(null)
    setActivatingId(id)
    try {
      const res = await fetch(`/api/admin/theme-presets/${id}/activate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '활성화에 실패했습니다.')
        return
      }
      setPresets((prev) => prev.map((p) => ({ ...p, is_active: p.id === id })))
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setActivatingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* 새 프리셋 생성 */}
      <form
        onSubmit={handleCreate}
        className="bg-white border border-border rounded-2xl p-6 flex gap-8 items-start"
      >
        <PreviewFrame mainColor={mainColor} subColor={subColor} />

        <div className="flex-1 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">프리셋 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 여름 한정 (틸/민트)"
              required
              className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10"
            />
          </div>

          <div className="flex gap-6">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">메인(코발트)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={mainColor}
                  onChange={(e) => setMainColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                />
                <span className="text-sm font-mono text-muted-foreground">{mainColor}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">서브(아이스)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={subColor}
                  onChange={(e) => setSubColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                />
                <span className="text-sm font-mono text-muted-foreground">{subColor}</span>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={creating}
            className="self-start bg-primary text-white font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-colors text-sm disabled:opacity-50"
          >
            {creating ? '생성 중...' : '프리셋 생성'}
          </button>
        </div>
      </form>

      {/* 프리셋 목록 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {presets.map((p) => (
          <div key={p.id} className="bg-white border border-border rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: p.main_color }} />
              <span className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: p.sub_color }} />
              <span className="font-semibold text-sm ml-1">{p.name}</span>
            </div>
            <p className="text-xs font-mono text-muted-foreground">{p.main_color} / {p.sub_color}</p>
            {p.is_active ? (
              <span className="self-start text-xs font-bold text-white bg-primary px-3 py-1 rounded-full">활성</span>
            ) : (
              <button
                onClick={() => handleActivate(p.id)}
                disabled={activatingId === p.id}
                className="self-start text-xs font-bold px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors disabled:opacity-50"
              >
                {activatingId === p.id ? '활성화 중...' : '활성화'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
