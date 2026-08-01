'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BadgeRow, BadgeCondition, ActivityType, BadgeType, BadgeRarity, FactionRow, ItemBookRow } from '@/types/database'
import { formatPaceSecPerKm } from '@/types/strava'

/** "5:30" 같은 mm:ss 페이스 입력을 초(sec/km)로 변환. 형식이 어긋나면 null */
function parsePaceToSec(input: string): number | null {
  const match = input.trim().match(/^(\d+):([0-5]?\d)$/)
  if (!match) return null
  const min = parseInt(match[1], 10)
  const sec = parseInt(match[2], 10)
  return min * 60 + sec
}

const ACTIVITY_TYPES: ActivityType[] = ['cycling', 'running', 'trail_running', 'hiking', 'walking']
const BADGE_TYPES: BadgeType[] = ['activity', 'item', 'poi']
const RARITIES: BadgeRarity[] = ['common', 'rare', 'legendary', 'mythic']

/** drop-engine의 CUMULATIVE_CONDITION_FIELDS와 동일 — 아이템 배지엔 이 필드들을 설정할 수 없다
 *  (설정하면 hasCumulativeCondition()이 항상 true가 되어 영원히 드랍 후보에서 제외됨) */
const CUMULATIVE_CONDITION_KEYS: (keyof BadgeCondition)[] = [
  'monthly_km', 'season_count', 'weekly_count', 'streak_days', 'total_count',
]

