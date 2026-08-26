'use client'

import { useState } from 'react'
import type { CombinePolicy } from '@/lib/combine/policy'

interface FieldDef {
  key: keyof CombinePolicy
  label: string
  step?: string
}

interface SectionDef {
  title: string
  description: string
  fields: FieldDef[]
}

const SECTIONS: SectionDef[] = [
  {
    title: '티어 1 — 기본 (다양성 요건 미충족 시 강등되는 바닥)',
    description: '재료 개수 상한 + 최소 서로 다른 세계관 수. b) 결과 배지 개수(n)와 성공 확률을 결정합니다.',
    fields: [
      { key: 'tier1_max_items', label: '재료 개수 상한', step: '1' },
      { key: 'tier1_min_factions', label: '최소 세계관 다양성', step: '1' },
      { key: 'tier1_b_rate', label: 'b) 성공 확률', step: '0.01' },
      { key: 'tier1_b_count', label: 'b) 지급 배지 개수(n)', step: '1' },
    ],
  },
  {
    title: '티어 2 — 중급',
    description: '티어1 요건을 넘어 재료·다양성이 더 많을 때 적용.',
    fields: [
      { key: 'tier2_max_items', label: '재료 개수 상한', step: '1' },
      { key: 'tier2_min_factions', label: '최소 세계관 다양성', step: '1' },
      { key: 'tier2_b_rate', label: 'b) 성공 확률', step: '0.01' },
      { key: 'tier2_b_count', label: 'b) 지급 배지 개수(n)', step: '1' },
    ],
  },
  {
    title: '티어 3 — 최상급',
    description: '최대 재료 개수(10개)까지 허용하는 최상위 티어.',
    fields: [
      { key: 'tier3_max_items', label: '재료 개수 상한', step: '1' },
      { key: 'tier3_min_factions', label: '최소 세계관 다양성', step: '1' },
      { key: 'tier3_b_rate', label: 'b) 성공 확률', step: '0.01' },
      { key: 'tier3_b_count', label: 'b) 지급 배지 개수(n)', step: '1' },
    ],
  },
  {
    title: '피티 — 성공 확률 보정',
    description: '연속 실패 1회차부터 즉시 소폭 상승. 정석 레시피 경로에는 적용되지 않음.',
    fields: [
      { key: 'pity_prob_increment', label: '실패 1회당 확률 증가폭', step: '0.001' },
      { key: 'pity_prob_cap', label: '확률 보정 상한 (절대값)', step: '0.01' },
    ],
  },
  {
    title: '피티 — 포인트 보상 (지연 지급, 보수적)',
    description: '일정 연속 실패 이후부터만 지급 시작. 계단식으로 소폭 증가하며 별도 상한을 가짐.',
    fields: [
      { key: 'pity_points_start_streak', label: '지급 시작 연속실패 횟수', step: '1' },
      { key: 'pity_points_base', label: '시작 시점 지급액', step: '1' },
      { key: 'pity_points_step', label: '증가 단위(N회마다)', step: '1' },
      { key: 'pity_points_increment', label: '단위당 증가액', step: '1' },
      { key: 'pity_points_cap', label: '지급 상한', step: '1' },
    ],
  },
]

export default function CombinePolicyForm({ initial }: { initial: CombinePolicy }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const section of SECTIONS) {
      for (const f of section.fields) v[f.key] = String(initial[f.key])
    }
    return v
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const patch: Record<string, number> = {}
      for (const [k, v] of Object.entries(values)) patch[k] = parseFloat(v)
      const res = await fetch('/api/admin/combine-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error ?? '저장 실패' })
      } else {
        setMessage({ type: 'ok', text: '저장되었습니다. 다음 믹스부터 즉시 적용됩니다.' })
      }
    } catch {
      setMessage({ type: 'error', text: '네트워크 오류' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {SECTIONS.map((section) => (
        <section key={section.title} className="bg-white border border-border rounded-2xl p-6">
          <h2 className="font-bold mb-1">{section.title}</h2>
          <p className="text-muted-foreground text-xs mb-4">{section.description}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="text-foreground text-xs">{f.label}</span>
                <input
                  type="number"
                  step={f.step ?? '0.01'}
                  min="0"
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="mt-1 w-full bg-white border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                />
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 transition-colors text-sm disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
