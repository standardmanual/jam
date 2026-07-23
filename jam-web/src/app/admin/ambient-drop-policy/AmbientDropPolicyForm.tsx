'use client'

import { useState } from 'react'
import type { AmbientDropPolicy } from '@/lib/ambient-drop/policy'

interface FieldDef {
  key: keyof AmbientDropPolicy
  label: string
  hint?: string
  step?: string
}

interface SectionDef {
  title: string
  description: string
  fields: FieldDef[]
}

const SECTIONS: SectionDef[] = [
  {
    title: '레어리티 분포',
    description: 'common + rare + legendary 합은 반드시 1이어야 합니다. mythic은 앰비언트 드랍 대상에서 제외됩니다 (신화 등급은 액티비티 성취·떠돌이 아이템 전용).',
    fields: [
      { key: 'rarity_common', label: 'Common 확률', step: '0.01' },
      { key: 'rarity_rare', label: 'Rare 확률', step: '0.01' },
      { key: 'rarity_legendary', label: 'Legendary 확률', step: '0.01' },
    ],
  },
  {
    title: '목표 수량',
    description: 'target = clamp(활성 POI 수 × 커버리지 비율, min, max). POI가 늘어나도 자동으로 스케일됩니다.',
    fields: [
      { key: 'target_coverage_ratio', label: '커버리지 비율 (POI 대비)', step: '0.01' },
      { key: 'min_target_total', label: '최소 목표 수량', step: '1' },
      { key: 'max_target_total', label: '최대 목표 수량', step: '1' },
    ],
  },
  {
    title: '배치 방식',
    description: 'POI 1곳 독점 방지 + 크론 1회당 보충 상한.',
    fields: [
      { key: 'max_active_per_poi', label: 'POI당 최대 활성 드랍 수', step: '1' },
      { key: 'replenish_batch_size', label: '크론 1회 최대 보충 개수', step: '1' },
    ],
  },
]

export default function AmbientDropPolicyForm({ initial }: { initial: AmbientDropPolicy }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const section of SECTIONS) {
      for (const f of section.fields) v[f.key] = String(initial[f.key])
    }
    return v
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const raritySum =
    parseFloat(values.rarity_common || '0') +
    parseFloat(values.rarity_rare || '0') +
    parseFloat(values.rarity_legendary || '0')

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const patch: Record<string, number> = {}
      for (const [k, v] of Object.entries(values)) patch[k] = parseFloat(v)
      const res = await fetch('/api/admin/ambient-drop-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error ?? '저장 실패' })
      } else {
        setMessage({ type: 'ok', text: '저장되었습니다. 다음 보충 크론부터 즉시 적용됩니다.' })
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
        <section key={section.title} className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="font-bold mb-1">{section.title}</h2>
          <p className="text-white/40 text-xs mb-4">{section.description}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="text-white/60 text-xs">{f.label}</span>
                <input
                  type="number"
                  step={f.step ?? '0.01'}
                  min="0"
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#AEEA00]/50"
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
          className="bg-[#AEEA00] text-black font-bold px-6 py-2.5 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        <span className={Math.abs(raritySum - 1) > 0.001 ? 'text-red-400 text-xs' : 'text-white/30 text-xs'}>
          rarity 합: {raritySum.toFixed(3)} {Math.abs(raritySum - 1) > 0.001 && '(1이어야 함)'}
        </span>
      </div>
      {message && (
        <p className={`text-sm ${message.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