/** 배지에 연결할 수 있는 POI(이미 DB에 등록된 것) */
interface LinkablePoi {
  id: string
  name: string
  category: string
  latitude: number
  longitude: number
  radius_meters: number
  linked_badge_id: string | null
}

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
  const [pointReward, setPointReward] = useState<string>(
    badge?.point_reward?.toString() ?? '0'
  )

  // condition_json builder state
  const initCond = (badge?.condition_json as BadgeCondition) ?? EMPTY_CONDITION
  const [condDistanceKm, setCondDistanceKm] = useState<string>(initCond.distance_km?.toString() ?? '')
  const [condTotalCount, setCondTotalCount] = useState<string>(initCond.total_count?.toString() ?? '')
  const [condElevationM, setCondElevationM] = useState<string>(initCond.elevation_gain_m?.toString() ?? '')
  const [condMinSpeedKmh, setCondMinSpeedKmh] = useState<string>(initCond.min_speed_kmh?.toString() ?? '')
  const [condMaxPace, setCondMaxPace] = useState<string>(
    initCond.max_pace_sec_per_km !== undefined ? formatPaceSecPerKm(initCond.max_pace_sec_per_km).replace('/km', '') : ''
  )
  const [condStreakDays, setCondStreakDays] = useState<string>(initCond.streak_days?.toString() ?? '')
  const [condActivityType, setCondActivityType] = useState<string>(initCond.activity_type ?? '')
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

  // ── 아이템 배지: 같은 북+희귀도 내 drop_weight 상대 확률 미리보기 ──────
  const [siblingWeightSum, setSiblingWeightSum] = useState<number | null>(null)
  useEffect(() => {
    if (type !== 'item' || !itemBookId) {
      setSiblingWeightSum(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/badges')
        const data = await res.json()
        if (!res.ok || cancelled) return
        type BadgeListRow = { id: string; type: string; item_book_id: string | null; rarity: string; drop_weight: number | null; deleted_at: string | null }
        const siblings = ((data.badges ?? []) as BadgeListRow[]).filter(
          (b) => b.type === 'item' && b.item_book_id === itemBookId && b.rarity === rarity && !b.deleted_at && b.id !== (badge?.id ?? '')
        )
        const sum = siblings.reduce((s, b) => s + (b.drop_weight ?? 1.0), 0)
        if (!cancelled) setSiblingWeightSum(sum)
      } catch {
        if (!cancelled) setSiblingWeightSum(null)
      }
    })()
    return () => { cancelled = true }
  }, [type, itemBookId, rarity, badge?.id])

  // ── POI 배지 전용: 연결된 POI 목록 ──────────────────────────────
  const [linkedPois, setLinkedPois] = useState<LinkablePoi[]>([])
  const [poiQuery, setPoiQuery] = useState('')
  const [poiResults, setPoiResults] = useState<LinkablePoi[]>([])
  const [poiSearching, setPoiSearching] = useState(false)
  const [poiSearched, setPoiSearched] = useState(false)
  const poiLinksLoadedRef = useRef(false)

  // 수정 모드에서 poi 타입일 때 현재 연결된 POI를 최초 1회 불러온다
  useEffect(() => {
    if (!isEdit || !badge || type !== 'poi' || poiLinksLoadedRef.current) return
    poiLinksLoadedRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/badges/${badge.id}/poi-links`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'POI 연결 목록 조회 실패')
        if (!cancelled) setLinkedPois((data.pois ?? []) as LinkablePoi[])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'POI 연결 목록 조회 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isEdit, badge, type])

  const searchPois = useCallback(async () => {
    const q = poiQuery.trim()
    if (!q) {
      setPoiResults([])
      setPoiSearched(false)
      return
    }
    setPoiSearching(true)
    try {
      const res = await fetch(`/api/admin/poi/search?query=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'POI 검색 실패')
      setPoiResults((data.pois ?? []) as LinkablePoi[])
      setPoiSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'POI 검색 실패')
    } finally {
      setPoiSearching(false)
    }
  }, [poiQuery])

  const addLinkedPoi = (poi: LinkablePoi) => {
    setLinkedPois((prev) => (prev.some((p) => p.id === poi.id) ? prev : [...prev, poi]))
  }
  const removeLinkedPoi = (poiId: string) => {
    setLinkedPois((prev) => prev.filter((p) => p.id !== poiId))
  }

  const buildConditionJson = (): BadgeCondition | null => {
    const cond: BadgeCondition = {}
    if (condDistanceKm) cond.distance_km = parseFloat(condDistanceKm)
    if (condTotalCount) cond.total_count = parseInt(condTotalCount, 10)
    if (condElevationM) cond.elevation_gain_m = parseFloat(condElevationM)
    if (condMinSpeedKmh) cond.min_speed_kmh = parseFloat(condMinSpeedKmh)
    if (condMaxPace) {
      const paceSec = parsePaceToSec(condMaxPace)
      if (paceSec !== null) cond.max_pace_sec_per_km = paceSec
    }
    if (condStreakDays) cond.streak_days = parseInt(condStreakDays, 10)
    if (condActivityType) cond.activity_type = condActivityType as ActivityType
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
    if (type === 'item') {
      const offending = CUMULATIVE_CONDITION_KEYS.filter((k) => cond[k] !== undefined)
      if (offending.length > 0) {
        return `아이템 배지에는 누적조건(${offending.join(', ')})을 설정할 수 없습니다. 이 조건이 있으면 드랍 후보에서 영구 제외됩니다.`
      }
    }
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

    // POI 배지는 활동 조건을 쓰지 않는다 — 조건 빌더 값이 남아 있어도 무시
    const conditionJson = type === 'poi' ? null : buildConditionJson()
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
      point_reward: Math.max(0, parseInt(pointReward, 10) || 0),
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

      // POI 배지: 저장된 배지 id로 연결 POI 목록을 통째로 반영
      if (type === 'poi') {
        const savedBadgeId: string | undefined = data.badge?.id ?? (isEdit ? badge.id : undefined)
        if (!savedBadgeId) throw new Error('저장된 배지 ID를 확인할 수 없어 POI 연결에 실패했습니다.')
        const linkRes = await fetch(`/api/admin/badges/${savedBadgeId}/poi-links`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poi_ids: linkedPois.map((p) => p.id) }),
        })
        const linkData = await linkRes.json()
        if (!linkRes.ok) throw new Error(linkData.error ?? 'POI 연결 저장 실패')
      }

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
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-[#374151]">배지 이름 *</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50"
            placeholder="예: 한강 라이더"
          />
        </label>

        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-[#374151]">설명 *</span>
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 resize-none"
            placeholder="배지 설명을 입력하세요"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-[#374151]">타입 *</span>
          <select
            required
            value={type}
            onChange={(e) => setType(e.target.value as BadgeType)}
            className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] focus:outline-none focus:border-[#111111]/50"
          >
            {BADGE_TYPES.map((t) => (
              <option key={t} value={t} className="bg-white">{t}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-[#374151]">희귀도 *</span>
          <select
            required
            value={rarity}
            onChange={(e) => setRarity(e.target.value as BadgeRarity)}
            className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] focus:outline-none focus:border-[#111111]/50"
          >
            {RARITIES.map((r) => (
              <option key={r} value={r} className="bg-white">{r}</option>
            ))}
          </select>
        </label>

        {/* 세계관 선택 */}
        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-[#374151]">소속 세계관</span>
          <select
            value={factionId}
            onChange={(e) => setFactionId(e.target.value)}
            className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] focus:outline-none focus:border-[#111111]/50"
          >
            <option value="" className="bg-white">— 없음 —</option>
            {factions.map((f) => (
              <option key={f.id} value={f.id} className="bg-white">{f.name}</option>
            ))}
          </select>
        </label>

        {/* 소속 아이템북 */}
        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-[#374151]">소속 아이템북</span>
          <select
            value={itemBookId}
            onChange={(e) => setItemBookId(e.target.value)}
            className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] focus:outline-none focus:border-[#111111]/50"
          >
            <option value="" className="bg-white">— 없음 —</option>
            {itemBooks.map((b) => (
              <option key={b.id} value={b.id} className="bg-white">{b.name}</option>
            ))}
          </select>
        </label>

        {/* 아이템 배지 전용 설정 */}
        {type === 'item' && (
          <>
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="text-sm text-[#374151]">드랍 가중치 (0.1 ~ 10.0)</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={dropWeight}
                onChange={(e) => setDropWeight(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] focus:outline-none focus:border-[#111111]/50"
              />
              {itemBookId && siblingWeightSum !== null && (
                (() => {
                  const own = parseFloat(dropWeight) || 0
                  const total = siblingWeightSum + own
                  const pct = total > 0 ? Math.round((own / total) * 1000) / 10 : 0
                  return (
                    <span className="text-xs text-[#898989]">
                      같은 아이템북·희귀도 내 다른 배지 {siblingWeightSum > 0 ? `(가중치 합 ${siblingWeightSum.toFixed(1)})` : ''}
                      {' '}대비 이 배지가 뽑힐 상대 확률 약 <strong className="text-[#374151]">{pct}%</strong>
                      {siblingWeightSum === 0 && ' (이 조합의 첫 배지)'}
                    </span>
                  )
                })()
              )}
            </label>

          </>
        )}

        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-[#374151]">포인트 보상</span>
          <input
            type="number"
            min="0"
            value={pointReward}
            onChange={(e) => setPointReward(e.target.value)}
            className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 max-w-xs"
            placeholder="0"
          />
          <span className="text-xs text-[#898989]">이 배지가 발급될 때 함께 지급되는 잼 포인트. 0이면 없음. 발급 시점 값으로 1회 지급되며, 이후 값을 바꿔도 이미 지급된 포인트는 소급 변경되지 않습니다.</span>
        </label>

        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-[#374151]">이미지 URL *</span>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 shrink-0 rounded-xl bg-white border border-[#e5e7eb] flex items-center justify-center overflow-hidden">
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
                <span className="text-[#898989] text-xs">—</span>
              )}
            </div>
            <input
              required
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="flex-1 bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50"
              placeholder="https://... 또는 /badges/001.png"
            />
          </div>
        </label>
      </div>

      {/* 활동 종류 */}
      <div>
        <p className="text-sm text-[#374151] mb-2">활동 종류 *</p>
        <div className="flex gap-3 flex-wrap">
          {ACTIVITY_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activityTypes.includes(t)}
                onChange={() => toggleActivityType(t)}
                className="accent-[#111111]"
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
            className="accent-[#111111]"
          />
          <span className="text-sm">패치 구매 가능</span>
        </label>
        {patchAvailable && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-[#374151]">패치 가격 (원)</span>
            <input
              type="number"
              value={patchPriceKrw}
              onChange={(e) => setPatchPriceKrw(e.target.value)}
              className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 max-w-xs"
              placeholder="예: 9900"
            />
          </label>
        )}
      </div>

      {/* condition_json 빌더 (activity + item 공통 — POI 배지는 조건 대신 연결 POI로 판정) */}
      {type !== 'poi' && (
        <div className="border border-[#e5e7eb] rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-[#374151]">
            {type === 'item' ? '드랍 조건 (condition_json)' : '발급 조건 (condition_json)'}
          </p>
          {type === 'item' && (
            <p className="text-xs text-[#6b7280]">조건을 설정하면 해당 조건을 충족한 유저에게만 이 배지가 드랍 풀에 포함됩니다. 설정하지 않으면 모든 유저에게 드랍 가능.</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">최소 거리 (km)</span>
              <input
                type="number"
                step="0.1"
                value={condDistanceKm}
                onChange={(e) => setCondDistanceKm(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 30"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">누적 활동 횟수</span>
              <input
                type="number"
                value={condTotalCount}
                onChange={(e) => setCondTotalCount(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 10"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">고도 상승 누적 (m)</span>
              <input
                type="number"
                value={condElevationM}
                onChange={(e) => setCondElevationM(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 500"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">최소 속도 (km/h)</span>
              <input
                type="number"
                step="0.1"
                value={condMinSpeedKmh}
                onChange={(e) => setCondMinSpeedKmh(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 25"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">최대 페이스 (mm:ss/km, 러닝 계열용)</span>
              <input
                type="text"
                value={condMaxPace}
                onChange={(e) => setCondMaxPace(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 5:30 (값이 작을수록 빠름)"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">연속 활동 일수</span>
              <input
                type="number"
                value={condStreakDays}
                onChange={(e) => setCondStreakDays(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 7"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">활동 종류 (조건)</span>
              <select
                value={condActivityType}
                onChange={(e) => setCondActivityType(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
              >
                <option value="" className="bg-white">— 전체 —</option>
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-white">{t}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">단일 활동 최소 이동 시간 (분)</span>
              <input
                type="number"
                value={condDurationMinutes}
                onChange={(e) => setCondDurationMinutes(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">주말 활동 최소 이동 시간 (시간)</span>
              <input
                type="number"
                step="0.5"
                value={condWeekendDurationHours}
                onChange={(e) => setCondWeekendDurationHours(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 2"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">한 주 내 최소 활동 횟수</span>
              <input
                type="number"
                value={condWeeklyCount}
                onChange={(e) => setCondWeeklyCount(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 3"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">특정 월 (1~12)</span>
              <input
                type="number"
                min="1"
                max="12"
                value={condMonth}
                onChange={(e) => setCondMonth(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 8"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">월 누적 거리 (km)</span>
              <input
                type="number"
                step="0.1"
                value={condMonthlyKm}
                onChange={(e) => setCondMonthlyKm(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 100"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">계절 활동 횟수</span>
              <input
                type="number"
                value={condSeasonCount}
                onChange={(e) => setCondSeasonCount(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 5"
              />
            </label>
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="text-xs text-[#6b7280]">계절</span>
              <select
                value={condSeason}
                onChange={(e) => setCondSeason(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
              >
                <option value="" className="bg-white">— 없음 —</option>
                <option value="spring" className="bg-white">봄 (3~5월)</option>
                <option value="summer" className="bg-white">여름 (6~8월)</option>
                <option value="fall" className="bg-white">가을 (9~11월)</option>
                <option value="winter" className="bg-white">겨울 (12~2월)</option>
                <option value="all" className="bg-white">전 계절</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">최저 기온 조건 (°C 이상 · 폭염)</span>
              <input
                type="number"
                step="0.1"
                value={condTempMinC}
                onChange={(e) => setCondTempMinC(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 30"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">최고 기온 조건 (°C 이하 · 한파)</span>
              <input
                type="number"
                step="0.1"
                value={condTempMaxC}
                onChange={(e) => setCondTempMaxC(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
                placeholder="예: 0"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">활동 시작 시간대 — 시작 (HH:MM)</span>
              <input
                type="time"
                value={condTimeStart}
                onChange={(e) => setCondTimeStart(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-[#6b7280]">활동 시작 시간대 — 종료 (HH:MM)</span>
              <input
                type="time"
                value={condTimeEnd}
                onChange={(e) => setCondTimeEnd(e.target.value)}
                className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
              />
            </label>
          </div>
          <p className="text-xs text-[#898989] -mt-1">
            시간대는 자정을 넘겨 설정 가능합니다 (예: 22:00~05:00 심야). 종료 시각이 시작보다 이르면 익일로 해석됩니다.
          </p>

          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="text-xs text-[#6b7280]">선행 배지 이름 (쉼표 구분)</span>
            <input
              value={condPrerequisiteNames}
              onChange={(e) => setCondPrerequisiteNames(e.target.value)}
              className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50"
              placeholder="예: 첫 페달, 아스팔트 입문 (Rare 이상에만 설정)"
            />
            <span className="text-xs text-[#898989]">이 배지를 받으려면 나열된 배지 중 하나를 먼저 보유해야 합니다.</span>
          </label>

          <div className="bg-[#f5f5f5] border border-[#e5e7eb] rounded-xl p-3">
            <p className="text-xs text-[#6b7280] mb-1.5">JSON 미리보기</p>
            <pre className="text-xs text-[#111111]/80 font-mono overflow-x-auto">
              {condPreview ? JSON.stringify(condPreview, null, 2) : 'null (조건 없음)'}
            </pre>
          </div>
        </div>
      )}

      {/* 연결된 POI (poi 타입 전용) */}
      {type === 'poi' && (
        <div className="border border-[#e5e7eb] rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-[#374151]">연결된 POI</p>
            <p className="text-xs text-[#6b7280] mt-1">
              여기에 연결한 POI 반경을 액티비티 GPS 경로가 지나가면 이 배지가 발급됩니다. 여러 개 연결할 수 있고,
              방문할 때마다 반복 발급됩니다. 판정 반경은 각 POI에 등록된 값을 그대로 사용합니다.
            </p>
          </div>

          {/* 검색 */}
          <div className="flex items-center gap-2">
            <input
              value={poiQuery}
              onChange={(e) => setPoiQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  searchPois()
                }
              }}
              className="flex-1 bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50"
              placeholder="등록된 POI 이름으로 검색 (예: 대림창고)"
            />
            <button
              type="button"
              onClick={searchPois}
              disabled={poiSearching || !poiQuery.trim()}
              className="bg-[#111111] text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-[#242424] disabled:opacity-50 transition-colors shrink-0"
            >
              {poiSearching ? '검색 중...' : '검색'}
            </button>
          </div>

          {/* 검색 결과 */}
          {poiSearched && (
            <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
              {poiResults.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[#898989]">검색 결과가 없습니다.</p>
              ) : (
                <ul className="max-h-64 overflow-y-auto divide-y divide-[#f3f4f6]">
                  {poiResults.map((poi) => {
                    const already = linkedPois.some((p) => p.id === poi.id)
                    const linkedElsewhere =
                      !!poi.linked_badge_id && poi.linked_badge_id !== (badge?.id ?? '')
                    return (
                      <li key={poi.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#111111] truncate">{poi.name}</p>
                          <p className="text-xs text-[#6b7280]">
                            {poi.category} · 반경 {poi.radius_meters}m
                            {linkedElsewhere && (
                              <span className="text-amber-600"> · 다른 배지에 연결됨 (추가 시 이 배지로 이동)</span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addLinkedPoi(poi)}
                          disabled={already}
                          className="text-sm px-3 py-1.5 rounded-lg border border-[#e5e7eb] text-[#374151] hover:bg-[#f3f4f6] disabled:opacity-40 disabled:hover:bg-white transition-colors shrink-0"
                        >
                          {already ? '추가됨' : '추가'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* 연결 목록 */}
          <div>
            <p className="text-xs text-[#6b7280] mb-2">연결된 POI {linkedPois.length}개</p>
            {linkedPois.length === 0 ? (
              <div className="bg-[#f5f5f5] border border-[#e5e7eb] rounded-xl px-4 py-5 text-center">
                <p className="text-sm text-[#898989]">아직 연결된 POI가 없습니다. 위에서 검색해 추가하세요.</p>
              </div>
            ) : (
              <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
                      <th className="px-4 py-2.5 font-medium">이름</th>
                      <th className="px-4 py-2.5 font-medium">카테고리</th>
                      <th className="px-4 py-2.5 font-medium">반경</th>
                      <th className="px-4 py-2.5 font-medium w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedPois.map((poi) => (
                      <tr key={poi.id} className="border-b border-[#f3f4f6] last:border-b-0">
                        <td className="px-4 py-2.5 text-[#111111]">{poi.name}</td>
                        <td className="px-4 py-2.5 text-[#374151] text-xs">{poi.category}</td>
                        <td className="px-4 py-2.5 text-[#374151] text-xs">{poi.radius_meters}m</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeLinkedPoi(poi.id)}
                            aria-label={`${poi.name} 연결 해제`}
                            className="text-[#898989] hover:text-red-600 transition-colors px-1.5"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-[#898989] mt-2">
              반경 수정은 POI 관리 화면에서 할 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* 유효 기간 (공통) */}
      <div className="border border-[#e5e7eb] rounded-2xl p-5 space-y-4">
        <p className="text-sm font-semibold text-[#374151]">유효 기간</p>
        <p className="text-xs text-[#6b7280]">
          {type === 'item'
            ? '설정하면 해당 기간에만 드랍되며, 획득된 배지의 만료일은 종료일로 자동 설정됩니다. 설정하지 않으면 상시 드랍 / 만료 없음.'
            : '설정하면 해당 기간에만 발급 조건이 평가됩니다. 기간 외 액티비티 싱크에서는 이 배지가 건너뛰어집니다. 설정하지 않으면 상시 평가.'}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[#6b7280]">시작일 (yyyy-mm-dd)</span>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[#6b7280]">종료일 (yyyy-mm-dd)</span>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              min={validFrom || undefined}
              className="bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#111111]/50"
            />
          </label>
        </div>
        {(validFrom || validUntil) && (
          <button
            type="button"
            onClick={() => { setValidFrom(''); setValidUntil('') }}
            className="text-xs text-[#898989] hover:text-[#374151] transition-colors"
          >
            기간 설정 초기화
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-[#111111] text-white font-bold px-6 py-2.5 rounded-xl hover:bg-[#242424] disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '배지 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/badges')}
          className="text-[#6b7280] hover:text-[#111111] px-4 py-2.5 rounded-xl hover:bg-[#f8f9fa] transition-colors"
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
          <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">배지 삭제</h3>
            <p className="text-[#6b7280] text-sm mb-5">
              &apos;{badge?.name}&apos; 배지를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
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
                className="flex-1 bg-white text-[#111111] py-2.5 rounded-xl hover:bg-[#f3f4f6] transition-colors"
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
