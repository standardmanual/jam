'use client'

/**
 * «배지 만들기» 탭: 배지 검색 → 선택 → 분류의 템플릿 위에 이름·값 미리보기 (티켓 20261116_0555).
 * 검색은 기존 POST /api/admin/activity-badge-image/search를 쓴다. 색·글자 조정은 20261116_0653, 등록은 20261116_0748, 메뉴 연결과 옛 화면 삭제는 20261116_0809.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import {
  DEFAULT_TEMPLATE_BADGE_PARAMS,
  type TemplateBadgeParams,
} from '@/lib/admin/activityBadgeTemplate/templateParams'
import type { TemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import BadgePicker, { ALL_VALUE, type BadgeFilters, type StudioSearchBadge } from './BadgePicker'
import BadgePreview from './BadgePreview'
import { BatchRegisterDialog, SingleRegisterDialog } from './RegisterDialogs'
import { registerTemplateBadge, summarizeBatch, type BatchEntry } from './registerTemplateBadge'

const FAMILY_FAIL = '같은 계열의 배지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
const SEARCH_FAIL = '배지를 검색하지 못했어요. 잠시 후 다시 시도해 주세요.'

/** 검색 요청 본문. «전체»로 둔 조건은 싣지 않는다 */
export function buildSearchBody(filters: BadgeFilters, page: number) {
  return {
    q: filters.query,
    // 레벨형에는 등급이 없다 — 종류 필터가 레벨형이면 등급 필터를 보내지 않는다.
    rarity: filters.rarity === ALL_VALUE || filters.kind === 'leveled' ? undefined : filters.rarity,
    activityType: filters.activity === ALL_VALUE ? undefined : filters.activity,
    kind: filters.kind === ALL_VALUE ? undefined : filters.kind,
    templateClass: filters.templateClass === ALL_VALUE ? undefined : filters.templateClass,
    page,
  }
}

export default function BadgeStudio({
  templates,
  onGoToTemplates,
}: {
  templates: TemplateItem[]
  onGoToTemplates: () => void
}) {
  const [filters, setFilters] = useState<BadgeFilters>({
    query: '',
    templateClass: ALL_VALUE,
    kind: ALL_VALUE,
    rarity: ALL_VALUE,
    activity: ALL_VALUE,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<StudioSearchBadge[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selected, setSelected] = useState<StudioSearchBadge | null>(null)
  // 다른 배지를 골라도 조정값은 그대로 둔다(같은 모양으로 이어서 볼 수 있게). 저장된 조정값이 있는 배지만 그 값으로 바꾼다.
  const [params, setParams] = useState<TemplateBadgeParams>(DEFAULT_TEMPLATE_BADGE_PARAMS)
  const [loadedNotice, setLoadedNotice] = useState(false)
  const [singleTarget, setSingleTarget] = useState<StudioSearchBadge | null>(null)
  const [batchTargets, setBatchTargets] = useState<StudioSearchBadge[] | null>(null)
  const [registering, setRegistering] = useState(false)
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null)
  const [failures, setFailures] = useState<{ name: string; error: string }[]>([])
  const busy = registering || progress !== null

  function handleSelect(b: StudioSearchBadge) {
    setSelected(b)
    setFailures([])
    if (b.templateParams) {
      setParams(b.templateParams)
      setLoadedNotice(true)
    } else {
      setLoadedNotice(false)
    }
  }

  function changeParams(next: TemplateBadgeParams) {
    setLoadedNotice(false)
    setParams(next)
  }

  function templateOf(b: StudioSearchBadge) {
    return b.templateClass ? templates.find((t) => t.classKey === b.templateClass) : undefined
  }

  function markRegistered(id: string, registered: TemplateBadgeParams) {
    const patch = { hasImage: true, templateParams: registered }
    setResults((prev) => prev && prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev))
  }

  async function registerOne(b: StudioSearchBadge) {
    const template = templateOf(b)
    if (!template) return
    setRegistering(true)
    setFailures([])
    try {
      const r = await registerTemplateBadge({ badge: b, template, params })
      if (r.ok) {
        markRegistered(b.id, params)
        toast.success(`${b.name} 배지 이미지를 등록했어요.`)
      } else {
        toast.error(r.error)
      }
    } finally {
      setRegistering(false)
    }
  }

  async function openFamilyDialog() {
    if (!selected?.familyKey) return
    setRegistering(true)
    try {
      const res = await fetch('/api/admin/activity-badge-image/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ familyKey: selected.familyKey, page: 1 }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(data?.badges)) throw new Error(FAMILY_FAIL)
      const targets = (data.badges as StudioSearchBadge[]).filter((b) => b.templateClass === selected.templateClass)
      if (targets.length === 0) toast.info('같은 계열에 등록할 배지가 없어요.')
      else setBatchTargets(targets)
    } catch {
      toast.error(FAMILY_FAIL)
    } finally {
      setRegistering(false)
    }
  }

  async function registerBatch(targets: StudioSearchBadge[]) {
    const template = selected ? templateOf(selected) : undefined
    if (!template) return
    setFailures([])
    const entries: BatchEntry[] = []
    // 동시에 보내지 않고 한 단계씩 차례로 보낸다.
    for (let i = 0; i < targets.length; i += 1) {
      setProgress({ index: i + 1, total: targets.length })
      const result = await registerTemplateBadge({ badge: targets[i], template, params })
      if (result.ok) markRegistered(targets[i].id, params)
      entries.push({ name: targets[i].name, result })
    }
    setProgress(null)
    const summary = summarizeBatch(entries)
    setFailures(summary.failed)
    toast.success(`${summary.total}개 가운데 ${summary.okCount}개를 등록했어요.`)
  }

  async function runSearch(nextPage: number) {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/admin/activity-badge-image/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSearchBody(filters, nextPage)),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? SEARCH_FAIL)
      setResults(data.badges)
      setPage(data.page ?? nextPage)
      setTotal(data.total ?? 0)
      setTotalPages(data.totalPages ?? 1)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : SEARCH_FAIL)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <BadgePicker
        filters={filters}
        onFiltersChange={setFilters}
        loading={loading}
        error={error}
        results={results}
        total={total}
        page={page}
        totalPages={totalPages}
        selectedId={selected?.id ?? null}
        onSearch={(p) => void runSearch(p)}
        onSelect={handleSelect}
        selectDisabled={busy}
      />
      <BadgePreview
        badge={selected}
        templates={templates}
        onGoToTemplates={onGoToTemplates}
        params={params}
        onParamsChange={changeParams}
        onParamsReset={() => changeParams(DEFAULT_TEMPLATE_BADGE_PARAMS)}
        busy={busy}
        progress={progress}
        failures={failures}
        loadedNotice={loadedNotice}
        onRegister={() => setSingleTarget(selected)}
        onRegisterFamily={() => void openFamilyDialog()}
      />
      <SingleRegisterDialog
        badge={singleTarget}
        onOpenChange={(open) => !open && setSingleTarget(null)}
        onConfirm={(b) => void registerOne(b)}
      />
      <BatchRegisterDialog
        badges={batchTargets}
        onOpenChange={(open) => !open && setBatchTargets(null)}
        onConfirm={(list) => void registerBatch(list)}
      />
    </div>
  )
}
