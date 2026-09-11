'use client'

/**
 * 게이트 미션 — 축 × 단계 매트릭스 + 노출 조건 요약 + 폐기 대상 목록 (티켓 20260905_0033)
 *
 * 구조화 입력 폼 자체는 `/admin/gate-missions/new`, `/admin/gate-missions/[id]` 페이지의
 * `GateMissionForm.tsx`가 담당한다(티켓 20260911_2035 — 예전에는 이 컴포넌트 안에서
 * 폼을 토글했다). 이 컴포넌트는 매트릭스·요약·목록만 그린다.
 */
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MissionRow } from '@/types/database'
import { MISSION_GATE_STAGES } from '@/types/database'
import {
  GATE_STAGE_LABEL,
  buildGateMatrix,
  describeVisibilityRule,
  gateAxisLabel,
  isGateMission,
  isGateStageMissionOptional,
  parseVisibilityRule,
} from '@/lib/missions/gateMissions'
import { Button } from '@/components/admin/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'

/**
 * 노출 조건에서 고를 수 있는 계열 — **계열 키가 발급된 계열만** 들어온다. 예외는 JAM!
 * 카테고리(`adminCategory==='jam'`, 티켓 20260910_2055) — family_key 없이 `#name:` 폴백
 * 키로 들어온다.
 */
export interface GateFamilyOption {
  familyKey: string
  name: string
  activityType: string | null
  kind: 'graded' | 'leveled' | 'mixed'
  topLabel: string
  adminCategory: string | null
}

interface Props {
  /** 게이트 미션 + 폐기 대상(레거시 게이트 미션) */
  missions: MissionRow[]
}

export default function GateMissionManager({ missions }: Props) {
  const router = useRouter()

  const gateMissions = useMemo(() => missions.filter(isGateMission), [missions])
  const legacyMissions = useMemo(() => missions.filter((m) => !isGateMission(m)), [missions])
  const matrix = useMemo(() => buildGateMatrix(gateMissions), [gateMissions])
  const missionById = useMemo(() => new Map(missions.map((m) => [m.id, m])), [missions])

  async function handleDelete(id: string, title: string) {
    if (!confirm(`"${title}" 미션을 삭제할까요? 참가·완료 기록도 함께 사라져요.`)) return
    const res = await fetch(`/api/admin/missions/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const payload = await res.json().catch(() => null)
      alert(typeof payload?.error === 'string' ? payload.error : '미션을 삭제하지 못했어요.')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Button asChild>
        <Link href="/admin/gate-missions/new">+ 게이트 미션 만들기</Link>
      </Button>

      {/* 매트릭스 — 축 × 단계 */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold">축 × 단계 매트릭스</h2>
        <div className="bg-white border border-border rounded-2xl overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>축</TableHead>
                {MISSION_GATE_STAGES.map((stage) => (
                  <TableHead key={stage}>{GATE_STAGE_LABEL[stage]}</TableHead>
                ))}
                <TableHead className="text-right">커버리지</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    아직 게이트 미션이 없어요. 「+ 게이트 미션 만들기」로 첫 미션을 추가해보세요.
                  </TableCell>
                </TableRow>
              )}
              {matrix.map((row) => (
                <TableRow key={row.axis}>
                  <TableCell className="align-top whitespace-nowrap">
                    <span className="font-medium">{gateAxisLabel(row.axis)}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">{row.axis}</span>
                  </TableCell>
                  {MISSION_GATE_STAGES.map((stage) => (
                    <TableCell key={stage} className="align-top">
                      {row.cells[stage].length === 0 ? (
                        isGateStageMissionOptional(stage) ? (
                          <span className="rounded bg-slate-100 px-1.5 py-px text-[11px] font-medium text-slate-500">
                            미션 불필요(축 교차로 충분)
                          </span>
                        ) : (
                          <span className="rounded bg-red-100 px-1.5 py-px text-[11px] font-medium text-red-700">
                            비어 있음
                          </span>
                        )
                      ) : (
                        <ul className="space-y-1">
                          {row.cells[stage].map((m) => {
                            const full = missionById.get(m.id)
                            return (
                              <li key={m.id} className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm">{m.title}</span>
                                {full && (
                                  <>
                                    <Link
                                      href={`/admin/gate-missions/${full.id}`}
                                      className="text-xs text-primary underline underline-offset-2"
                                    >
                                      수정
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(full.id, full.title)}
                                      className="text-xs text-red-600 underline underline-offset-2"
                                    >
                                      삭제
                                    </button>
                                  </>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-right align-top whitespace-nowrap">
                    {row.complete ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-px text-[11px] font-medium text-emerald-700">
                        채워짐
                      </span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-px text-[11px] font-medium text-amber-800">
                        구멍 있음
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 노출 조건 요약 */}
      {gateMissions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold">노출 조건</h2>
          <div className="bg-white border border-border rounded-2xl overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>미션</TableHead>
                  <TableHead>축 / 단계</TableHead>
                  <TableHead>노출 조건</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gateMissions.map((m) => {
                  const parsed = parseVisibilityRule(m.visibility_rule_json)
                  return (
                    <TableRow key={m.id}>
                      <TableCell>{m.title}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {m.gate_axis} · {m.gate_stage ? GATE_STAGE_LABEL[m.gate_stage] : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {parsed.ok ? (
                          describeVisibilityRule(parsed.value)
                        ) : (
                          <span className="text-red-600">형태 오류 — {parsed.error} (아무에게도 열리지 않아요)</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* 폐기 대상 */}
      {legacyMissions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold">폐기 대상 — 예전 방식(게이트 배지)으로 게이팅하는 미션</h2>
          <p className="text-xs text-muted-foreground">
            v5 카탈로그 시딩(티켓 20260905_0035)과 <b>같은 시점에</b> 폐기해요. 먼저 지우면 그동안 게이트가 열린
            채로 남아요.
          </p>
          <div className="bg-white border border-border rounded-2xl overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>미션</TableHead>
                  <TableHead>게이트 배지 id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legacyMissions.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.title}</TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">{m.gated_badge_id}</TableCell>
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
