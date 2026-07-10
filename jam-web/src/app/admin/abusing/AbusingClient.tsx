'use client'

import { useState } from 'react'
import type { AbusingPolicy } from '@/lib/abusing/policy'

interface BanRow {
  id: string
  user_id: string
  ban_level: 'soft' | 'hard'
  reason: string
  expires_at: string | null
  created_at: string
  created_by: string
  user: { id: string; email: string; display_name: string } | null
}

interface PoiBlockRow {
  id: string
  user_id: string
  poi_id: string
  blocked_until: string
  reason: string
  created_at: string
  user: { id: string; email: string; display_name: string } | null
  poi: { id: string; name: string } | null
}

interface Props {
  policy: AbusingPolicy
  bans: BanRow[]
  poiBlocks: PoiBlockRow[]
}

type Tab = 'policy' | 'bans' | 'poi-blocks'

function RateInput({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-white/50">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0} max={1} step={0.1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-[#AEEA00]"
        />
        <span className={`text-sm font-mono w-8 text-right ${value === 0 ? 'text-red-400' : value < 1 ? 'text-yellow-400' : 'text-[#AEEA00]'}`}>
          {value === 0 ? '차단' : value < 1 ? `${Math.round(value * 100)}%` : '정상'}
        </span>
      </div>
    </label>
  )
}

