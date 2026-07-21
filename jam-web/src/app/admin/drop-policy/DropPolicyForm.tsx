'use client'

import { useState } from 'react'
import type { DropPolicy } from '@/lib/drop-engine/policy'

interface FieldDef {
  key: keyof DropPolicy
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
    title: 'Layer 1 — 드랍 발생 (활동당 최소 1개 확정)',
    description: '희귀도 분포 4개의 합은 반드시 1이어야 합니다.',
    fields: [
      { key: 'rarity_common', label: 'Common 확률', step: '0.01' },
      { key: 'rarity_rare', label: 'Rare 확률', step: '0.01' },
      { key: 'rarity_legendary', label: 'Legendary 확률', step: '0.01' },
      { key: 'rarity_mythic', label: 'Mythic 확률', step: '0.01' },
      { key: 'bonus_drop_rate', label: '보너스 드랍률 (2개째)', step: '0.01' },
      { key: 'bonus_drop_rate_intense', label: '보너스 드랍률 (고강도)', step: '0.01' },
      { key: 'intense_duration_min', label: '고강도 기준 시간(분)', step: '1' },
      { key: 'intense_elevation_m', label: '고강도 기준 고도(m)', step: '10' },
      { key: 'rare_pity_threshold', label: 'Rare+ pity 임계 (연속 common 횟수)', step: '1' },
      { key: 'daily_downgrade_from', label: '일일 하향 시작 (N번째 활동)', step: '1' },
      { key: 'daily_downgrade_common', label: '일일 하향 시 common 확률', step: '0.01' },
      { key: 'comeback_gap_days', label: '복귀 판정 공백(일)', step: '1' },
      { key: 'weekly_first_rare_mult', label: '주간 첫 활동 rare+ 배수', step: '0.1' },
    ],
  },
  {
    title: 'Layer 2 — 세계관 선택 (서사 모멘텀)',
    description: '모멘텀+인접+탐험 합은 1 이하 (잔여분은 탐험이 흡수).',
    fields: [
      { key: 'momentum_weight', label: '모멘텀 (직전 세계관)', step: '0.01' },
      { key: 'adjacent_weight', label: '인접 세계관', step: '0.01' },
      { key: 'explore_weight', label: '탐험 (전체 랜덤)', step: '0.01' },
      { key: 'context_override_rate', label: '맥락 오버라이드 발동률', step: '0.01' },
      { key: 'mystery_spice_rate', label: '미스터리 헌터 등장률 (legendary+ 전용)', step: '0.01' },
    ],
  },
  {
    title: 'Layer 3 — 완성 페이싱',
    description: '아이템북 가중치 = drop_weight × (1 − 수집률 × 감쇠) × 페널티',
    fields: [
      { key: 'completion_decay', label: '완성도 감쇠 계수', step: '0.01' },
      { key: 'completed_book_weight', label: '완성 북 잔류 가중치', step: '0.01' },
      { key: 'same_book_penalty', label: '직전 북 페널티 배율', step: '0.01' },
      { key: 'last_piece_pity_threshold', label: '마지막 조각 pity (세계관 내 드랍 수)', step: '1' },
    ],
  },
]

export default function DropPolicyForm({ initial }: { initial: DropPolicy }) {
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
    parseFloat(values.rarity_legendary || '0') +
    parseFloat(values.rarity_mythic || '0')
  const bucketSum =
    parseFloat(values.momentum_weight || '0') +
    parseFloat(values.adjacent_weight || '0') +
    parseFloat(values.explore_weight || '0')

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const patch: Record<string, number> = {}
      for (const [k, v] of Object.entries(values)) patch[k] = parseFloat(v)
      const res = await fetch('/api/admin/drop-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error ?? '저장 실패' })
      } else {
        setMessage({ type: 'ok', text: '저장되었습니다. 다음 드랍부터 즉시 적용됩니다.' })
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
        <div className="text-xs space-x-4">
          <span className={Math.abs(raritySum - 1) > 0.001 ? 'text-red-400' : 'text-white/30'}>
            rarity 합: {raritySum.toFixed(3)} {Math.abs(raritySum - 1) > 0.001 && '(1이어야 함)'}
          </span>
          <span className={bucketSum > 1.001 ? 'text-red-400' : 'text-white/30'}>
            세계관 버킷 합: {bucketSum.toFixed(3)} {bucketSum > 1.001 && '(1 이하여야 함)'}
          </span>
        </div>
      </div>
      {message && (
        <p className={`text-sm ${message.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
