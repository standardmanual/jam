'use client'

import { useState } from 'react'
import type { AmbientDropConfig } from '@/lib/ambient-drop/config'
import type { AmbientDropAxisMode } from '@/types/database'
import type { AmbientDropBatchResult } from '@/lib/ambient-drop'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'

export interface AmbientDropHistoryEntry {
  id: string
  created_at: string
  payload: Record<string, unknown>
}

interface AmbientDropFormProps {
  initial: AmbientDropConfig
  categories: { slug: string; label: string }[]
  books: { id: string; name: string }[]
  history: AmbientDropHistoryEntry[]
  initialBlocked: boolean
  scheduleLabel: string
}

const ALL_CATEGORY_VALUE = '__ALL__'

/** 명시(explicit)/무작위(random) 2단 토글 — 어드민 전용 세그먼트 컨트롤(MODULAR 대상 아님) */
function AxisModeToggle({
  value,
  onChange,
}: {
  value: AmbientDropAxisMode
  onChange: (mode: AmbientDropAxisMode) => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-[#e5e7eb] p-0.5 bg-white">
      {(['explicit', 'random'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            value === mode ? 'bg-[#111111] text-white' : 'text-[#6b7280] hover:text-[#111111]'
          }`}
        >
          {mode === 'explicit' ? '명시' : '무작위'}
        </button>
      ))}
    </div>
  )
}

function formatPayloadSummary(payload: Record<string, unknown>): string {
  const category = (payload.effectiveCategorySlug as string | null) ?? '전체'
  const collectionIds = (payload.effectiveCollectionIds as string[] | undefined) ?? []
  const spawned = payload.spawned as number | undefined
  const reason = payload.reason as string | undefined
  const trigger = payload.trigger as string | undefined
  const triggerLabel = trigger === 'cron' ? '자동' : trigger === 'manual' ? '수동' : trigger ?? '?'
  const collectionLabel = collectionIds.length > 0 ? `컬렉션 ${collectionIds.length}개` : '전체 컬렉션'
  return `[${triggerLabel}] 카테고리: ${category} · ${collectionLabel} · 배치 ${spawned ?? 0}개${reason ? ` (${reason})` : ''}`
}

export default function AmbientDropForm({
  initial,
  categories,
  books,
  history,
  initialBlocked,
  scheduleLabel,
}: AmbientDropFormProps) {
  const [values, setValues] = useState<AmbientDropConfig>(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const [deploying, setDeploying] = useState(false)
  const [deployBlocked, setDeployBlocked] = useState(initialBlocked)
  const [deployResult, setDeployResult] = useState<AmbientDropBatchResult | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)

  const raritySum = values.rarity_common + values.rarity_rare + values.rarity_legend + values.rarity_mythic
  const raritySumInvalid = values.rarity_mode === 'explicit' && Math.abs(raritySum - 1) > 0.001

  const set = <K extends keyof AmbientDropConfig>(key: K, value: AmbientDropConfig[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const toggleCollection = (id: string, checked: boolean) => {
    setValues((v) => ({
      ...v,
      collection_ids: checked ? [...v.collection_ids, id] : v.collection_ids.filter((x) => x !== id),
    }))
  }

  const handleSave = async () => {
    if (raritySumInvalid) {
      setMessage({ type: 'error', text: '등급 비율 합을 먼저 1로 맞춰주세요.' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/ambient-drop/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error ?? '저장 실패' })
      } else {
        setValues(json.config)
        setMessage({ type: 'ok', text: '저장되었습니다. 다음 배포부터 즉시 적용됩니다.' })
      }
    } catch {
      setMessage({ type: 'error', text: '네트워크 오류' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeploy = async () => {
    setDeploying(true)
    setDeployError(null)
    setDeployResult(null)
    try {
      const res = await fetch('/api/admin/ambient-drop/deploy', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setDeployError(json.error ?? '배포 실패')
        if (res.status === 409) setDeployBlocked(true)
      } else {
        setDeployResult(json.result)
      }
    } catch {
      setDeployError('네트워크 오류')
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* 트리거 — 자동 스케줄 + 상호 배제 창 */}
      <section className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
        <h2 className="font-bold mb-1">트리거</h2>
        <p className="text-[#6b7280] text-xs mb-4">
          자동 스케줄 시각은 {scheduleLabel}로 고정돼요. 아래 스위치는 그 스케줄이 실제로 배치를
          수행할지를 켜고 끕니다.
        </p>
        <div className="flex items-center gap-3 mb-4">
          <Switch checked={values.auto_enabled} onCheckedChange={(checked) => set('auto_enabled', checked)} />
          <span className="text-sm">자동 스케줄 등록</span>
        </div>
        <label className="block max-w-xs">
          <span className="text-sm text-[#374151]">상호 배제 창 (분)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={values.exclusion_window_minutes}
            onChange={(e) => set('exclusion_window_minutes', Number(e.target.value))}
            className="mt-1 w-full bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#111111]/50"
          />
          <span className="text-xs text-[#898989]">
            자동 스케줄 시각 전후 이 분(分)만큼 수동 배포 버튼이 비활성화돼요.
          </span>
        </label>
      </section>

      {/* 메타 옵션 */}
      <section className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <Switch checked={values.all_random} onCheckedChange={(checked) => set('all_random', checked)} />
          <span className="text-sm font-bold">전체 무작위</span>
        </div>
        <p className="text-xs text-[#898989] mt-2">
          켜면 아래 3축을 실행 시점에 전부 무작위로 취급해요. 아래 저장된 값은 그대로 남아있고,
          꺼지면 다시 적용돼요.
        </p>
      </section>

      {/* 축 1: 카테고리 */}
      <section className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">축 1 — 카테고리</h2>
          <AxisModeToggle value={values.category_mode} onChange={(mode) => set('category_mode', mode)} />
        </div>
        {values.category_mode === 'explicit' ? (
          <select
            value={values.category_slug ?? ALL_CATEGORY_VALUE}
            onChange={(e) => set('category_slug', e.target.value === ALL_CATEGORY_VALUE ? null : e.target.value)}
            className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#111111]/50 max-w-xs"
          >
            <option value={ALL_CATEGORY_VALUE}>전체 카테고리</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-[#898989]">실행 시점에 카테고리 하나를 무작위로 선택해요.</p>
        )}
      </section>

      {/* 축 2: 등급 비율 */}
      <section className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">축 2 — 등급 비율</h2>
          <AxisModeToggle value={values.rarity_mode} onChange={(mode) => set('rarity_mode', mode)} />
        </div>
        {values.rarity_mode === 'explicit' ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(
                [
                  ['rarity_common', 'Common'],
                  ['rarity_rare', 'Rare'],
                  ['rarity_legend', 'Legend'],
                  ['rarity_mythic', 'Mythic'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs text-[#374151]">{label}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={values[key]}
                    onChange={(e) => set(key, Number(e.target.value))}
                    className="mt-1 w-full bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#111111]/50"
                  />
                </label>
              ))}
            </div>
            <p className={`text-xs mt-2 ${raritySumInvalid ? 'text-red-600' : 'text-[#898989]'}`}>
              합: {raritySum.toFixed(3)} {raritySumInvalid && '(1이어야 함)'}
            </p>
            <p className="text-xs text-[#898989] mt-1">
              현재 아이템배지 카탈로그는 common 등급만 존재해요 — 운영값은 common 100%를 권장해요.
            </p>
          </>
        ) : (
          <p className="text-xs text-[#898989]">실행 시점에 등급 분포 자체를 무작위로 생성해요.</p>
        )}
      </section>

      {/* 축 3: 대상 컬렉션 */}
      <section className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">축 3 — 대상 컬렉션</h2>
          <AxisModeToggle value={values.collection_mode} onChange={(mode) => set('collection_mode', mode)} />
        </div>
        {values.collection_mode === 'explicit' ? (
          <>
            <p className="text-xs text-[#898989] mb-2">
              선택하지 않으면 전체 컬렉션에서 배치해요. 여러 개 선택 가능해요.
            </p>
            <div className="max-h-56 overflow-y-auto space-y-1.5 border border-[#e5e7eb] rounded-xl p-3">
              {books.map((b) => (
                <label key={b.id} className="flex items-center gap-2.5 text-sm py-1">
                  <Checkbox
                    checked={values.collection_ids.includes(b.id)}
                    onCheckedChange={(checked) => toggleCollection(b.id, checked === true)}
                  />
                  {b.name}
                </label>
              ))}
              {books.length === 0 && <p className="text-xs text-[#898989]">활성 컬렉션이 없어요.</p>}
            </div>
          </>
        ) : (
          <p className="text-xs text-[#898989]">실행 시점에 컬렉션 1개를 무작위로 선택해요.</p>
        )}
      </section>

      {/* 배치 규모 */}
      <section className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
        <h2 className="font-bold mb-1">배치 규모</h2>
        <p className="text-[#6b7280] text-xs mb-4">
          3축에 속하지 않는 실행 파라미터예요. 커버리지 목표치 계산은 없어요 — 실행마다 이 개수만큼
          그때그때 배치해요.
        </p>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <label className="block">
            <span className="text-xs text-[#374151]">실행당 배치 개수</span>
            <input
              type="number"
              min={1}
              step={1}
              value={values.batch_size}
              onChange={(e) => set('batch_size', Number(e.target.value))}
              className="mt-1 w-full bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#111111]/50"
            />
          </label>
          <label className="block">
            <span className="text-xs text-[#374151]">POI당 최대 활성 드랍</span>
            <input
              type="number"
              min={1}
              step={1}
              value={values.max_active_per_poi}
              onChange={(e) => set('max_active_per_poi', Number(e.target.value))}
              className="mt-1 w-full bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#111111]/50"
            />
          </label>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving || raritySumInvalid}
          className="bg-[#111111] text-white font-bold px-6 py-2.5 rounded-xl hover:bg-[#242424] transition-colors text-sm disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        {message && (
          <p className={`text-sm ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
        )}
      </div>

      {/* 수동 배포 */}
      <section className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
        <h2 className="font-bold mb-1">지금 배포</h2>
        <p className="text-[#6b7280] text-xs mb-4">
          위에 저장된 설정(저장 안 한 변경사항 제외)으로 즉시 1회 배치해요.
        </p>
        <button
          onClick={handleDeploy}
          disabled={deploying || deployBlocked}
          className="bg-[#111111] text-white font-bold px-6 py-2.5 rounded-xl hover:bg-[#242424] transition-colors text-sm disabled:opacity-50"
        >
          {deploying ? '배포 중…' : '지금 배포'}
        </button>
        {deployBlocked && !deployError && (
          <p className="text-xs text-[#898989] mt-2">
            자동 스케줄 시각과 겹쳐 지금은 비활성화돼 있어요.
          </p>
        )}
        {deployError && <p className="text-sm text-red-600 mt-2">{deployError}</p>}
        {deployResult && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mt-3">
            {formatPayloadSummary(deployResult as unknown as Record<string, unknown>)}
          </div>
        )}
      </section>

      {/* 최근 실행 이력 */}
      <section className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
        <h2 className="font-bold mb-3">최근 실행 이력</h2>
        {history.length === 0 ? (
          <p className="text-sm text-[#898989]">아직 실행 이력이 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-[#374151] flex flex-col gap-0.5">
                <span className="text-[#898989]">{new Date(h.created_at).toLocaleString('ko-KR')}</span>
                <span>{formatPayloadSummary(h.payload)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
