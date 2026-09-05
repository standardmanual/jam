'use client'

/**
 * 배지 일괄 작업 도구의 화면 (티켓 20260905_0034)
 *
 * 판정은 전부 순수 함수(`lib/admin/badge-bulk.ts`)와 API가 갖는다 — 이 파일은 그리기와
 * 호출만 한다. 특히 **확인 문구·토큰은 화면이 만들지 않는다**(서버가 준 계획의 값을 그대로
 * 쓴다). 화면이 자기만의 판정을 갖는 순간 «본 것과 다른 것»을 실행할 수 있다.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import {
  BULK_ACTIONS,
  BULK_ACTION_DESCRIPTION,
  BULK_ACTION_LABEL,
  type BulkAction,
  type BulkPlan,
} from '@/lib/admin/badge-bulk'
import {
  BADGE_REFERENCE_GROUP_LABEL,
  BADGE_REFERENCE_SOURCES,
  BADGE_REFERENCE_SOURCE_BY_KEY,
  type BadgeReferenceKey,
} from '@/lib/admin/badge-references'
import type { BulkRunLogRow } from '@/lib/admin/badge-bulk-query'
import { BADGE_TYPES, BADGE_TYPE_LABEL, badgeTypeLabel } from '@/lib/admin/badge-labels'
import { TREE_ACTIVITY_ORDER } from '@/lib/badgeTree'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'

const ALL = 'all'

const RARITY_OPTIONS = [
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'mystic', label: 'Mystic' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: '살아 있는 배지' },
  { value: 'inactive', label: '폐기된 배지' },
  { value: 'all', label: '전부' },
]

const RUN_ACTION_LABEL: Record<string, string> = {
  ...BULK_ACTION_LABEL,
  detach_reference: '참조 해제',
}

interface FilterState {
  type: string | null
  activityType: string | null
  rarity: string | null
  status: string
  q: string | null
  familyKey: string | null
}

interface BulkToolManagerProps {
  initialFilter: FilterState
  recentRuns: BulkRunLogRow[]
  runsError: string | null
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function BulkToolManager({ initialFilter, recentRuns, runsError }: BulkToolManagerProps) {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterState>(initialFilter)
  const [action, setAction] = useState<BulkAction>('deactivate')
  const [plan, setPlan] = useState<BulkPlan | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [detachingRow, setDetachingRow] = useState<string | null>(null)
  // 해제는 라이브 투데이 카드·미션을 즉시 바꾸고 되돌리려면 각 어드민에서 손으로 복구해야
  // 한다. 버튼 한 번으로 나가지 않도록 한 번 더 묻는다 (게이트 리뷰, 티켓 20260905_0034).
  const [pendingDetach, setPendingDetach] = useState<{
    sourceKey: BadgeReferenceKey
    rowId: string
    badgeIds: string[]
    sourceLabel: string
    rowLabel: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [phrase, setPhrase] = useState('')

  // AlertDialog(Radix Portal)는 document.body에 렌더링되는데 어드민 테마 실값은
  // [data-admin-theme] 스코프 안에만 있다 — 포털 컨테이너를 그 노드로 지정한다
  // (BadgesTable.tsx와 같은 이유, 20260827_002).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  /** 필터·작업이 바뀌면 이전 계획은 «본 적 없는 계획»이 된다 — 즉시 버린다 */
  const invalidatePlan = () => {
    setPlan(null)
    setPhrase('')
    setError(null)
  }

  const patchFilter = (patch: Partial<FilterState>) => {
    setFilter((prev) => ({ ...prev, ...patch }))
    invalidatePlan()
  }

  const apiFilter = () => ({
    type: filter.type,
    activity_type: filter.activityType,
    rarity: filter.rarity,
    status: filter.status,
    q: filter.q,
    family_key: filter.familyKey,
  })

  const analyze = async (nextAction: BulkAction = action) => {
    setAnalyzing(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/badges/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextAction, filter: apiFilter() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setPlan(null)
        setError(json.error ?? '영향을 분석하지 못했어요. 잠시 뒤 다시 시도해주세요.')
        return
      }
      setPlan(json.plan as BulkPlan)
      setPhrase('')
    } catch {
      setPlan(null)
      setError('영향을 분석하지 못했어요. 네트워크 상태를 확인하고 다시 시도해주세요.')
    } finally {
      setAnalyzing(false)
    }
  }

  const execute = async () => {
    if (!plan) return
    setExecuting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/badges/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: plan.action,
          badge_ids: plan.badgeIds,
          confirm_token: plan.token,
          confirm_phrase: phrase.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '실행하지 못했어요. 잠시 뒤 다시 시도해주세요.')
        return
      }
      setResult(
        `${BULK_ACTION_LABEL[plan.action]} 완료 — 대상 ${plan.actionableIds.length}건 / 처리 ${json.affected}건`
      )
      setPlan(null)
      setPhrase('')
      setConfirmOpen(false)
      router.refresh()
    } catch {
      setError('실행하지 못했어요. 네트워크 상태를 확인하고 다시 시도해주세요.')
    } finally {
      setExecuting(false)
    }
  }

  const detach = async (sourceKey: BadgeReferenceKey, rowId: string, badgeIds: string[]) => {
    setDetachingRow(`${sourceKey}:${rowId}`)
    setError(null)
    try {
      const res = await fetch('/api/admin/badges/bulk/detach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_key: sourceKey, row_id: rowId, badge_ids: badgeIds }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '해제하지 못했어요. 잠시 뒤 다시 시도해주세요.')
        return
      }
      // 참조가 줄면 영향 건수와 토큰이 달라진다 — 계획을 다시 세운다.
      await analyze(plan?.action ?? action)
      router.refresh()
    } catch {
      setError('해제하지 못했어요. 네트워크 상태를 확인하고 다시 시도해주세요.')
    } finally {
      setDetachingRow(null)
    }
  }

  const nonZeroSources = plan
    ? BADGE_REFERENCE_SOURCES.filter((source) => plan.references.counts[source.key] > 0)
    : []
  const phraseMatches = !!plan && phrase.trim() === plan.requiredPhrase

  return (
    <div className="space-y-6">
      {/* ── 대상 좁히기 ─────────────────────────────────────────────── */}
      <section className="bg-white border border-border rounded-2xl p-4 md:p-5 space-y-4">
        <h2 className="font-semibold">① 대상 좁히기</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">종류</span>
            <Select
              value={filter.type ?? ALL}
              onValueChange={(v) => patchFilter({ type: v === ALL ? null : v })}
            >
              <SelectTrigger aria-label="종류">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>전체</SelectItem>
                {BADGE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {BADGE_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">종목</span>
            <Select
              value={filter.activityType ?? ALL}
              onValueChange={(v) => patchFilter({ activityType: v === ALL ? null : v })}
            >
              <SelectTrigger aria-label="종목">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>전체</SelectItem>
                {TREE_ACTIVITY_ORDER.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ACTIVITY_TYPE_LABELS[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">등급</span>
            <Select
              value={filter.rarity ?? ALL}
              onValueChange={(v) => patchFilter({ rarity: v === ALL ? null : v })}
            >
              <SelectTrigger aria-label="등급">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>전체</SelectItem>
                {RARITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">상태</span>
            <Select value={filter.status} onValueChange={(v) => patchFilter({ status: v })}>
              <SelectTrigger aria-label="상태">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">계열 키</span>
            <Input
              placeholder="walking:밤의 보행자"
              value={filter.familyKey ?? ''}
              onChange={(e) => patchFilter({ familyKey: e.target.value || null })}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">검색어(이름·설명)</span>
            <Input
              placeholder="배지 이름으로 검색"
              value={filter.q ?? ''}
              onChange={(e) => patchFilter({ q: e.target.value || null })}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          종류·종목·등급·계열 키·검색어 중 하나는 지정해야 해요. 조건에 맞는 배지는 페이지 경계
          없이 전부 대상이 돼요.
        </p>
      </section>

      {/* ── 작업 고르기 ─────────────────────────────────────────────── */}
      <section className="bg-white border border-border rounded-2xl p-4 md:p-5 space-y-4">
        <h2 className="font-semibold">② 작업 고르기</h2>
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <label className="space-y-1.5 md:w-72">
            <span className="text-xs text-muted-foreground">작업</span>
            <Select
              value={action}
              onValueChange={(v) => {
                setAction(v as BulkAction)
                invalidatePlan()
              }}
            >
              <SelectTrigger aria-label="작업">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BULK_ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {BULK_ACTION_LABEL[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button type="button" onClick={() => analyze()} disabled={analyzing}>
            {analyzing ? '분석 중...' : '영향 분석'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{BULK_ACTION_DESCRIPTION[action]}</p>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}
      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {result}
        </div>
      )}

      {/* ── 영향 분석 결과 ──────────────────────────────────────────── */}
      {plan && (
        <section className="bg-white border border-border rounded-2xl p-4 md:p-5 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="font-semibold">③ 영향 분석 — {BULK_ACTION_LABEL[plan.action]}</h2>
            <Button
              type="button"
              variant="destructive"
              disabled={plan.actionableIds.length === 0 || !!plan.references.error}
              onClick={() => setConfirmOpen(true)}
            >
              실행하기
            </Button>
          </div>

          {plan.references.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              영향 건수를 다 세지 못했어요. 부분 건수로는 실행할 수 없어요 — 잠시 뒤 다시 분석해주세요.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-xl bg-neutral-50 px-3 py-2">
              <div className="text-xs text-muted-foreground">조건에 맞는 배지</div>
              <div className="text-lg font-semibold tabular-nums">{plan.badgeIds.length}</div>
            </div>
            <div className="rounded-xl bg-neutral-50 px-3 py-2">
              <div className="text-xs text-muted-foreground">실제 처리 대상</div>
              <div className="text-lg font-semibold tabular-nums">{plan.actionableIds.length}</div>
            </div>
            <div className="rounded-xl bg-neutral-50 px-3 py-2">
              <div className="text-xs text-muted-foreground">건너뜀(이미 그 상태)</div>
              <div className="text-lg font-semibold tabular-nums">{plan.skipped.length}</div>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-2">
              <div className="text-xs text-amber-800">영향 건수</div>
              <div className="text-lg font-semibold tabular-nums text-amber-900">{plan.impactCount}</div>
            </div>
          </div>

          {/* 참조 내역 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">참조 내역</h3>
            {nonZeroSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">이 배지들을 가리키는 이력·콘텐츠가 없어요.</p>
            ) : (
              <div className="border border-border rounded-xl overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>구분</TableHead>
                      <TableHead>참조 자리</TableHead>
                      <TableHead>위치</TableHead>
                      <TableHead className="text-right">건수</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nonZeroSources.map((source) => (
                      <TableRow key={source.key}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {BADGE_REFERENCE_GROUP_LABEL[source.group]}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{source.label}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{source.location}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {plan.references.counts[source.key]}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* 참조 정리 */}
          {plan.references.rows.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">참조 정리</h3>
              <p className="text-xs text-muted-foreground">
                대상 배지를 가리키는 콘텐츠예요. 해제해도 카드·미션 자체는 지워지지 않고, 그 배지만
                빠져요.
              </p>
              <div className="border border-border rounded-xl overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>자리</TableHead>
                      <TableHead>대상</TableHead>
                      <TableHead className="text-right">참조 배지</TableHead>
                      <TableHead className="text-right">해제</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.references.rows.map((row) => {
                      const rowKey = `${row.sourceKey}:${row.rowId}`
                      return (
                        <TableRow key={rowKey}>
                          <TableCell className="whitespace-nowrap">
                            {BADGE_REFERENCE_SOURCE_BY_KEY.get(row.sourceKey)?.label ?? row.sourceKey}
                          </TableCell>
                          <TableCell>{row.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.badgeIds.length}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={detachingRow === rowKey || analyzing}
                              onClick={() =>
                                setPendingDetach({
                                  sourceKey: row.sourceKey,
                                  rowId: row.rowId,
                                  badgeIds: row.badgeIds,
                                  sourceLabel:
                                    BADGE_REFERENCE_SOURCE_BY_KEY.get(row.sourceKey)?.label ?? row.sourceKey,
                                  rowLabel: row.label,
                                })
                              }
                            >
                              {detachingRow === rowKey ? '해제 중...' : '해제'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* 대상 목록 미리보기 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              대상 배지 {plan.badgeIds.length > plan.preview.length && `(앞 ${plan.preview.length}건만 표시)`}
            </h3>
            <div className="border border-border rounded-xl overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>종류</TableHead>
                    <TableHead>자리</TableHead>
                    <TableHead>계열 키</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.preview.map((badge) => (
                    <TableRow key={badge.id}>
                      <TableCell>{badge.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{badgeTypeLabel(badge.type)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {badge.level != null ? `Lv.${badge.level}` : (badge.rarity ?? '—')}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {badge.family_key ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {badge.deleted_at ? (
                          <span className="rounded bg-neutral-100 px-1.5 py-px text-[11px] text-neutral-600">
                            폐기됨
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-50 px-1.5 py-px text-[11px] text-emerald-700">
                            활성
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}

      {/* ── 최근 실행 로그 ──────────────────────────────────────────── */}
      <section className="bg-white border border-border rounded-2xl p-4 md:p-5 space-y-3">
        <h2 className="font-semibold">최근 실행 로그</h2>
        {runsError ? (
          <p className="text-sm text-amber-700">
            실행 로그를 불러오지 못했어요. 마이그레이션 136(admin_badge_bulk_runs)이 아직 실행되지
            않았을 수 있어요 — {runsError}
          </p>
        ) : recentRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 실행 기록이 없어요.</p>
        ) : (
          <div className="border border-border rounded-xl overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시각</TableHead>
                  <TableHead>작업</TableHead>
                  <TableHead>실행자</TableHead>
                  <TableHead className="text-right">대상</TableHead>
                  <TableHead className="text-right">처리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(run.created_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{RUN_ACTION_LABEL[run.action] ?? run.action}</TableCell>
                    <TableCell className="text-muted-foreground">{run.admin_email ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{run.target_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{run.affected_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ── 2단계 확인 ─────────────────────────────────────────────── */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !executing) setConfirmOpen(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>{plan ? BULK_ACTION_LABEL[plan.action] : '일괄 작업'}</AlertDialogTitle>
            <AlertDialogDescription>
              {plan && (
                <>
                  배지 {plan.actionableIds.length}건을 처리하고, 이 배지들에 걸린 영향 {plan.impactCount}건이
                  함께 걸려 있어요. 계속하려면 아래 문구를 그대로 입력해주세요.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {plan && (
            <div className="space-y-2">
              <div className="rounded-lg bg-neutral-100 px-3 py-2 font-mono text-sm">{plan.requiredPhrase}</div>
              <Input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={plan.requiredPhrase}
                aria-label="확인 문구"
              />
            </div>
          )}
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={executing} onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={executing || !phraseMatches} onClick={execute}>
              {executing ? '실행 중...' : '실행'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 참조 해제 확인 ──────────────────────────────────────────── */}
      <AlertDialog
        open={pendingDetach !== null}
        onOpenChange={(open) => {
          if (!open && !detachingRow) setPendingDetach(null)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>참조 해제</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDetach && (
                <>
                  {pendingDetach.sourceLabel} 「{pendingDetach.rowLabel}」에서 배지{' '}
                  {pendingDetach.badgeIds.length}건을 빼요. 카드·미션 자체는 지워지지 않아요. 되돌리려면 해당
                  어드민 화면에서 배지를 다시 넣어야 해요.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={detachingRow !== null}
              onClick={() => setPendingDetach(null)}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={detachingRow !== null}
              onClick={() => {
                if (!pendingDetach) return
                const target = pendingDetach
                setPendingDetach(null)
                void detach(target.sourceKey, target.rowId, target.badgeIds)
              }}
            >
              해제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
