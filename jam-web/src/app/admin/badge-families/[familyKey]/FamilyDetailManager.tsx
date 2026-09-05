'use client'

/**
 * 계열 상세 — 한 화면에서 계열 전체를 다룬다 (티켓 20260905_0032 B-1 · B-3)
 *
 * 네 가지 동작이 한 화면에 있다.
 *   ① 인라인 편집 — Lv.1~N(또는 Common~Mystic)을 표에서 바로 고치고 한 번에 저장
 *   ② 레벨 추가 — 조건 축·이미지·설명을 상속해 다음 자리를 만든다(등차·등비·수동)
 *   ③ 일괄 재계산 — 임계값 공식을 바꿔 계열 전체를 다시 계산한다.
 *      **변경 전후를 확인한 뒤에만 커밋한다** — 확인 단계는 서버가 강제한다(확인 토큰).
 *   ④ 계열 키 발급 — 키가 없는 배지에만. **이미 있는 키는 바꾸지 않는다**(티켓 판단 ③)
 *
 * 저장은 전부 기존 배지 API를 그대로 쓴다(`POST/PUT /api/admin/badges`) — 저장 시점 검증
 * 3종(A묶음)과 계열 정합성 트리거를 이 화면만 우회하는 경로를 만들지 않기 위해서다.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table'
import {
  LEVEL_STEP_RULES,
  LEVEL_STEP_RULE_LABEL,
  buildNextLevelDraft,
  numericAxisKeysOf,
  slotLabelOf,
  type BadgeFamily,
  type LevelStepRule,
  type RecalculationPlan,
} from '@/lib/admin/badge-families'
import { getConditionField, type ConditionKey } from '@/lib/badge-engine/conditionRegistry'
import type { BadgeCondition } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'

interface RowDraft {
  name: string
  description: string
  imageUrl: string
  /** 축 키 → 입력 문자열. 그 배지에 없는 축은 키 자체가 없다 */
  axes: Record<string, string>
}

function makeRows(family: BadgeFamily): Record<string, RowDraft> {
  const rows: Record<string, RowDraft> = {}
  for (const variant of family.variants) {
    const axes: Record<string, string> = {}
    for (const key of numericAxisKeysOf(variant.condition_json)) {
      axes[key] = String(variant.condition_json![key])
    }
    rows[variant.id] = {
      name: variant.name,
      description: variant.description ?? '',
      imageUrl: variant.image_url ?? '',
      axes,
    }
  }
  return rows
}

function axisLabel(key: ConditionKey): string {
  const meta = getConditionField(key)
  if (!meta) return key
  return meta.unit ? `${meta.label} (${meta.unit})` : meta.label
}

