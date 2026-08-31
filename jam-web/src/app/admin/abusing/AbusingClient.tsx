'use client'

import { useRef, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import type { AbusingPolicy } from '@/lib/abusing/policy'
import { BanTable, type BanRow } from './BanTable'
import { PoiBlockTable, type PoiBlockRow } from './PoiBlockTable'

interface Props {
  policy: AbusingPolicy
  bans: BanRow[]
  poiBlocks: PoiBlockRow[]
}

type Tab = 'policy' | 'bans' | 'poi-blocks'

function RateInput({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  // 정책 로딩이 어긋나 undefined/NaN이 들어와도 제어 컴포넌트가 비제어로 떨어지지 않게 방어한다.
  // (컬럼명 불일치로 legend 슬라이더가 undefined를 받아 실제 DB값 0.0(차단)을 "정상"으로
  //  잘못 표시한 이력이 있다 — 티켓 20260831_1149. 안전한 방향인 0=차단으로 폴백한다)
  const v = Number.isFinite(value) ? value : 0
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0} max={1} step={0.1}
          value={v}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-primary"
        />
        <span className={`text-sm font-mono w-8 text-right ${v === 0 ? 'text-red-600' : v < 1 ? 'text-amber-600' : 'text-foreground'}`}>
          {v === 0 ? '차단' : v < 1 ? `${Math.round(v * 100)}%` : '정상'}
        </span>
      </div>
    </label>
  )
}

