'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BadgeRow, BadgeCondition, ActivityType, BadgeType, BadgeRarity, FactionRow, ItemBookRow } from '@/types/database'

const ACTIVITY_TYPES: ActivityType[] = ['cycling', 'running', 'hiking', 'walking']
const BADGE_TYPES: BadgeType[] = ['activity', 'item']
const RARITIES: BadgeRarity[] = ['common', 'rare', 'legendary', 'mythic']

interface BadgeFormProps {
  badge?: BadgeRow
  factions: Pick<FactionRow, 'id' | 'name'>[]
  itemBooks: Pick<ItemBookRow, 'id' | 'name'>[]
}

const EMPTY_CONDITION: BadgeCondition = {}

export default function BadgeForm({ badge, factions, itemBooks }: BadgeFormProps) {
  const router = useRouter()
  const isEdit = !!badge

  const [name, setName] = useState(badge?.name ?? '')
  const [description, setDescription] = useState(badge?.description ?? '')
  const [type, setType] = useState<BadgeType>(badge?.type ?? 'activity')
  const [rarity, setRarity] = useState<BadgeRarity>(badge?.rarity ?? 'common')
  const [imageUrl, setImageUrl] = useState(badge?.image_url ?? '')
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>(badge?.activity_types ?? [])
  const [patchAvailable, setPatchAvailable] = useState(badge?.patch_available ?? false)
  const [patchPriceKrw, setPatchPriceKrw] = useState<string>(
    badge?.patch_price_krw?.toString() ?? ''
  )

  // condition_json builder state
  const initCond = (badge?.condition_json as BadgeCondition) ?? EMPTY_CONDITION
  const [condDistanceKm, setCondDistanceKm] = useState<string>(initCond.distance_km?.toString() ?? '')
  const [condTotalCount, setCondTotalCount] = useState<string>(initCond.total_count?.toString() ?? '')
  const [condElevationM, setCondElevationM] = useState<string>(initCond.elevation_gain_m?.toString() ?? '')
  const [condMinSpeedKmh, setCondMinSpeedKmh] = useState<string>(initCond.min_speed_kmh?.toString() ?? '')
  const [condStreakDays, setCondStreakDays] = useState<string>(initCond.streak_days?.toString() ?? '')
  const [condActivityType, setCondActivityType] = useState<string>(initCond.activity_type ?? '')
  const [condPoiId, setCondPoiId] = useState<string>(initCond.poi_id ?? '')

  const [factionId, setFactionId] = useState(badge?.faction_id ?? '')
  const [itemBookId, setItemBookId] = useState(badge?.item_book_id ?? '')
  const [dropWeight, setDropWeight] = useState<string>(
    badge?.drop_weight?.toString() ?? '1.0'
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const buildConditionJson = (): BadgeCondition | null => {
    const cond: BadgeCondition = {}
    if (condDistanceKm) cond.distance_km = parseFloat(condDistanceKm)
    if (condTotalCount) cond.total_count = parseInt(condTotalCount, 10)
    if (condElevationM) cond.elevation_gain_m = parseFloat(condElevationM)
    if (condMinSpeedKmh) cond.min_speed_kmh = parseFloat(condMinSpeedKmh)
    if (condStreakDays) cond.streak_days = parseInt(condStreakDays, 10)
    if (condActivityType) cond.activity_type = condActivityType as ActivityType
    if (condPoiId) cond.poi_id = condPoiId
    return Object.keys(cond).length > 0 ? cond : null
  }

  const toggleActivityType = (t: ActivityType) => {
    setActivityTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const body = {
      name,
      description,
      type,
      rarity,
      image_url: imageUrl,
      activity_types: activityTypes,
      patch_available: patchAvailable,
      patch_price_krw: patchAvailable && patchPriceKrw ? parseInt(patchPriceKrw, 10) : null,
      condition_json: type === 'activity' ? buildConditionJson() : null,
      faction_id: factionId || null,
      item_book_id: itemBookId || null,
      drop_weight: type === 'item' ? parseFloat(dropWeight) : 1.0,
    }

    try {
      const res = await fetch(
        isEdit ? `/api/admin/badges/${badge.id}` : '/api/admin/badges',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      router.push('/admin/badges')
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
      const res = await fetch(`/api/admin/badges/${badge!.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      router.push('/admin/badges')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  const condPreview = buildConditionJson()

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-white/60">배지 이름 *</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
            placeholder="예: 한강 라이더"
          />
        </label>

        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-white/60">설명 *</span>
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50 resize-none"
            placeholder="배지 설명을 입력하세요"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/60">타입 *</span>
          <select
            required
            value={type}
            onChange={(e) => setType(e.target.value as BadgeType)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
          >
            {BADGE_TYPES.map((t) => (
              <option key={t} value={t} className="bg-[#1a1a1a]">{t}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/60">희귀도 *</span>
          <select
            required
            value={rarity}
            onChange={(e) => setRarity(e.target.value as BadgeRarity)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
          >
            {RARITIES.map((r) => (
              <option key={r} value={r} className="bg-[#1a1a1a]">{r}</option>
            ))}
          </select>
        </label>

        {/* 세계관 선택 */}
        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-white/60">소속 세계관</span>
          <select
            value={factionId}
            onChange={(e) => setFactionId(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
          >
            <option value="" className="bg-[#1a1a1a]">— 없음 —</option>
            {factions.map((f) => (
              <option key={f.id} value={f.id} className="bg-[#1a1a1a]">{f.name}</option>
            ))}
          </select>
        </label>

        {/* 소속 아이템북 */}
        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-white/60">소속 아이템북</span>
          <select
            value={itemBookId}
            onChange={(e) => setItemBookId(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
          >
            <option value="" className="bg-[#1a1a1a]">— 없음 —</option>
            {itemBooks.map((b) => (
              <option key={b.id} value={b.id} className="bg-[#1a1a1a]">{b.name}</option>
            ))}
          </select>
        </label>

        {/* drop_weight (아이템 배지 타입일 때만) */}
        {type === 'item' && (
          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="text-sm text-white/60">드랍 가중치 (0.1 ~ 10.0)</span>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              value={dropWeight}
              onChange={(e) => setDropWeight(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-white/60">이미지 URL *</span>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="미리보기"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <span className="text-white/20 text-xs">—</span>
              )}
            </div>
            <input
              required
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
              placeholder="https://... 또는 /badges/001.png"
            />
          </div>
        </label>
      </div>

      {/* 활동 종류 */}
      <div>
        <p className="text-sm text-white/60 mb-2">활동 종류 *</p>
        <div className="flex gap-3 flex-wrap">
          {ACTIVITY_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activityTypes.includes(t)}
                onChange={() => toggleActivityType(t)}
                className="accent-[#AEEA00]"
              />
              <span className="text-sm">{t}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 패치 설정 */}
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={patchAvailable}
            onChange={(e) => setPatchAvailable(e.target.checked)}
            className="accent-[#AEEA00]"
          />
          <span className="text-sm">패치 구매 가능</span>
        </label>
        {patchAvailable && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-white/60">패치 가격 (원)</span>
            <input
              type="number"
              value={patchPriceKrw}
              onChange={(e) => setPatchPriceKrw(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50 max-w-xs"
              placeholder="예: 9900"
            />
          </label>
        )}
      </div>

      {/* condition_json 빌더 (activity 타입만) */}
      {type === 'activity' && (
        <div className="border border-white/10 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-white/70">발급 조건 (condition_json)</p>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">최소 거리 (km)</span>
              <input
                type="number"
                step="0.1"
                value={condDistanceKm}
                onChange={(e) => setCondDistanceKm(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 30"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">누적 활동 횟수</span>
              <input
                type="number"
                value={condTotalCount}
                onChange={(e) => setCondTotalCount(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 10"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">고도 상승 누적 (m)</span>
              <input
                type="number"
                value={condElevationM}
                onChange={(e) => setCondElevationM(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 500"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">최소 속도 (km/h)</span>
              <input
                type="number"
                step="0.1"
                value={condMinSpeedKmh}
                onChange={(e) => setCondMinSpeedKmh(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 25"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">연속 활동 일수</span>
              <input
                type="number"
                value={condStreakDays}
                onChange={(e) => setCondStreakDays(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 7"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">활동 종류 (조건)</span>
              <select
                value={condActivityType}
                onChange={(e) => setCondActivityType(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
              >
                <option value="" className="bg-[#1a1a1a]">— 전체 —</option>
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-[#1a1a1a]">{t}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/50">POI ID</span>
            <input
              value={condPoiId}
              onChange={(e) => setCondPoiId(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
              placeholder="POI UUID"
            />
          </label>

          <div className="bg-black/30 rounded-xl p-3">
            <p className="text-xs text-white/40 mb-1.5">JSON 미리보기</p>
            <pre className="text-xs text-[#AEEA00]/80 font-mono overflow-x-auto">
              {condPreview ? JSON.stringify(condPreview, null, 2) : 'null (조건 없음)'}
            </pre>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-[#AEEA00] text-black font-bold px-6 py-2.5 rounded-xl hover:bg-[#c6ff00] disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '배지 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/badges')}
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
            <h3 className="text-lg font-bold mb-2">배지 삭제</h3>
            <p className="text-white/50 text-sm mb-5">
              &apos;{badge?.name}&apos; 배지를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
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