export default function AbusingClient({ policy: initPolicy, bans: initBans, poiBlocks: initBlocks }: Props) {
  const [tab, setTab] = useState<Tab>('policy')
  const [policy, setPolicy] = useState(initPolicy)
  const [bans, setBans] = useState(initBans)
  const [poiBlocks, setPoiBlocks] = useState(initBlocks)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // 새 밴 추가 폼
  const [banUserId, setBanUserId] = useState('')
  const [banLevel, setBanLevel] = useState<'soft' | 'hard'>('soft')
  const [banReason, setBanReason] = useState('')
  const [banAdding, setBanAdding] = useState(false)

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3000)
  }

  const savePolicy = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/abusing/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      })
      if (!res.ok) throw new Error()
      flash('ok', '정책이 저장됐어요')
    } catch {
      flash('err', '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const removeBan = async (userId: string) => {
    if (!confirm('섀도우밴을 해제할까요?')) return
    const res = await fetch('/api/admin/abusing/bans', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    if (res.ok) {
      setBans((prev) => prev.filter((b) => b.user_id !== userId))
      flash('ok', '밴 해제 완료')
    }
  }

  const addBan = async () => {
    if (!banUserId.trim() || !banReason.trim()) return
    setBanAdding(true)
    try {
      const res = await fetch('/api/admin/abusing/bans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: banUserId.trim(), ban_level: banLevel, reason: banReason.trim() }),
      })
      if (!res.ok) throw new Error()
      flash('ok', '섀도우밴 적용 완료')
      setBanUserId('')
      setBanReason('')
      // 목록 새로고침
      const listRes = await fetch('/api/admin/abusing/bans')
      const listData = await listRes.json()
      setBans(listData.bans ?? [])
    } catch {
      flash('err', '밴 적용 실패')
    } finally {
      setBanAdding(false)
    }
  }

  const removePoiBlock = async (userId: string, poiId: string) => {
    const res = await fetch('/api/admin/abusing/poi-blocks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, poi_id: poiId }),
    })
    if (res.ok) {
      setPoiBlocks((prev) => prev.filter((b) => !(b.user_id === userId && b.poi_id === poiId)))
      flash('ok', '블록 해제 완료')
    }
  }

  const policySet = (key: keyof AbusingPolicy, value: number) => setPolicy((p) => ({ ...p, [key]: value }))

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'policy', label: '정책 설정' },
    { key: 'bans', label: '섀도우밴', count: bans.length },
    { key: 'poi-blocks', label: 'POI 블록', count: poiBlocks.length },
  ]

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">어뷰징 정책 관리</h1>
          <p className="text-white/40 text-sm mt-0.5">투트랙 섀도우밴 + POI GPS 조작 감지</p>
        </div>
        {msg && (
          <div className={`text-sm font-medium px-4 py-2 rounded-xl ${msg.type === 'ok' ? 'bg-[#AEEA00]/10 text-[#AEEA00]' : 'bg-red-500/10 text-red-400'}`}>
            {msg.text}
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-white/10 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5',
              tab === t.key ? 'border-[#AEEA00] text-[#AEEA00]' : 'border-transparent text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            {t.label}
            {t.count != null && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${tab === t.key ? 'bg-[#AEEA00]/20 text-[#AEEA00]' : 'bg-white/10 text-white/30'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 정책 설정 탭 */}
      {tab === 'policy' && (
        <div className="space-y-6">
          {/* 안내 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white/60 leading-relaxed">
            <p className="font-semibold text-white mb-1">투트랙 정책</p>
            <p><span className="text-yellow-400 font-medium">Soft-ban</span> — 폰 흔들기 등 소프트 어뷰저. 잡템은 허용하되 고가치 아이템(legendary/mythic) 차단.</p>
            <p className="mt-1"><span className="text-red-400 font-medium">Hard-ban</span> — GPS 조작 등 생태계 파괴. 유저 화면은 정상이지만 희귀 아이템 드랍률 0% 고정.</p>
          </div>

          {/* Soft-ban 설정 */}
          <div className="bg-white/5 border border-yellow-400/20 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">Soft-ban 드랍 배율</h3>
            <RateInput label="Common" value={policy.soft_common_rate} onChange={(v) => policySet('soft_common_rate', v)} />
            <RateInput label="Rare" value={policy.soft_rare_rate} onChange={(v) => policySet('soft_rare_rate', v)} />
            <RateInput label="Legendary" value={policy.soft_legendary_rate} onChange={(v) => policySet('soft_legendary_rate', v)} />
            <RateInput label="Mythic" value={policy.soft_mythic_rate} onChange={(v) => policySet('soft_mythic_rate', v)} />
          </div>

          {/* Hard-ban 설정 */}
          <div className="bg-white/5 border border-red-500/20 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider">Hard-ban 드랍 배율</h3>
            <RateInput label="Common" value={policy.hard_common_rate} onChange={(v) => policySet('hard_common_rate', v)} />
            <RateInput label="Rare" value={policy.hard_rare_rate} onChange={(v) => policySet('hard_rare_rate', v)} />
            <RateInput label="Legendary" value={policy.hard_legendary_rate} onChange={(v) => policySet('hard_legendary_rate', v)} />
            <RateInput label="Mythic" value={policy.hard_mythic_rate} onChange={(v) => policySet('hard_mythic_rate', v)} />
          </div>

          {/* GPS 설정 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">GPS 조작 감지</h3>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">이동 속도 임계값 (km/h) — 이 속도를 초과하면 GPS 조작으로 판단</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={policy.gps_max_speed_kmh}
                  onChange={(e) => policySet('gps_max_speed_kmh', parseInt(e.target.value) || 300)}
                  className="w-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#AEEA00]/50"
                />
                <span className="text-sm text-white/40">km/h (기본: 300)</span>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">차량 속도 필터 (km/h) — 이 속도를 초과하는 활동은 배지 평가에서 제외 (Phase 18)</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={policy.vehicle_speed_filter_kmh}
                  onChange={(e) => policySet('vehicle_speed_filter_kmh', parseInt(e.target.value) || 60)}
                  className="w-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#AEEA00]/50"
                />
                <span className="text-sm text-white/40">km/h (기본: 60)</span>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">POI 블록 지속 시간 (시간)</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={policy.poi_block_hours}
                  onChange={(e) => policySet('poi_block_hours', parseInt(e.target.value) || 72)}
                  className="w-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#AEEA00]/50"
                />
                <span className="text-sm text-white/40">시간 (기본: 72시간 = 3일)</span>
              </div>
            </label>
          </div>

          <button
            onClick={savePolicy}
            disabled={saving}
            className="bg-[#AEEA00] text-black font-bold px-6 py-2.5 rounded-xl hover:bg-[#c6ff00] disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '정책 저장'}
          </button>
        </div>
      )}

      {/* 섀도우밴 탭 */}
      {tab === 'bans' && (
        <div className="space-y-5">
          {/* 새 밴 추가 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white/60">수동 섀도우밴 적용</h3>
            <input
              value={banUserId}
              onChange={(e) => setBanUserId(e.target.value)}
              placeholder="유저 UUID"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
            />
            <div className="flex gap-2">
              <select
                value={banLevel}
                onChange={(e) => setBanLevel(e.target.value as 'soft' | 'hard')}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
              >
                <option value="soft" className="bg-[#1a1a1a]">Soft-ban</option>
                <option value="hard" className="bg-[#1a1a1a]">Hard-ban</option>
              </select>
              <input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="사유 (내부 기록용)"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
              />
              <button
                onClick={addBan}
                disabled={banAdding || !banUserId.trim() || !banReason.trim()}
                className="bg-red-600 text-white font-bold px-4 py-2.5 rounded-xl hover:bg-red-500 disabled:opacity-40 transition-colors text-sm"
              >
                적용
              </button>
            </div>
          </div>

          {/* 밴 목록 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-left">
                  <th className="px-4 py-3 font-medium">유저</th>
                  <th className="px-4 py-3 font-medium">레벨</th>
                  <th className="px-4 py-3 font-medium">사유</th>
                  <th className="px-4 py-3 font-medium">만료</th>
                  <th className="px-4 py-3 font-medium">적용자</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {bans.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-white/30">섀도우밴 유저 없음</td></tr>
                )}
                {bans.map((ban) => (
                  <tr key={ban.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3">
                      <p className="font-medium">{ban.user?.display_name ?? '—'}</p>
                      <p className="text-xs text-white/40">{ban.user?.email ?? ban.user_id.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ban.ban_level === 'hard' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-400/20 text-yellow-400'}`}>
                        {ban.ban_level.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs max-w-[160px] truncate">{ban.reason}</td>
                    <td className="px-4 py-3 text-white/40 text-xs">{ban.expires_at ? new Date(ban.expires_at).toLocaleDateString('ko-KR') : '영구'}</td>
                    <td className="px-4 py-3 text-white/40 text-xs">{ban.created_by}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => removeBan(ban.user_id)}
                        className="text-xs text-white/40 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        해제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* POI 블록 탭 */}
      {tab === 'poi-blocks' && (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-left">
                <th className="px-4 py-3 font-medium">유저</th>
                <th className="px-4 py-3 font-medium">POI</th>
                <th className="px-4 py-3 font-medium">사유</th>
                <th className="px-4 py-3 font-medium">차단 만료</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {poiBlocks.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-white/30">활성 POI 블록 없음</td></tr>
              )}
              {poiBlocks.map((b) => (
                <tr key={b.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3">
                    <p className="font-medium">{b.user?.display_name ?? '—'}</p>
                    <p className="text-xs text-white/40">{b.user?.email ?? b.user_id.slice(0, 8)}</p>
                  </td>
                  <td className="px-4 py-3 text-white/70">{b.poi?.name ?? b.poi_id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-white/40 text-xs">{b.reason}</td>
                  <td className="px-4 py-3 text-white/40 text-xs">
                    {new Date(b.blocked_until).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => removePoiBlock(b.user_id, b.poi_id)}
                      className="text-xs text-white/40 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      해제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