export default function AbusingClient({ policy: initPolicy, bans: initBans, poiBlocks: initBlocks }: Props) {
  // Select 드롭다운(Radix Portal)은 기본적으로 document.body에 렌더링되는데, shadcn 어드민
  // 테마 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다 (4단계a `BadgeForm.tsx`와 동일 패턴, 20260826_018).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

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

  // 오류 메시지에는 DB 오류 코드가 붙어 3초로는 읽기 어렵다 — 오류는 자동으로 사라지지 않고
  // 닫기 버튼이나 다음 메시지로만 닫힌다. 성공 메시지는 기존대로 3초 뒤 사라진다.
  const msgSeq = useRef(0)
  const flash = (type: 'ok' | 'err', text: string) => {
    const seq = ++msgSeq.current
    setMsg({ type, text })
    if (type === 'ok') {
      setTimeout(() => {
        if (msgSeq.current === seq) setMsg(null)
      }, 3000)
    }
  }

  const savePolicy = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/abusing/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      })
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; policy?: AbusingPolicy; error?: string }
        | null
      if (!res.ok) {
        // API가 실패 사유를 실어 보내므로 그대로 노출한다 (어드민 화면 — 원인 특정이 우선)
        flash(
          'err',
          json?.error ??
            `어뷰징 정책이 저장되지 않았어요. 서버가 ${res.status} 오류로 응답했어요. 잠시 후 다시 시도해 주세요.`
        )
        return
      }
      // 저장 직후 DB에서 다시 읽은 값으로 화면을 맞춘다
      if (json?.policy) setPolicy(json.policy)
      flash('ok', '정책이 저장됐어요')
    } catch {
      flash(
        'err',
        '어뷰징 정책이 저장되지 않았어요. 서버에 연결하지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.'
      )
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

  // 일괄 해제(20260826_015) — 단건 해제 API를 선택된 항목 전체에 순차 호출한다
  // (배지 파일럿과 동일 방식). 네이티브 confirm은 `BanTable`의 AlertDialog가 대신한다.
  const bulkRemoveBans = async (userIds: string[]) => {
    let failCount = 0
    for (const userId of userIds) {
      const res = await fetch('/api/admin/abusing/bans', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      if (res.ok) setBans((prev) => prev.filter((b) => b.user_id !== userId))
      else failCount += 1
    }
    if (failCount > 0) flash('err', `${failCount}건 해제 실패`)
    else flash('ok', '일괄 해제 완료')
  }

  const bulkRemovePoiBlocks = async (pairs: { userId: string; poiId: string }[]) => {
    let failCount = 0
    for (const { userId, poiId } of pairs) {
      const res = await fetch('/api/admin/abusing/poi-blocks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, poi_id: poiId }),
      })
      if (res.ok) setPoiBlocks((prev) => prev.filter((b) => !(b.user_id === userId && b.poi_id === poiId)))
      else failCount += 1
    }
    if (failCount > 0) flash('err', `${failCount}건 해제 실패`)
    else flash('ok', '일괄 해제 완료')
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
          <p className="text-muted-foreground text-sm mt-0.5">투트랙 섀도우밴 + POI GPS 조작 감지</p>
        </div>
        {msg && (
          <div className={`flex items-start gap-2 text-sm font-medium px-4 py-2 rounded-xl max-w-md ${msg.type === 'ok' ? 'bg-primary/10 text-foreground' : 'bg-red-50 text-red-600'}`}>
            <span className="flex-1 break-words">{msg.text}</span>
            {msg.type === 'err' && (
              <button
                type="button"
                onClick={() => setMsg(null)}
                aria-label="오류 메시지 닫기"
                className="shrink-0 text-red-600/60 hover:text-red-600 leading-5"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5',
              tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t.label}
            {t.count != null && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${tab === t.key ? 'bg-primary/20 text-foreground' : 'bg-muted text-muted-foreground'}`}>
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
          <div className="bg-white border border-border rounded-2xl p-4 text-sm text-foreground leading-relaxed">
            <p className="font-semibold text-foreground mb-1">투트랙 정책</p>
            <p><span className="text-amber-600 font-medium">Soft-ban</span> — 폰 흔들기 등 소프트 어뷰저. 잡템은 허용하되 고가치 아이템(legend/mythic) 차단.</p>
            <p className="mt-1"><span className="text-red-600 font-medium">Hard-ban</span> — GPS 조작 등 생태계 파괴. 유저 화면은 정상이지만 희귀 아이템 드랍률 0% 고정.</p>
          </div>

          {/* Soft-ban 설정 */}
          <div className="bg-white border border-amber-100 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">Soft-ban 드랍 배율</h3>
            <RateInput label="Common" value={policy.soft_common_rate} onChange={(v) => policySet('soft_common_rate', v)} />
            <RateInput label="Rare" value={policy.soft_rare_rate} onChange={(v) => policySet('soft_rare_rate', v)} />
            <RateInput label="Legend" value={policy.soft_legend_rate} onChange={(v) => policySet('soft_legend_rate', v)} />
            <RateInput label="Mythic" value={policy.soft_mythic_rate} onChange={(v) => policySet('soft_mythic_rate', v)} />
          </div>

          {/* Hard-ban 설정 */}
          <div className="bg-white border border-red-100 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-red-600 uppercase tracking-wider">Hard-ban 드랍 배율</h3>
            <RateInput label="Common" value={policy.hard_common_rate} onChange={(v) => policySet('hard_common_rate', v)} />
            <RateInput label="Rare" value={policy.hard_rare_rate} onChange={(v) => policySet('hard_rare_rate', v)} />
            <RateInput label="Legend" value={policy.hard_legend_rate} onChange={(v) => policySet('hard_legend_rate', v)} />
            <RateInput label="Mythic" value={policy.hard_mythic_rate} onChange={(v) => policySet('hard_mythic_rate', v)} />
          </div>

          {/* GPS 설정 */}
          <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">GPS 조작 감지</h3>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">이동 속도 임계값 (km/h) — 이 속도를 초과하면 GPS 조작으로 판단</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={policy.gps_max_speed_kmh}
                  onChange={(e) => policySet('gps_max_speed_kmh', parseInt(e.target.value) || 300)}
                  className="w-28 bg-white border border-border rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary/50"
                />
                <span className="text-sm text-muted-foreground">km/h (기본: 300)</span>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">차량 속도 필터 (km/h) — 이 속도를 초과하는 활동은 배지 평가에서 제외 (Phase 18)</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={policy.vehicle_speed_filter_kmh}
                  onChange={(e) => policySet('vehicle_speed_filter_kmh', parseInt(e.target.value) || 60)}
                  className="w-28 bg-white border border-border rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary/50"
                />
                <span className="text-sm text-muted-foreground">km/h (기본: 60)</span>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">POI 블록 지속 시간 (시간)</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={policy.poi_block_hours}
                  onChange={(e) => policySet('poi_block_hours', parseInt(e.target.value) || 72)}
                  className="w-28 bg-white border border-border rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary/50"
                />
                <span className="text-sm text-muted-foreground">시간 (기본: 72시간 = 3일)</span>
              </div>
            </label>
          </div>

          <button
            onClick={savePolicy}
            disabled={saving}
            className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '정책 저장'}
          </button>
        </div>
      )}

      {/* 섀도우밴 탭 */}
      {tab === 'bans' && (
        <div className="space-y-5">
          {/* 새 밴 추가 */}
          <div className="bg-white border border-border rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">수동 섀도우밴 적용</h3>
            <input
              value={banUserId}
              onChange={(e) => setBanUserId(e.target.value)}
              placeholder="유저 UUID"
              className="w-full bg-white border border-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
            <div className="flex gap-2">
              <Select value={banLevel} onValueChange={(v) => setBanLevel(v as 'soft' | 'hard')}>
                <SelectTrigger className="w-auto min-w-[8rem]" aria-label="밴 레벨">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={themeContainer ?? undefined}>
                  <SelectItem value="soft">Soft-ban</SelectItem>
                  <SelectItem value="hard">Hard-ban</SelectItem>
                </SelectContent>
              </Select>
              <input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="사유 (내부 기록용)"
                className="flex-1 bg-white border border-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={addBan}
                disabled={banAdding || !banUserId.trim() || !banReason.trim()}
                className="bg-red-600 text-white font-bold px-4 py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-40 transition-colors text-sm"
              >
                적용
              </button>
            </div>
          </div>

          {/* 밴 목록 */}
          <BanTable bans={bans} onRemove={removeBan} onBulkRemove={bulkRemoveBans} />
        </div>
      )}

      {/* POI 블록 탭 */}
      {tab === 'poi-blocks' && (
        <PoiBlockTable poiBlocks={poiBlocks} onRemove={removePoiBlock} onBulkRemove={bulkRemovePoiBlocks} />
      )}
    </div>
  )
}