export default function FamilyDetailManager({
  family,
  proposedKey,
}: {
  family: BadgeFamily
  proposedKey: string | null
}) {
  const router = useRouter()

  // Radix Select 포털은 기본이 document.body인데 어드민 테마 실값은 [data-admin-theme]
  // 스코프 안에만 있다 — BadgeForm과 같은 처리(20260826_016).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const initialRows = useMemo(() => makeRows(family), [family])
  const [rows, setRows] = useState<Record<string, RowDraft>>(initialRows)
  // 저장·자리 추가 뒤 `router.refresh()`가 서버에서 계열을 다시 받아 온다. 그때 편집 state를
  // 그대로 두면 **새로 생긴 자리의 행이 state에 없어 화면이 깨진다.** 새 데이터가 오면
  // 편집 state를 그 값으로 맞춘다(React 공식 「렌더 중 state 조정」 패턴).
  const [syncedFrom, setSyncedFrom] = useState(initialRows)
  if (syncedFrom !== initialRows) {
    setSyncedFrom(initialRows)
    setRows(initialRows)
  }
  const [savingRows, setSavingRows] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const [rowNotice, setRowNotice] = useState<string | null>(null)

  /** 계열이 쓰는 수치 축(합집합) — 표의 열이 된다 */
  const axisKeys = useMemo(() => {
    const keys = new Set<ConditionKey>()
    for (const variant of family.variants) {
      for (const key of numericAxisKeysOf(variant.condition_json)) keys.add(key)
    }
    return [...keys]
  }, [family])

  /** state가 아직 새 데이터를 따라오지 못한 렌더에서도 안전하게 읽는다 */
  const rowOf = (id: string): RowDraft => rows[id] ?? initialRows[id]

  const dirtyIds = family.variants
    .filter((v) => JSON.stringify(rowOf(v.id)) !== JSON.stringify(initialRows[v.id]))
    .map((v) => v.id)

  const setRowField = (id: string, patch: Partial<RowDraft>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const setRowAxis = (id: string, key: string, value: string) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], axes: { ...prev[id].axes, [key]: value } } }))

  const handleSaveRows = async () => {
    setRowError(null)
    setRowNotice(null)
    setSavingRows(true)
    try {
      let saved = 0
      for (const id of dirtyIds) {
        const variant = family.variants.find((v) => v.id === id)!
        const draft = rowOf(id)
        const condition: BadgeCondition = { ...(variant.condition_json ?? {}) }
        for (const [key, raw] of Object.entries(draft.axes)) {
          const value = Number(raw)
          if (raw.trim() === '' || !Number.isFinite(value)) {
            // 값을 지우면 계열 안 측정 필드 조합이 달라져 정합성 트리거가 EXCEPTION을 낸다.
            throw new Error(`${slotLabelOf(variant)}의 ${axisLabel(key as ConditionKey)} 값을 숫자로 입력해주세요.`)
          }
          ;(condition as Record<string, unknown>)[key] = value
        }
        const res = await fetch(`/api/admin/badges/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name,
            description: draft.description,
            image_url: draft.imageUrl || null,
            condition_json: condition,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(`${slotLabelOf(variant)}: ${data.error ?? '저장 실패'}`)
        saved += 1
      }
      setRowNotice(`${saved}개 배지를 저장했어요.`)
      router.refresh()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : '저장 중 오류가 발생했어요.')
    } finally {
      setSavingRows(false)
    }
  }

  // ── 계열 키 발급 ────────────────────────────────────────────────────────
  const keylessIds = family.variants.filter((v) => !v.family_key).map((v) => v.id)
  const [issuing, setIssuing] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)

  const handleIssueKey = async () => {
    if (!proposedKey) return
    setIssueError(null)
    setIssuing(true)
    try {
      const res = await fetch('/api/admin/badge-families/family-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badge_ids: keylessIds, family_key: proposedKey }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발급 실패')
      if (data.skipped?.length > 0) setIssueError(data.skipped[0].reason)
      router.refresh()
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : '발급 중 오류가 발생했어요.')
    } finally {
      setIssuing(false)
    }
  }

  // ── 레벨(자리) 추가 ─────────────────────────────────────────────────────
  const [addRule, setAddRule] = useState<LevelStepRule>('arithmetic')
  const [addAmount, setAddAmount] = useState('')
  const draft = useMemo(
    () =>
      buildNextLevelDraft(family, {
        rule: addRule,
        amount: addAmount.trim() === '' ? undefined : Number(addAmount),
      }),
    [family, addRule, addAmount]
  )
  const [draftOverrides, setDraftOverrides] = useState<{
    name?: string
    description?: string
    imageUrl?: string
    axes: Record<string, string>
  }>({ axes: {} })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const handleCreateLevel = async () => {
    if (!draft) return
    setCreateError(null)
    setCreating(true)
    try {
      const condition: BadgeCondition = { ...draft.condition_json }
      for (const axis of draft.axes) {
        const override = draftOverrides.axes[axis.key]
        const value = override === undefined || override.trim() === '' ? axis.after : Number(override)
        if (!Number.isFinite(value)) throw new Error(`${axisLabel(axis.key)} 값을 숫자로 입력해주세요.`)
        ;(condition as Record<string, unknown>)[axis.key] = value
      }
      const res = await fetch('/api/admin/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftOverrides.name ?? draft.name,
          description: draftOverrides.description ?? draft.description,
          type: 'activity',
          rarity: draft.rarity,
          level: draft.level,
          family_key: draft.family_key,
          sort_order: draft.sort_order,
          image_url: draftOverrides.imageUrl ?? draft.image_url ?? '',
          activity_types: draft.activity_types,
          condition_json: condition,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '생성 실패')
      setDraftOverrides({ axes: {} })
      router.refresh()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '생성 중 오류가 발생했어요.')
    } finally {
      setCreating(false)
    }
  }

  // ── 일괄 재계산 ─────────────────────────────────────────────────────────
  const [recalcAxis, setRecalcAxis] = useState<ConditionKey | ''>(axisKeys[0] ?? '')
  const [recalcRule, setRecalcRule] = useState<LevelStepRule>('arithmetic')
  const [recalcBase, setRecalcBase] = useState('')
  const [recalcAmount, setRecalcAmount] = useState('')
  const [manualValues, setManualValues] = useState<string[]>(() => family.variants.map(() => ''))
  const [plan, setPlan] = useState<RecalculationPlan | null>(null)
  const [recalcBusy, setRecalcBusy] = useState(false)
  const [recalcError, setRecalcError] = useState<string | null>(null)
  const [recalcNotice, setRecalcNotice] = useState<string | null>(null)

  const callRecalculate = async (confirmToken?: string) => {
    setRecalcError(null)
    setRecalcNotice(null)
    setRecalcBusy(true)
    try {
      const res = await fetch('/api/admin/badge-families/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family_key: family.key,
          axis: recalcAxis,
          rule: recalcRule,
          base: Number(recalcBase || 0),
          amount: Number(recalcAmount || 0),
          manual_values: recalcRule === 'manual' ? manualValues.map((v) => (v.trim() === '' ? null : Number(v))) : undefined,
          ...(confirmToken ? { confirm_token: confirmToken } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPlan(data.plan ?? null)
        throw new Error(data.error ?? '재계산 실패')
      }
      if (confirmToken) {
        setPlan(null)
        setRecalcNotice(`${data.applied?.length ?? 0}개 배지에 적용했어요.`)
        router.refresh()
      } else {
        setPlan(data.plan)
      }
    } catch (err) {
      setRecalcError(err instanceof Error ? err.message : '재계산 중 오류가 발생했어요.')
    } finally {
      setRecalcBusy(false)
    }
  }

  const ruleSelect = (value: LevelStepRule, onChange: (v: LevelStepRule) => void, label: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v as LevelStepRule)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={themeContainer ?? undefined}>
          {LEVEL_STEP_RULES.map((r) => (
            <SelectItem key={r} value={r}>
              {LEVEL_STEP_RULE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )

  return (
    <div className="flex flex-col gap-6">
      {/* 계열 요약 · 계열 키 */}
      <section className="bg-white border border-border rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-muted-foreground">종목</span>{' '}
            {family.activityType ? ACTIVITY_TYPE_LABELS[family.activityType] ?? family.activityType : '—'}
          </span>
          <span>
            <span className="text-muted-foreground">종류</span>{' '}
            {family.kind === 'leveled' ? '레벨형' : family.kind === 'graded' ? '등급형' : '혼재'}
          </span>
          <span>
            <span className="text-muted-foreground">최고 자리</span> {family.topLabel}
          </span>
          <span>
            <span className="text-muted-foreground">자리 수</span> {family.variants.length}
          </span>
          <span>
            <span className="text-muted-foreground">이미지</span> {family.withImage}/{family.variants.length}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">계열 키 (family_key)</span>
          {family.familyKey ? (
            <>
              <Input value={family.familyKey} readOnly disabled className="font-mono" />
              <span className="text-xs text-muted-foreground">
                2단 교차 게이트가 이 키로 계열을 가리켜요. 배지 이름을 바꿔도 키는 그대로 두므로 여기서는 고칠 수 없어요.
              </span>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={proposedKey ?? ''} readOnly disabled className="font-mono max-w-md" />
                <Button onClick={handleIssueKey} disabled={issuing || !proposedKey}>
                  {issuing ? '발급 중...' : '계열 키 발급'}
                </Button>
              </div>
              <span className="text-xs text-amber-700">
                이 계열에는 아직 계열 키가 없어요. 키가 없으면 배지 이름으로만 묶여 2단 교차 게이트의 대상이 될 수 없어요.
                발급한 키는 나중에 바꿀 수 없어요.
              </span>
            </>
          )}
          {issueError && <p className="text-sm text-red-600">{issueError}</p>}
        </div>

        {family.kind === 'mixed' && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            이 계열에 등급형과 레벨형이 섞여 있어요. 다음 자리를 어느 쪽으로 만들지 판단할 수 없어 레벨 추가를 쓸 수 없어요.
          </div>
        )}

        {family.pendingKeys.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            아직 평가되지 않는 조건 필드가 있어요 —{' '}
            {family.pendingKeys.map((k) => `${getConditionField(k)?.label ?? k}(${k})`).join(', ')}. 저장은 되지만
            평가가 열릴 때까지 이 배지들은 발급되지 않아요.
          </div>
        )}
      </section>

      {/* 인라인 편집 */}
      <section className="bg-white border border-border rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-bold">계열 구성</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              값을 고친 뒤 「변경사항 저장」을 누르면 고친 배지만 저장돼요. 계열 키는 여기서 바꿀 수 없어요.
            </p>
          </div>
          <Button onClick={handleSaveRows} disabled={savingRows || dirtyIds.length === 0}>
            {savingRows ? '저장 중...' : `변경사항 저장${dirtyIds.length > 0 ? ` (${dirtyIds.length})` : ''}`}
          </Button>
        </div>
        {(rowError || rowNotice) && (
          <div className="px-5 py-2 text-sm">
            {rowError && <p className="text-red-600">{rowError}</p>}
            {rowNotice && <p className="text-muted-foreground">{rowNotice}</p>}
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">자리</TableHead>
                <TableHead className="min-w-[160px]">이름</TableHead>
                <TableHead className="min-w-[220px]">설명</TableHead>
                {axisKeys.map((key) => (
                  <TableHead key={key} className="whitespace-nowrap">
                    {axisLabel(key)}
                  </TableHead>
                ))}
                <TableHead className="min-w-[200px]">이미지 URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {family.variants.map((variant) => {
                const draftRow = rowOf(variant.id)
                return (
                  <TableRow key={variant.id}>
                    <TableCell className="whitespace-nowrap font-medium">{slotLabelOf(variant)}</TableCell>
                    <TableCell>
                      <Input
                        value={draftRow.name}
                        onChange={(e) => setRowField(variant.id, { name: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draftRow.description}
                        onChange={(e) => setRowField(variant.id, { description: e.target.value })}
                      />
                    </TableCell>
                    {axisKeys.map((key) => (
                      <TableCell key={key}>
                        {draftRow.axes[key] === undefined ? (
                          // 없는 축을 새로 넣으면 계열 안 측정 필드 조합이 달라져
                          // 정합성 트리거가 계열 전체 저장을 막는다(마이그레이션 128/134).
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Input
                            type="number"
                            step={getConditionField(key)?.step ?? 'any'}
                            value={draftRow.axes[key]}
                            onChange={(e) => setRowAxis(variant.id, key, e.target.value)}
                            className="w-28"
                          />
                        )}
                      </TableCell>
                    ))}
                    <TableCell>
                      <Input
                        value={draftRow.imageUrl}
                        onChange={(e) => setRowField(variant.id, { imageUrl: e.target.value })}
                        placeholder="https://..."
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* 레벨(자리) 추가 */}
      <section className="bg-white border border-border rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="font-bold">자리 추가</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            가장 높은 자리의 조건 축·이미지·설명을 물려받아 다음 자리를 만들어요. 증가 폭을 비워 두면 직전 두 자리에서
            유추해요.
          </p>
        </div>

        {!draft ? (
          <p className="text-sm text-muted-foreground">
            이 계열에는 자리를 더 만들 수 없어요. (Mystic까지 채워졌거나 등급형·레벨형이 섞여 있어요)
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ruleSelect(addRule, setAddRule, '증가 규칙')}
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">
                  {addRule === 'geometric' ? '배율' : '증가량'}
                </span>
                <Input
                  type="number"
                  step="any"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  placeholder={draft.inferred ? '비우면 직전 두 자리에서 유추' : '예: 10'}
                  disabled={addRule === 'manual'}
                />
              </label>
              <div className="flex items-end">
                <Button onClick={handleCreateLevel} disabled={creating}>
                  {creating ? '만드는 중...' : `${draft.slot.label} 만들기`}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">이름</span>
                <Input
                  value={draftOverrides.name ?? draft.name}
                  onChange={(e) => setDraftOverrides((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">이미지 URL</span>
                <Input
                  value={draftOverrides.imageUrl ?? draft.image_url ?? ''}
                  onChange={(e) => setDraftOverrides((p) => ({ ...p, imageUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </label>
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-sm text-foreground">설명</span>
                <Input
                  value={draftOverrides.description ?? draft.description}
                  onChange={(e) => setDraftOverrides((p) => ({ ...p, description: e.target.value }))}
                />
              </label>
            </div>

            {draft.axes.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>상속한 조건 축</TableHead>
                      <TableHead className="text-right">{family.topLabel}</TableHead>
                      <TableHead className="text-right">{draft.slot.label}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draft.axes.map((axis) => (
                      <TableRow key={axis.key}>
                        <TableCell>{axisLabel(axis.key)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{axis.before}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="any"
                            value={draftOverrides.axes[axis.key] ?? String(axis.after)}
                            onChange={(e) =>
                              setDraftOverrides((p) => ({ ...p, axes: { ...p.axes, [axis.key]: e.target.value } }))
                            }
                            className="w-28 ml-auto"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {!draft.family_key && (
              <p className="text-xs text-amber-700">
                계열 키가 없어 새 배지도 키 없이 만들어져요. 먼저 위에서 계열 키를 발급하면 새 자리도 같은 계열로 묶여요.
              </p>
            )}
            {createError && <p className="text-sm text-red-600">{createError}</p>}
          </>
        )}
      </section>

      {/* 일괄 재계산 */}
      <section className="bg-white border border-border rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="font-bold">일괄 재계산</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            지표 하나의 임계값 공식을 바꿔 계열 전체를 다시 계산해요. <strong>변경 전후를 확인한 뒤에만 적용돼요.</strong>
          </p>
        </div>

        {axisKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">이 계열에는 다시 계산할 수치 지표가 없어요.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">지표</span>
                <Select value={recalcAxis} onValueChange={(v) => { setRecalcAxis(v as ConditionKey); setPlan(null) }}>
                  <SelectTrigger aria-label="지표">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent container={themeContainer ?? undefined}>
                    {axisKeys.map((key) => (
                      <SelectItem key={key} value={key}>
                        {axisLabel(key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              {ruleSelect(recalcRule, (v) => { setRecalcRule(v); setPlan(null) }, '증가 규칙')}
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">첫 자리 값</span>
                <Input
                  type="number"
                  step="any"
                  value={recalcBase}
                  onChange={(e) => { setRecalcBase(e.target.value); setPlan(null) }}
                  disabled={recalcRule === 'manual'}
                  placeholder="예: 10"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">{recalcRule === 'geometric' ? '배율' : '증가량'}</span>
                <Input
                  type="number"
                  step="any"
                  value={recalcAmount}
                  onChange={(e) => { setRecalcAmount(e.target.value); setPlan(null) }}
                  disabled={recalcRule === 'manual'}
                  placeholder={recalcRule === 'geometric' ? '예: 2' : '예: 10'}
                />
              </label>
            </div>

            {recalcRule === 'manual' && (
              <div className="flex flex-wrap gap-3">
                {family.variants.map((variant, index) => (
                  <label key={variant.id} className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{slotLabelOf(variant)}</span>
                    <Input
                      type="number"
                      step="any"
                      value={manualValues[index] ?? ''}
                      onChange={(e) => {
                        const next = [...manualValues]
                        next[index] = e.target.value
                        setManualValues(next)
                        setPlan(null)
                      }}
                      placeholder="비우면 그대로"
                      className="w-28"
                    />
                  </label>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => callRecalculate()} disabled={recalcBusy}>
                {recalcBusy && !plan ? '계산 중...' : '변경 전후 확인'}
              </Button>
              {plan && (
                <>
                  <Button onClick={() => callRecalculate(plan.token)} disabled={recalcBusy}>
                    {recalcBusy ? '적용 중...' : '이대로 적용'}
                  </Button>
                  <Button variant="ghost" onClick={() => setPlan(null)} disabled={recalcBusy}>
                    취소
                  </Button>
                </>
              )}
            </div>

            {recalcError && <p className="text-sm text-red-600">{recalcError}</p>}
            {recalcNotice && <p className="text-sm text-muted-foreground">{recalcNotice}</p>}

            {plan && (
              <div className="rounded-xl border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>자리</TableHead>
                      <TableHead className="text-right">지금 ({plan.axisLabel})</TableHead>
                      <TableHead className="text-right">바꾼 뒤</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.changes.map((change) => (
                      <TableRow key={change.badgeId} className={change.changed ? '' : 'text-muted-foreground'}>
                        <TableCell className="whitespace-nowrap">{change.slotLabel}</TableCell>
                        <TableCell className="text-right tabular-nums">{change.before}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {change.changed ? change.after : '그대로'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {plan.skipped.length > 0 && (
                  <div className="px-4 py-3 text-xs text-amber-800 bg-amber-50 border-t border-border">
                    건너뛴 배지 —{' '}
                    {plan.skipped.map((s) => `${s.slotLabel}(${s.reason})`).join(' / ')}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
