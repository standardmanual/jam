'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PoiRow, PoiCategory, PoiCategoryRow } from '@/types/database'
import type { NaverSearchResult } from '@/lib/poi/naver'
import BadgeSearchSelect from '@/components/admin/BadgeSearchSelect'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Switch } from '@/components/admin/ui/switch'

interface PoiFormProps {
  poi?: PoiRow
  /** 수정 화면 진입 시 연결 배지 콤보박스에 처음 보여줄 이름 */
  linkedBadgeLabel?: string
  categories: PoiCategoryRow[]
}

export default function PoiForm({ poi, linkedBadgeLabel, categories }: PoiFormProps) {
  const router = useRouter()
  const isEdit = !!poi

  // Select 드롭다운(Radix Portal)은 기본적으로 document.body에 렌더링되는데, shadcn 어드민
  // 테마 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다 (4단계a `BadgeForm.tsx`와 동일 패턴, 20260826_018).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const [name, setName] = useState(poi?.name ?? '')
  const [latitude, setLatitude] = useState<string>(poi?.latitude.toString() ?? '')
  const [longitude, setLongitude] = useState<string>(poi?.longitude.toString() ?? '')
  const [radiusMeters, setRadiusMeters] = useState<string>(poi?.radius_meters.toString() ?? '50')
  const [category, setCategory] = useState<PoiCategory>(poi?.category ?? categories[0]?.slug ?? 'other')
  const [linkedBadgeId, setLinkedBadgeId] = useState<string>(poi?.linked_badge_id ?? '')
  const [isActive, setIsActive] = useState<boolean>(poi?.is_active ?? true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [naverQuery, setNaverQuery] = useState('')
  const [naverResults, setNaverResults] = useState<NaverSearchResult[]>([])
  const [naverSearching, setNaverSearching] = useState(false)
  const [naverError, setNaverError] = useState<string | null>(null)

  const handleNaverSearch = async () => {
    if (!naverQuery.trim()) return
    setNaverSearching(true)
    setNaverError(null)
    try {
      const res = await fetch(`/api/admin/poi/naver-search?query=${encodeURIComponent(naverQuery)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '검색 실패')
      setNaverResults(data.results)
    } catch (err) {
      setNaverError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다.')
    } finally {
      setNaverSearching(false)
    }
  }

  const handleSelectNaverResult = (result: NaverSearchResult) => {
    setName(result.name)
    setLatitude(result.latitude.toString())
    setLongitude(result.longitude.toString())
    setNaverResults([])
    setNaverQuery('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const body = {
      name,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      radius_meters: parseInt(radiusMeters, 10),
      category,
      linked_badge_id: linkedBadgeId || null,
      is_active: isActive,
    }

    try {
      const res = await fetch(
        isEdit ? `/api/admin/poi/${poi.id}` : '/api/admin/poi',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      router.push('/admin/poi')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/poi/${poi!.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      router.push('/admin/poi')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
          {error}
        </div>
      )}

      {!isEdit && (
        <div className="flex flex-col gap-2 bg-white border border-border rounded-xl p-4">
          <span className="text-sm text-foreground">네이버 장소 검색으로 채우기</span>
          <div className="flex gap-2">
            <input
              value={naverQuery}
              onChange={(e) => setNaverQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleNaverSearch() } }}
              placeholder="예: 뚝섬 한강공원"
              className="flex-1 bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
            <button
              type="button"
              onClick={handleNaverSearch}
              disabled={naverSearching}
              className="bg-muted text-foreground px-4 py-2.5 rounded-xl hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {naverSearching ? '검색 중...' : '검색'}
            </button>
          </div>
          {naverError && <p className="text-red-600 text-sm">{naverError}</p>}
          {naverResults.length > 0 && (
            <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {naverResults.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => handleSelectNaverResult(r)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="text-foreground text-sm font-semibold">{r.name}</div>
                    <div className="text-muted-foreground text-xs">{r.address}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">POI 이름 *</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          placeholder="예: 뚝섬 한강공원"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">위도 *</span>
          <input
            required
            type="number"
            step="any"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            placeholder="37.5326"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">경도 *</span>
          <input
            required
            type="number"
            step="any"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            placeholder="126.9903"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">반경 (미터) *</span>
          <input
            required
            type="number"
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(e.target.value)}
            className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">카테고리 *</span>
          <Select value={category} onValueChange={(v) => setCategory(v as PoiCategory)}>
            <SelectTrigger aria-label="카테고리">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={themeContainer ?? undefined}>
              {categories.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>{c.label} ({c.slug})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground">연결 배지</span>
        <BadgeSearchSelect
          key={poi?.id ?? 'new'}
          value={linkedBadgeId}
          initialLabel={linkedBadgeLabel}
          placeholder="배지 이름 검색..."
          onChange={(id) => setLinkedBadgeId(id)}
        />
      </label>

      <label className="flex items-center gap-3 cursor-pointer">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        <span className="text-sm">활성화</span>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : 'POI 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/poi')}
          className="text-muted-foreground hover:text-foreground px-4 py-2.5 rounded-xl hover:bg-muted transition-colors"
        >
          취소
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="ml-auto text-red-600 hover:text-red-700 hover:bg-red-50 px-4 py-2.5 rounded-xl transition-colors"
          >
            삭제
          </button>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white border border-border rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">POI 삭제</h3>
            <p className="text-muted-foreground text-sm mb-5">
              &apos;{poi?.name}&apos;을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '삭제 중...' : '삭제 확인'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-white text-foreground py-2.5 rounded-xl hover:bg-muted transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
