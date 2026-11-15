'use client'

/**
 * «배지 만들기» 탭: 배지 검색 → 선택 → 분류의 템플릿 위에 이름·값 미리보기 (티켓 20261116_0555).
 * 검색은 기존 POST /api/admin/activity-badge-image/search를 쓴다. 등록·색·글자 조정은 다음 회차.
 */
import { useState } from 'react'
import type { TemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import BadgePicker, { ALL_VALUE, type BadgeFilters, type StudioSearchBadge } from './BadgePicker'
import BadgePreview from './BadgePreview'

const SEARCH_FAIL = '배지를 검색하지 못했어요. 잠시 후 다시 시도해 주세요.'

export default function BadgeStudio({
  templates,
  onGoToTemplates,
}: {
  templates: TemplateItem[]
  onGoToTemplates: () => void
}) {
  const [filters, setFilters] = useState<BadgeFilters>({
    query: '',
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

  async function runSearch(nextPage: number) {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/admin/activity-badge-image/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: filters.query,
          // 레벨형에는 등급이 없다 — 종류 필터가 레벨형이면 등급 필터를 보내지 않는다.
          rarity: filters.rarity === ALL_VALUE || filters.kind === 'leveled' ? undefined : filters.rarity,
          activityType: filters.activity === ALL_VALUE ? undefined : filters.activity,
          kind: filters.kind === ALL_VALUE ? undefined : filters.kind,
          page: nextPage,
        }),
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
        onSelect={setSelected}
      />
      <BadgePreview badge={selected} templates={templates} onGoToTemplates={onGoToTemplates} />
    </div>
  )
}
