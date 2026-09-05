'use client'

/**
 * 노출 미리보기 — 유저 id를 넣으면 그 유저에게 각 게이트 미션이 어떻게 보이는지 (티켓 20260905_0033)
 *
 * **지금까지 `visibility` 로직을 어드민에서 확인할 방법이 전혀 없었다.** 판정은 서버
 * (`/api/admin/gate-missions/preview`)가 서비스와 **똑같은 함수**로 하고, 이 컴포넌트는
 * 결과를 그리기만 한다 — 어드민 전용 판정을 만들면 미리보기가 거짓말을 하게 된다.
 */
import { useState } from 'react'
import { GATE_STAGE_LABEL } from '@/lib/missions/gateMissions'
import { RARITY_LABEL } from '@/lib/rarity'
import type { BadgeRarity, MissionGateStage } from '@/types/database'
import { Input } from '@/components/admin/ui/input'
import { Button } from '@/components/admin/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'

type Visibility = 'open' | 'locked' | 'hidden' | 'completed'

interface PreviewResult {
  id: string
  title: string
  gate_axis: string | null
  gate_stage: MissionGateStage | null
  legacy: boolean
  visibility: Visibility
  requiredBadge: { name: string; rarity: BadgeRarity } | null
}

interface PreviewResponse {
  userLabel: string
  results: PreviewResult[]
  ownedFamilies: { familyKey: string; tier: number | null }[]
}

const VISIBILITY_STYLE: Record<Visibility, { label: string; chip: string }> = {
  open: { label: '열림', chip: 'bg-emerald-100 text-emerald-700' },
  locked: { label: '잠김', chip: 'bg-amber-100 text-amber-800' },
  hidden: { label: '숨김', chip: 'bg-neutral-200 text-neutral-700' },
  completed: { label: '완료', chip: 'bg-sky-100 text-sky-700' },
}

/** 계열 보유 티어 → 사람이 읽는 문장. `0`은 「등급 없는 배지(레벨형)만 보유」다 */
function describeOwnedTier(tier: number | null): string {
  if (tier == null) return '미보유'
  if (tier === 0) return '보유 (레벨형 — 등급 없음)'
  const rarity = (['common', 'rare', 'epic', 'mystic'] as BadgeRarity[])[tier - 1]
  return rarity ? `보유 (최고 ${RARITY_LABEL[rarity]})` : '보유'
}

export default function GateMissionPreview() {
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<PreviewResponse | null>(null)

  async function run() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/gate-missions/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setLoading(false)
    if (!res.ok) {
      const payload = await res.json().catch(() => null)
      setData(null)
      setError(typeof payload?.error === 'string' ? payload.error : '미리보기를 불러오지 못했어요.')
      return
    }
    setData((await res.json()) as PreviewResponse)
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold">노출 미리보기</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          유저 ID를 넣으면 그 유저에게 게이트 미션이 열림·잠김·숨김 중 무엇으로 보이는지 확인해요. 서비스와
          똑같은 판정 함수를 써요.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="유저 ID (UUID)"
          aria-label="유저 ID"
          className="max-w-md font-mono"
        />
        <Button onClick={run} disabled={loading || !userId.trim()}>
          {loading ? '확인 중...' : '미리보기'}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {data && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <b className="text-foreground">{data.userLabel}</b> 기준 · 게이트 미션 {data.results.length}개
          </p>

          {data.ownedFamilies.length > 0 && (
            <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
              <p className="font-bold text-foreground">노출 조건이 보는 계열</p>
              {data.ownedFamilies.map((f) => (
                <p key={f.familyKey}>
                  <span className="font-mono">{f.familyKey}</span> — {describeOwnedTier(f.tier)}
                </p>
              ))}
            </div>
          )}

          <div className="bg-white border border-border rounded-2xl overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>미션</TableHead>
                  <TableHead>축 / 단계</TableHead>
                  <TableHead>판정</TableHead>
                  <TableHead>잠금 안내</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      게이트 미션이 아직 없어요.
                    </TableCell>
                  </TableRow>
                )}
                {data.results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.title}
                      {r.legacy && (
                        <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-px text-[11px] font-medium text-amber-800">
                          폐기 대상
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.gate_axis ?? '—'} · {r.gate_stage ? GATE_STAGE_LABEL[r.gate_stage] : '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded px-1.5 py-px text-[11px] font-medium ${VISIBILITY_STYLE[r.visibility].chip}`}
                      >
                        {VISIBILITY_STYLE[r.visibility].label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.requiredBadge
                        ? `${r.requiredBadge.name} (${RARITY_LABEL[r.requiredBadge.rarity] ?? r.requiredBadge.rarity}) 필요`
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
