'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PoiRow, PoiCategory, BadgeRow } from '@/types/database'
import type { NaverSearchResult } from '@/lib/poi/naver'

const CATEGORIES: PoiCategory[] = ['mountain', 'bike_route', 'trail', 'park', 'other']

interface PoiFormProps {
  poi?: PoiRow
  badges: Pick<BadgeRow, 'id' | 'name'>[]
}

export default function PoiForm({ poi, badges }: PoiFormProps) {
  const router = useRouter()
  const isEdit = !!poi

  const [name, setName] = useState(poi?.name ?? '')
  const [latitude, setLatitude] = useState<string>(poi?.latitude.toString() ?? '')
  const [longitude, setLongitude] = useState<string>(poi?.longitude.toString() ?? '')
  const [radiusMeters, setRadiusMeters] = useState<string>(poi?.radius_meters.toString() ?? '50')
  const [category, setCategory] = useState<PoiCategory>(poi?.category ?? 'other')
  const [linkedBadgeId, setLinkedBadgeId] = useState<string>(poi?.linked_badge_id ?? '')

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
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!isEdit && (
        <div className="flex flex-col gap-2 bg-white/5 border border-white/10 rounded-xl p-4">
          <span className="text-sm text-white/60">네이버 장소 검색으로 채우기</span>
          <div className="flex gap-2">
            <input
              value={naverQuery}
              onChange={(e) => setNaverQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleNaverSearch() } }}
              placeholder="예: 뚝섬 한강공원"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
            />
            <button
              type="button"
              onClick={handleNaverSearch}
              disabled={naverSearching}
              className="bg-white/10 text-white px-4 py-2.5 rounded-xl hover:bg-white/20 disabled:opacity-50 transition-colors"
            >
              {naverSearching ? '검색 중...' : '검색'}
            </button>
          </div>
          {naverError && <p className="text-red-400 text-sm">{naverError}</p>}
          {naverResults.length > 0 && (
            <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {naverResults.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => handleSelectNaverResult(r)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <div className="text-white text-sm font-semibold">{r.name}</div>
                    <div className="text-white/40 text-xs">{r.address}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">POI 이름 *</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
          placeholder="예: 뚝섬 한강공원"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/60">위도 *</span>
          <input
            required
            type="number"
            step="any"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
            placeholder="37.5326"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/60">경도 *</span>
          <input
            required
            type="number"
            step="any"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
            placeholder="126.9903"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/60">반경 (미터) *</span>
          <input
            required
            type="number"
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/60">카테고리 *</span>
          <select
            required
            value={category}
            onChange={(e) => setCategory(e.target.value as PoiCategory)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-[#1a1a1a]">{c}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-white/60">연결 배지</span>
        <select
          value={linkedBadgeId}
          onChange={(e) => setLinkedBadgeId(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
        >
          <option value="" className="bg-[#1a1a1a]">— 없음 —</option>
          {badges.map((b) => (
            <option key={b.id} value={b.id} className="bg-[#1a1a1a]">{b.name}</option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-[#AEEA00] text-black font-bold px-6 py-2.5 rounded-xl hover:bg-[#c6ff00] disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : 'POI 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/poi')}
          className="text-white/50 hover:text-white px-4 py-2.5 rounded-xl hover:bg-white/5 transition-colors"
        >
          취소
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="ml-auto text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-2.5 rounded-xl transition-colors"
          >
            삭제
          </button>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">POI 삭제</h3>
            <p className="text-white/50 text-sm mb-5">
              &apos;{poi?.name}&apos;을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {loading ? '삭제 중...' : '삭제 확인'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-white/5 text-white py-2.5 rounded-xl hover:bg-white/10 transition-colors"
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
