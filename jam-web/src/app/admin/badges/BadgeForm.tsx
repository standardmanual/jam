'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BadgeRow, BadgeCondition, ActivityType, BadgeType, BadgeRarity, FactionRow, ItemBookRow } from '@/types/database'

const ACTIVITY_TYPES: ActivityType[] = ['cycling', 'running', 'road_running', 'trail_running', 'hiking', 'walking']
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
  const [condDurationMinutes, setCondDurationMinutes] = useState<string>(initCond.duration_minutes?.toString() ?? '')
  const [condWeekendDurationHours, setCondWeekendDurationHours] = useState<string>(initCond.weekend_duration_hours?.toString() ?? '')
  const [condWeeklyCount, setCondWeeklyCount] = useState<string>(initCond.weekly_count?.toString() ?? '')
  const [condMonth, setCondMonth] = useState<string>(initCond.month?.toString() ?? '')
  const [condMonthlyKm, setCondMonthlyKm] = useState<string>(initCond.monthly_km?.toString() ?? '')
  const [condSeasonCount, setCondSeasonCount] = useState<string>(initCond.season_count?.toString() ?? '')
  const [condSeason, setCondSeason] = useState<string>(initCond.season ?? '')
  const [condTempMinC, setCondTempMinC] = useState<string>(initCond.temperature_min_c?.toString() ?? '')
  const [condTempMaxC, setCondTempMaxC] = useState<string>(initCond.temperature_max_c?.toString() ?? '')
  const [condTimeStart, setCondTimeStart] = useState<string>(initCond.time_range?.start ?? '')
  const [condTimeEnd, setCondTimeEnd] = useState<string>(initCond.time_range?.end ?? '')

  const [condPrerequisiteNames, setCondPrerequisiteNames] = useState<string>(
    (initCond.prerequisite_badge_names ?? []).join(', ')
  )

  const [factionId, setFactionId] = useState(badge?.faction_id ?? '')
  const [itemBookId, setItemBookId] = useState(badge?.item_book_id ?? '')
  const [dropWeight, setDropWeight] = useState<string>(
    badge?.drop_weight?.toString() ?? '1.0'
  )
  const toDateInput = (iso: string | null | undefined) =>
    iso ? iso.slice(0, 10) : ''
  const [validFrom, setValidFrom] = useState<string>(toDateInput(badge?.valid_from))
  const [validUntil, setValidUntil] = useState<string>(toDateInput(badge?.valid_until))

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
    if (condDurationMinutes) cond.duration_minutes = parseInt(condDurationMinutes, 10)
    if (condWeekendDurationHours) cond.weekend_duration_hours = parseFloat(condWeekendDurationHours)
    if (condWeeklyCount) cond.weekly_count = parseInt(condWeeklyCount, 10)
    if (condMonth) cond.month = parseInt(condMonth, 10)
    if (condMonthlyKm) cond.monthly_km = parseFloat(condMonthlyKm)
    if (condSeasonCount) cond.season_count = parseInt(condSeasonCount, 10)
    if (condSeason) cond.season = condSeason as BadgeCondition['season']
    if (condTempMinC) cond.temperature_min_c = parseFloat(condTempMinC)
    if (condTempMaxC) cond.temperature_max_c = parseFloat(condTempMaxC)
    if (condTimeStart && condTimeEnd) cond.time_range = { start: condTimeStart, end: condTimeEnd }
    const prereqs = condPrerequisiteNames
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (prereqs.length > 0) cond.prerequisite_badge_names = prereqs
    return Object.keys(cond).length > 0 ? cond : null
  }

  const toggleActivityType = (t: ActivityType) => {
    setActivityTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }

  const validateCondition = (cond: BadgeCondition | null): string | null => {
    if (!cond) return null
    // 계절 조건은 season_count 와 짝을 이뤄야 함
    if (cond.season && cond.season !== 'all' && !cond.season_count) {
      return '계절(season)을 설정하면 계절 활동 횟수(season_count)도 입력해야 합니다.'
    }
    if (cond.season_count && !cond.season) {
      return '계절 활동 횟수(season_count)를 설정하면 계절(season)도 선택해야 합니다.'
    }
    // time_range 는 start/end 둘 다, HH:MM 형식이어야 함
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/
    if (condTimeStart || condTimeEnd) {
      if (!condTimeStart || !condTimeEnd) {
        return '시간대 조건은 시작·종료 시각을 모두 입력해야 합니다.'
      }
      if (!hhmm.test(condTimeStart) || !hhmm.test(condTimeEnd)) {
        return '시간대 조건의 시각은 HH:MM 형식이어야 합니다. (예: 05:30)'
      }
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const conditionJson = buildConditionJson()
    const condError = validateCondition(conditionJson)
    if (condError) {
      setError(condError)
      return
    }

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
      condition_json: conditionJson,
      faction_id: factionId || null,
      item_book_id: itemBookId || null,
      drop_weight: type === 'item' ? parseFloat(dropWeight) : 1.0,
      valid_from: validFrom ? new Date(validFrom).toISOString() : null,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
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

        {/* 아이템 배지 전용 설정 */}
        {type === 'item' && (
          <>
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

          </>
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

      {/* condition_json 빌더 (activity + item 공통) */}
      {(
        <div className="border border-white/10 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-white/70">
            {type === 'item' ? '드랍 조건 (condition_json)' : '발급 조건 (condition_json)'}
          </p>
          {type === 'item' && (
            <p className="text-xs text-white/40">조건을 설정하면 해당 조건을 충족한 유저에게만 이 배지가 드랍 풀에 포함됩니다. 설정하지 않으면 모든 유저에게 드랍 가능.</p>
          )}

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

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">단일 활동 최소 이동 시간 (분)</span>
              <input
                type="number"
                value={condDurationMinutes}
                onChange={(e) => setCondDurationMinutes(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">주말 활동 최소 이동 시간 (시간)</span>
              <input
                type="number"
                step="0.5"
                value={condWeekendDurationHours}
                onChange={(e) => setCondWeekendDurationHours(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 2"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">한 주 내 최소 활동 횟수</span>
              <input
                type="number"
                value={condWeeklyCount}
                onChange={(e) => setCondWeeklyCount(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 3"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">특정 월 (1~12)</span>
              <input
                type="number"
                min="1"
                max="12"
                value={condMonth}
                onChange={(e) => setCondMonth(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 8"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">월 누적 거리 (km)</span>
              <input
                type="number"
                step="0.1"
                value={condMonthlyKm}
                onChange={(e) => setCondMonthlyKm(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 100"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">계절 활동 횟수</span>
              <input
                type="number"
                value={condSeasonCount}
                onChange={(e) => setCondSeasonCount(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 5"
              />
            </label>
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="text-xs text-white/50">계절</span>
              <select
                value={condSeason}
                onChange={(e) => setCondSeason(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
              >
                <option value="" className="bg-[#1a1a1a]">— 없음 —</option>
                <option value="spring" className="bg-[#1a1a1a]">봄 (3~5월)</option>
                <option value="summer" className="bg-[#1a1a1a]">여름 (6~8월)</option>
                <option value="fall" className="bg-[#1a1a1a]">가을 (9~11월)</option>
                <option value="winter" className="bg-[#1a1a1a]">겨울 (12~2월)</option>
                <option value="all" className="bg-[#1a1a1a]">전 계절</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">최저 기온 조건 (°C 이상 · 폭염)</span>
              <input
                type="number"
                step="0.1"
                value={condTempMinC}
                onChange={(e) => setCondTempMinC(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 30"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">최고 기온 조건 (°C 이하 · 한파)</span>
              <input
                type="number"
                step="0.1"
                value={condTempMaxC}
                onChange={(e) => setCondTempMaxC(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
                placeholder="예: 0"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">활동 시작 시간대 — 시작 (HH:MM)</span>
              <input
                type="time"
                value={condTimeStart}
                onChange={(e) => setCondTimeStart(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">활동 시작 시간대 — 종료 (HH:MM)</span>
              <input
                type="time"
                value={condTimeEnd}
                onChange={(e) => setCondTimeEnd(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
              />
            </label>
          </div>
          <p className="text-xs text-white/30 -mt-1">
            시간대는 자정을 넘겨 설정 가능합니다 (예: 22:00~05:00 심야). 종료 시각이 시작보다 이르면 익일로 해석됩니다.
          </p>

          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="text-xs text-white/50">선행 배지 이름 (쉼표 구분)</span>
            <input
              value={condPrerequisiteNames}
              onChange={(e) => setCondPrerequisiteNames(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50"
              placeholder="예: 첫 페달, 아스팔트 입문 (Rare 이상에만 설정)"
            />
            <span className="text-xs text-white/30">이 배지를 받으려면 나열된 배지 중 하나를 먼저 보유해야 합니다.</span>
          </label>

          <div className="bg-black/30 rounded-xl p-3">
            <p className="text-xs text-white/40 mb-1.5">JSON 미리보기</p>
            <pre className="text-xs text-[#AEEA00]/80 font-mono overflow-x-auto">
              {condPreview ? JSON.stringify(condPreview, null, 2) : 'null (조건 없음)'}
            </pre>
          </div>
        </div>
      )}

      {/* 유효 기간 (공통) */}
      <div className="border border-white/10 rounded-2xl p-5 space-y-4">
        <p className="text-sm font-semibold text-white/70">유효 기간</p>
        <p className="text-xs text-white/40">
          {type === 'item'
            ? '설정하면 해당 기간에만 드랍되며, 획득된 배지의 만료일은 종료일로 자동 설정됩니다. 설정하지 않으면 상시 드랍 / 만료 없음.'
            : '설정하면 해당 기간에만 발급 조건이 평가됩니다. 기간 외 액티비티 싱크에서는 이 배지가 건너뛰어집니다. 설정하지 않으면 상시 평가.'}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/50">시작일 (yyyy-mm-dd)</span>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/50">종료일 (yyyy-mm-dd)</span>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              min={validFrom || undefined}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#AEEA00]/50"
            />
          </label>
        </div>
        {(validFrom || validUntil) && (
          <button
            type="button"
            onClick={() => { setValidFrom(''); setValidUntil('') }}
            className="text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            기간 설정 초기화
          </button>
        )}
      </div>

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
