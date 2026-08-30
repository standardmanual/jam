'use client'

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconX } from '@tabler/icons-react'
import type { BadgeRow, BadgeCondition, ActivityType, BadgeType, BadgeRarity, FactionRow, ItemBookRow } from '@/types/database'
import { formatPaceSecPerKm } from '@/types/strava'
import ImageUploadField from '@/components/admin/ImageUploadField'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { BADGE_BACKGROUND_SHADER_OPTIONS } from '@/lib/badgeBackgroundShaderOptions'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import type {
  BackgroundMode,
  BackgroundGeneratorPreviewHandle,
  BackgroundGeneratorLivePreviewState,
} from './BackgroundGeneratorPreview'
import BadgeDetailPreviewFrame from './BadgeDetailPreviewFrame'
import { buildConditionJsonFromFields, getUnsupportedConditionKeys } from './conditionFormFields'
import { BADGE_TYPES, BADGE_TYPE_LABEL } from '@/lib/admin/badge-labels'

// WebGL 셰이더 5종(@paper-design/shaders-react) + mp4-muxer를 정적 import하면 BadgeForm 청크에
// 그대로 딸려온다 — React.lazy로 분리해 별도 청크로 지연 로드한다(20260826_011 A5). next/dynamic은
// loadable 래퍼가 ref를 가로채 `ref.bake()`(배경 저장)를 깨뜨리므로 쓰지 않는다.
const BackgroundGeneratorPreview = lazy(() => import('./BackgroundGeneratorPreview'))

/** 미리보기 본문에 넣는 예시 조건 문구 — 실제 조건은 배지마다 달라 저작 화면에서는 알 수 없다 */
const PREVIEW_CONDITION_TEXT = '실제 화면에서는 이 자리에 배지 획득 조건이 표시돼요.'

const ACTIVITY_TYPES: ActivityType[] = ['cycling', 'running', 'trail_running', 'hiking', 'walking']
const RARITIES: BadgeRarity[] = ['common', 'rare', 'legend', 'mythic']

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
  /** 체크인 배지 전용 "지점 카테고리" Select 옵션 — poi_categories 재사용(마이그레이션 113).
   *  값을 지정하면 연결된 지점의 카테고리보다 우선 적용된다(티켓 20260830_1522). */
  poiCategories: { slug: string; label: string }[]
}

const EMPTY_CONDITION: BadgeCondition = {}

// Radix Select는 SelectItem value=""를 허용하지 않는다 — "선택 안 함"을 나타내는 전용 값.
const NONE_VALUE = '__none__'

/**
 * 구운 배경 파일(정지 PNG / 반복 MP4)을 기존 업로드 API로 올리고 public URL을 돌려준다.
 * 이미지와 영상이 같은 경로를 쓰므로 한 곳으로 모았다 (20260819_012).
 */
async function uploadBackgroundFile(blob: Blob, filename: string, mimeType: string, errorMessage: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', new File([blob], filename, { type: mimeType }))
  formData.append('folder', 'badges/backgrounds')
  const res = await fetch('/api/admin/upload-image', { method: 'POST', body: formData })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? errorMessage)
  return data.url as string
}

export default function BadgeForm({ badge, factions, itemBooks, poiCategories }: BadgeFormProps) {
  const router = useRouter()
  const isEdit = !!badge

  // Select 드롭다운(Radix Portal)은 기본적으로 document.body에 렌더링되는데, shadcn 어드민
  // 테마 실값은 [data-admin-theme] 스코프 안에만 존재한다(globals.css 참고). 포털 컨테이너를
  // 그 스코프 노드로 지정해야 향후(4b~4d에서 select.tsx가 시맨틱 토큰으로 전환될 때) 테마
  // 색이 정상 적용된다 — sidebar.tsx의 동일 패턴 재사용 (20260826_016, 인프라 1-2).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

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
  // 배경 테마 (20260818_003) — background_color: 배경색(피커+hex, 이미지 업로드 시 평균 컬러
  // 자동 프리필). background_shader_id: 임시 선택 드롭다운(값만 저장, 상세화면 렌더링 미연결)
  const [backgroundColor, setBackgroundColor] = useState<string>(badge?.background_color ?? '')
  const [backgroundShaderId, setBackgroundShaderId] = useState<string>(badge?.background_shader_id ?? '')
  // "단색"/"제너레이터" 상호 배타 선택 (20260819_008) — 기존에 저장된 배경 제너레이터 이미지가
  // 있으면 제너레이터 모드로 시작, 없으면 단색 모드로 시작한다.
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(badge?.background_image_url ? 'generator' : 'color')
  const backgroundGeneratorRef = useRef<BackgroundGeneratorPreviewHandle>(null)

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
  // 메타데이터 필드 — 조건 필드와 달리 발급 판정에 관여하지 않는다(티켓 20260825_031).
  // buildConditionJson이 이 state 없이 하드코딩된 조건 필드만 조립하던 회귀가 있었다 —
  // 미션보상배지를 어드민에서 수정 저장하면 mission_reward 플래그가 조용히 유실됐다.
  const [condMissionReward, setCondMissionReward] = useState<boolean>(initCond.mission_reward === true)
  // 폼이 입력 UI를 갖지 않는 조건 필드(day_of_week 등) — 값이 있으면 저장 시 원본 그대로
  // 보존되지만(conditionFormFields.ts), 이 폼에서 보거나 고칠 수는 없다는 걸 안내한다
  // (티켓 20260825_032). initCond는 배지를 열 때의 원본 스냅샷이라 폼 세션 동안 불변이다.
  const unsupportedConditionKeys = getUnsupportedConditionKeys(initCond)

  const [factionId, setFactionId] = useState(badge?.faction_id ?? '')
  const [itemBookId, setItemBookId] = useState(badge?.item_book_id ?? '')
  const [category, setCategory] = useState(badge?.category ?? '')
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
  // 20260827_020: 이펙트 진입 시의 동기 `setSiblingWeightSum(null)`은 캐스케이딩 렌더를 만든다
  // (react-hooks/set-state-in-effect). 미리보기가 의미를 갖는 조건(아이템 타입 + 컬렉션 선택)이
  // 아닐 때의 null은 아래 파생값으로 옮겼다 — 표시 조건은 기존과 같다.
  const [fetchedSiblingWeightSum, setFetchedSiblingWeightSum] = useState<number | null>(null)
  const siblingWeightSum = type === 'item' && itemBookId ? fetchedSiblingWeightSum : null
  useEffect(() => {
    if (type !== 'item' || !itemBookId) return
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
        if (!cancelled) setFetchedSiblingWeightSum(sum)
      } catch {
        if (!cancelled) setFetchedSiblingWeightSum(null)
      }
    })()
    return () => { cancelled = true }
  }, [type, itemBookId, rarity, badge?.id])

  // ── 체크인 배지 전용: 연결된 지점(POI) 목록 ──────────────────────
  const [linkedPois, setLinkedPois] = useState<LinkablePoi[]>([])
  const [poiQuery, setPoiQuery] = useState('')
  const [poiResults, setPoiResults] = useState<LinkablePoi[]>([])
  const [poiSearching, setPoiSearching] = useState(false)
  const [poiSearched, setPoiSearched] = useState(false)
  const poiLinksLoadedRef = useRef(false)

  // 수정 모드에서 checkin 타입일 때 현재 연결된 지점을 최초 1회 불러온다
  useEffect(() => {
    if (!isEdit || !badge || type !== 'checkin' || poiLinksLoadedRef.current) return
    poiLinksLoadedRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/badges/${badge.id}/poi-links`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? '지점 연결 목록 조회 실패')
        if (!cancelled) setLinkedPois((data.pois ?? []) as LinkablePoi[])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '지점 연결 목록 조회 실패')
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
      if (!res.ok) throw new Error(data.error ?? '지점 검색 실패')
      setPoiResults((data.pois ?? []) as LinkablePoi[])
      setPoiSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '지점 검색 실패')
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

  const buildConditionJson = (): BadgeCondition | null =>
    buildConditionJsonFromFields({
      distanceKm: condDistanceKm,
      totalCount: condTotalCount,
      elevationM: condElevationM,
      minSpeedKmh: condMinSpeedKmh,
      maxPace: condMaxPace,
      streakDays: condStreakDays,
      activityType: condActivityType,
      durationMinutes: condDurationMinutes,
      weekendDurationHours: condWeekendDurationHours,
      weeklyCount: condWeeklyCount,
      month: condMonth,
      monthlyKm: condMonthlyKm,
      seasonCount: condSeasonCount,
      season: condSeason,
      tempMinC: condTempMinC,
      tempMaxC: condTempMaxC,
      timeStart: condTimeStart,
      timeEnd: condTimeEnd,
      prerequisiteNames: condPrerequisiteNames,
      missionReward: condMissionReward,
    }, initCond)

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

    // 이미지는 파일 업로드로만 등록하므로(20260818_002) 브라우저 기본 required 검증이 적용되지
    // 않는다 — 여기서 직접 확인한다.
    if (!imageUrl) {
      setError('배지 이미지를 업로드해주세요. 파일 선택 버튼으로 이미지를 등록할 수 있어요.')
      return
    }

    // 체크인 배지는 활동 조건을 쓰지 않는다 — 조건 빌더 값이 남아 있어도 무시
    const conditionJson = type === 'checkin' ? null : buildConditionJson()
    const condError = validateCondition(conditionJson)
    if (condError) {
      setError(condError)
      return
    }

    // 배경색 형식 검증은 "단색" 모드에서 실제로 저장될 값일 때만 한다 — "제너레이터" 모드에서는
    // 이 필드가 화면에서 숨겨져 있어(잔여 입력값이어도) 저장에 쓰이지 않는다.
    const trimmedBackgroundColor = backgroundColor.trim()
    if (backgroundMode === 'color' && trimmedBackgroundColor && !HEX_COLOR_PATTERN.test(trimmedBackgroundColor)) {
      setError('배경색 형식이 올바르지 않아요. #1a1a1a처럼 #으로 시작하는 6자리 hex 값을 입력해주세요.')
      return
    }

    setLoading(true)

    try {
      // 배경 테마 — 3모드(단색 / 정적 제너레이터 / 애니메이션 제너레이터)는 상호 배타적이라 저장
      // 시 선택하지 않은 쪽은 항상 null로 정리한다(20260819_008, 20260819_012). 제너레이터
      // 모드에서 이번 세션에 새 이미지를 고르지 않았으면(즉 bake()가 null을 반환하면) 기존에
      // 저장돼 있던 배경 이미지·영상을 그대로 유지한다 — 그냥 폼을 열었다 닫기만 해도 저장된
      // 배경이 사라지는 걸 막기 위함.
      let finalBackgroundColor: string | null = null
      let finalBackgroundImageUrl: string | null = null
      let finalBackgroundVideoUrl: string | null = null

      if (backgroundMode === 'color') {
        finalBackgroundColor = trimmedBackgroundColor || null
      } else {
        const baked = await backgroundGeneratorRef.current?.bake()
        if (baked) {
          // poster(정지 PNG)는 두 모드 공통. 애니메이션 모드에서는 <video poster>·영상 로드 실패
          // 폴백·prefers-reduced-motion 대체 이미지로 계속 쓰이므로 영상과 항상 짝으로 올린다.
          finalBackgroundImageUrl = await uploadBackgroundFile(
            baked.poster,
            `background-${Date.now()}.png`,
            'image/png',
            '배경 이미지를 업로드하지 못했습니다.'
          )
          if (baked.video) {
            finalBackgroundVideoUrl = await uploadBackgroundFile(
              baked.video,
              `background-${Date.now()}.mp4`,
              'video/mp4',
              '배경 영상을 업로드하지 못했습니다.'
            )
          }
        } else {
          finalBackgroundImageUrl = badge?.background_image_url ?? null
          finalBackgroundVideoUrl = badge?.background_video_url ?? null
        }
      }

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
        // 체크인 배지는 세계관/컬렉션 개념이 없다 — UI는 숨겼지만 기존 값이 남아있을 수 있으므로
        // 저장 시점에 명시적으로 null 처리한다(티켓 20260830_1344).
        faction_id: type === 'checkin' ? null : factionId || null,
        item_book_id: type === 'checkin' ? null : itemBookId || null,
        // 지점 카테고리는 체크인 배지 전용 — 다른 타입에서는 항상 null.
        category: type === 'checkin' ? category || null : null,
        drop_weight: type === 'item' ? parseFloat(dropWeight) : 1.0,
        valid_from: validFrom ? new Date(validFrom).toISOString() : null,
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        point_reward: Math.max(0, parseInt(pointReward, 10) || 0),
        background_color: finalBackgroundColor,
        background_shader_id: backgroundShaderId || null,
        background_image_url: finalBackgroundImageUrl,
        background_video_url: finalBackgroundVideoUrl,
      }

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

      // 체크인 배지: 저장된 배지 id로 연결 지점 목록을 통째로 반영
      if (type === 'checkin') {
        const savedBadgeId: string | undefined = data.badge?.id ?? (isEdit ? badge.id : undefined)
        if (!savedBadgeId) throw new Error('저장된 배지 ID를 확인할 수 없어 지점 연결에 실패했습니다.')
        const linkRes = await fetch(`/api/admin/badges/${savedBadgeId}/poi-links`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poi_ids: linkedPois.map((p) => p.id) }),
        })
        const linkData = await linkRes.json()
        if (!linkRes.ok) throw new Error(linkData.error ?? '지점 연결 저장 실패')
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
          <span className="text-sm text-foreground">배지 이름 *</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            placeholder="예: 한강 라이더"
          />
        </label>

        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-foreground">설명 *</span>
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
            placeholder="배지 설명을 입력하세요"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">타입 *</span>
          <Select value={type} onValueChange={(v) => setType(v as BadgeType)}>
            <SelectTrigger aria-label="타입">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={themeContainer ?? undefined}>
              {BADGE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{BADGE_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-foreground">희귀도 *</span>
          <Select value={rarity} onValueChange={(v) => setRarity(v as BadgeRarity)}>
            <SelectTrigger aria-label="희귀도">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RARITIES.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {/* 세계관/소속 컬렉션 — 체크인 배지에는 이 개념이 없어 숨긴다(티켓 20260830_1344).
            activity/item 타입에서는 기존과 동일하게 노출. */}
        {type !== 'checkin' && (
          <>
            {/* 세계관 선택 */}
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="text-sm text-foreground">소속 세계관</span>
              <Select
                value={factionId || NONE_VALUE}
                onValueChange={(v) => setFactionId(v === NONE_VALUE ? '' : v)}
              >
                <SelectTrigger aria-label="소속 세계관">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>— 없음 —</SelectItem>
                  {factions.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            {/* 소속 아이템북 */}
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="text-sm text-foreground">소속 컬렉션</span>
              <Select
                value={itemBookId || NONE_VALUE}
                onValueChange={(v) => setItemBookId(v === NONE_VALUE ? '' : v)}
              >
                <SelectTrigger aria-label="소속 컬렉션">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>— 없음 —</SelectItem>
                  {itemBooks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </>
        )}

        {/* 지점 카테고리 — 체크인 배지 전용(티켓 20260830_1344). poi_categories 재사용.
            값을 지정하면 연결된 지점의 카테고리보다 우선 적용돼 목록·배지함 분류 기준이
            된다(티켓 20260830_1522). */}
        {type === 'checkin' && (
          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="text-sm text-foreground">지점 카테고리</span>
            <Select
              value={category || NONE_VALUE}
              onValueChange={(v) => setCategory(v === NONE_VALUE ? '' : v)}
            >
              <SelectTrigger aria-label="지점 카테고리">
                <SelectValue placeholder="카테고리를 선택해주세요" />
              </SelectTrigger>
              <SelectContent container={themeContainer ?? undefined}>
                <SelectItem value={NONE_VALUE}>— 없음 —</SelectItem>
                {poiCategories.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              연결된 지점의 카테고리를 다시 지정하고 싶을 때 사용해요. 값을 정하면 이 배지는
              연결된 지점의 카테고리 대신 여기서 정한 카테고리로 분류돼요.
            </span>
          </label>
        )}

        {/* 아이템 배지 전용 설정 */}
        {type === 'item' && (
          <>
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="text-sm text-foreground">드랍 가중치 (0.1 ~ 10.0)</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={dropWeight}
                onChange={(e) => setDropWeight(e.target.value)}
                className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:border-primary/50"
              />
              {itemBookId && siblingWeightSum !== null && (
                (() => {
                  const own = parseFloat(dropWeight) || 0
                  const total = siblingWeightSum + own
                  const pct = total > 0 ? Math.round((own / total) * 1000) / 10 : 0
                  return (
                    <span className="text-xs text-muted-foreground">
                      같은 컬렉션·희귀도 내 다른 배지 {siblingWeightSum > 0 ? `(가중치 합 ${siblingWeightSum.toFixed(1)})` : ''}
                      {' '}대비 이 배지가 뽑힐 상대 확률 약 <strong className="text-foreground">{pct}%</strong>
                      {siblingWeightSum === 0 && ' (이 믹스의 첫 배지)'}
                    </span>
                  )
                })()
              )}
            </label>

          </>
        )}

        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-sm text-foreground">포인트 보상</span>
          <input
            type="number"
            min="0"
            value={pointReward}
            onChange={(e) => setPointReward(e.target.value)}
            className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 max-w-xs"
            placeholder="0"
          />
          <span className="text-xs text-muted-foreground">이 배지를 획득할 때 함께 지급되는 잼 포인트. 0이면 없음. 획득 시점 값으로 1회 지급되며, 이후 값을 바꿔도 이미 지급된 포인트는 소급 변경되지 않습니다.</span>
        </label>

        <div className="col-span-2">
          <ImageUploadField
            value={imageUrl}
            onChange={setImageUrl}
            onAverageColor={(color) => { if (color) setBackgroundColor(color) }}
            folder="badges"
            required
            label="배지 이미지"
            allowManualUrl={false}
          />
        </div>

        {/* 배경 쉐이더 임시 선택 (20260818_003) — 값만 저장, 상세화면 렌더링 미연결 */}
        <div className="col-span-2 flex flex-col gap-1.5">
          <span className="text-sm text-foreground">배경 쉐이더 (임시)</span>
          <Select
            value={backgroundShaderId || NONE_VALUE}
            onValueChange={(v) => setBackgroundShaderId(v === NONE_VALUE ? '' : v)}
          >
            <SelectTrigger className="max-w-xs" aria-label="배경 쉐이더">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BADGE_BACKGROUND_SHADER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value || NONE_VALUE}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">쉐이더는 아직 상세화면에 적용되지 않아요. 선택한 값은 저장만 되고 화면에는 반영되지 않아요.</span>
        </div>

        {/* 배경 테마 — 단색/제너레이터 배타 선택 + 실제 저장 연동 (20260819_007, 20260819_008,
            20260819_013에서 공용 컴포넌트로 분리) */}
        <div className="col-span-2">
          <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded" />}>
            <BackgroundGeneratorPreview
              ref={backgroundGeneratorRef}
              backgroundColor={backgroundColor}
              onBackgroundColorChange={setBackgroundColor}
              mode={backgroundMode}
              onModeChange={setBackgroundMode}
              initialBackgroundImageUrl={badge?.background_image_url ?? null}
              existingImageOption={{ label: '등록된 배지 이미지 사용', imageUrl }}
              renderPreview={({ themed, backgroundLayerStyle, backgroundLayerRef, liveNode }: BackgroundGeneratorLivePreviewState) => (
                <>
                  <BadgeDetailPreviewFrame
                    badge={{
                      image_url: imageUrl || null,
                      name: name || '(배지 이름 미입력)',
                      rarity,
                      description,
                      background_color: backgroundMode === 'color' ? backgroundColor || null : null,
                      background_shader_id: null,
                      background_image_url: null,
                    }}
                    themed={themed}
                    backgroundLayerStyle={backgroundLayerStyle}
                    backgroundLayerRef={backgroundLayerRef}
                    liveNode={liveNode}
                    conditionText={PREVIEW_CONDITION_TEXT}
                  />
                  <p className="text-xs text-muted-foreground mt-2 max-w-[430px]">
                    실제 배지 상세화면과 같은 구조로 보여줘요. 본문 문구는 예시라 실제 조건과 달라요.
                  </p>
                </>
              )}
            />
          </Suspense>
        </div>
      </div>

      {/* 활동 종류 */}
      <div>
        <p className="text-sm text-foreground mb-2">활동 종류 *</p>
        <div className="flex gap-3 flex-wrap">
          {ACTIVITY_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activityTypes.includes(t)}
                onChange={() => toggleActivityType(t)}
                className="accent-primary"
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
            className="accent-primary"
          />
          <span className="text-sm">패치 구매 가능</span>
        </label>
        {patchAvailable && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-foreground">패치 가격 (원)</span>
            <input
              type="number"
              value={patchPriceKrw}
              onChange={(e) => setPatchPriceKrw(e.target.value)}
              className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 max-w-xs"
              placeholder="예: 9900"
            />
          </label>
        )}
      </div>

      {/* condition_json 빌더 (activity + item 공통 — 체크인 배지는 조건 대신 연결 지점으로 판정) */}
      {type !== 'checkin' && (
        <div className="border border-border rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground">
            {type === 'item' ? '드랍 조건 (condition_json)' : '획득 조건 (condition_json)'}
          </p>
          {type === 'item' && (
            <p className="text-xs text-muted-foreground">조건을 설정하면 해당 조건을 충족한 유저에게만 이 배지가 드랍 풀에 포함됩니다. 설정하지 않으면 모든 유저에게 드랍 가능.</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">최소 거리 (km)</span>
              <input
                type="number"
                step="0.1"
                value={condDistanceKm}
                onChange={(e) => setCondDistanceKm(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 30"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">누적 활동 횟수</span>
              <input
                type="number"
                value={condTotalCount}
                onChange={(e) => setCondTotalCount(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 10"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">고도 상승 누적 (m)</span>
              <input
                type="number"
                value={condElevationM}
                onChange={(e) => setCondElevationM(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 500"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">최소 속도 (km/h)</span>
              <input
                type="number"
                step="0.1"
                value={condMinSpeedKmh}
                onChange={(e) => setCondMinSpeedKmh(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 25"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">최대 페이스 (mm:ss/km, 러닝 계열용)</span>
              <input
                type="text"
                value={condMaxPace}
                onChange={(e) => setCondMaxPace(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 5:30 (값이 작을수록 빠름)"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">연속 활동 일수</span>
              <input
                type="number"
                value={condStreakDays}
                onChange={(e) => setCondStreakDays(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 7"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">활동 종류 (조건)</span>
              <Select
                value={condActivityType || NONE_VALUE}
                onValueChange={(v) => setCondActivityType(v === NONE_VALUE ? '' : v)}
              >
                <SelectTrigger aria-label="활동 종류 (조건)">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>— 전체 —</SelectItem>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">단일 활동 최소 이동 시간 (분)</span>
              <input
                type="number"
                value={condDurationMinutes}
                onChange={(e) => setCondDurationMinutes(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">주말 활동 최소 이동 시간 (시간)</span>
              <input
                type="number"
                step="0.5"
                value={condWeekendDurationHours}
                onChange={(e) => setCondWeekendDurationHours(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 2"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">한 주 내 최소 활동 횟수</span>
              <input
                type="number"
                value={condWeeklyCount}
                onChange={(e) => setCondWeeklyCount(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 3"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">특정 월 (1~12)</span>
              <input
                type="number"
                min="1"
                max="12"
                value={condMonth}
                onChange={(e) => setCondMonth(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 8"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">월 누적 거리 (km)</span>
              <input
                type="number"
                step="0.1"
                value={condMonthlyKm}
                onChange={(e) => setCondMonthlyKm(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 100"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">계절 활동 횟수</span>
              <input
                type="number"
                value={condSeasonCount}
                onChange={(e) => setCondSeasonCount(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 5"
              />
            </label>
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="text-xs text-muted-foreground">계절</span>
              <Select
                value={condSeason || NONE_VALUE}
                onValueChange={(v) => setCondSeason(v === NONE_VALUE ? '' : v)}
              >
                <SelectTrigger aria-label="계절">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>— 없음 —</SelectItem>
                  <SelectItem value="spring">봄 (3~5월)</SelectItem>
                  <SelectItem value="summer">여름 (6~8월)</SelectItem>
                  <SelectItem value="fall">가을 (9~11월)</SelectItem>
                  <SelectItem value="winter">겨울 (12~2월)</SelectItem>
                  <SelectItem value="all">전 계절</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">최저 기온 조건 (°C 이상 · 폭염)</span>
              <input
                type="number"
                step="0.1"
                value={condTempMinC}
                onChange={(e) => setCondTempMinC(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 30"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">최고 기온 조건 (°C 이하 · 한파)</span>
              <input
                type="number"
                step="0.1"
                value={condTempMaxC}
                onChange={(e) => setCondTempMaxC(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="예: 0"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">활동 시작 시간대 — 시작 (HH:MM)</span>
              <input
                type="time"
                value={condTimeStart}
                onChange={(e) => setCondTimeStart(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">활동 시작 시간대 — 종료 (HH:MM)</span>
              <input
                type="time"
                value={condTimeEnd}
                onChange={(e) => setCondTimeEnd(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            시간대는 자정을 넘겨 설정 가능합니다 (예: 22:00~05:00 심야). 종료 시각이 시작보다 이르면 익일로 해석됩니다.
          </p>

          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="text-xs text-muted-foreground">선행 배지 이름 (쉼표 구분)</span>
            <input
              value={condPrerequisiteNames}
              onChange={(e) => setCondPrerequisiteNames(e.target.value)}
              className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              placeholder="예: 첫 페달, 아스팔트 입문 (Rare 이상에만 설정)"
            />
            <span className="text-xs text-muted-foreground">이 배지를 받으려면 나열된 배지 중 하나를 먼저 보유해야 합니다.</span>
          </label>

          {/* 메타데이터 필드 — 위 조건 필드들과 성격이 다르다(발급 판정에 관여하지 않음)는 것을
              시각적으로도 드러내기 위해 별도 색상 박스로 구분한다 (티켓 20260825_031) */}
          <label className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={condMissionReward}
              onChange={(e) => setCondMissionReward(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber-600"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-amber-900">미션 보상 배지 (mission_reward)</span>
              <span className="text-xs text-amber-800/80">
                미션 완료 시에만 지급되는 배지예요. 일반 배지 엔진 평가 대상이 아니며, 위 조건
                필드는 이 배지의 획득 여부에 영향을 주지 않아요.
              </span>
            </span>
          </label>

          {/* 폼 미지원 조건 필드 안내 — 값은 저장 시 원본 그대로 보존되지만 이 폼에서
              보거나 고칠 수 없다는 걸 알린다(티켓 20260825_032) */}
          {unsupportedConditionKeys.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">이 폼에서 다룰 수 없는 조건 필드가 있어요</p>
              <p className="text-xs text-amber-800/80 mt-0.5">
                {unsupportedConditionKeys.join(', ')} 값이 이미 설정돼 있어요. 이 화면에는 입력 항목이
                없어 여기서 보거나 고칠 수 없지만, 저장해도 값은 그대로 유지돼요.
              </p>
            </div>
          )}

          <div className="bg-muted border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-1.5">JSON 미리보기</p>
            <pre className="text-xs text-foreground/80 font-mono overflow-x-auto">
              {condPreview ? JSON.stringify(condPreview, null, 2) : 'null (조건 없음)'}
            </pre>
          </div>
        </div>
      )}

      {/* 연결된 지점 (checkin 타입 전용) */}
      {type === 'checkin' && (
        <div className="border border-border rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">연결된 지점</p>
            <p className="text-xs text-muted-foreground mt-1">
              여기에 연결한 지점 반경을 액티비티 GPS 경로가 지나가면 이 배지를 획득합니다. 여러 개 연결할 수 있고,
              체크인할 때마다 반복 획득됩니다. 판정 반경은 각 지점에 등록된 값을 그대로 사용합니다.
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
              className="flex-1 bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              placeholder="등록된 지점 이름으로 검색 (예: 대림창고)"
            />
            <button
              type="button"
              onClick={searchPois}
              disabled={poiSearching || !poiQuery.trim()}
              className="bg-primary text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
            >
              {poiSearching ? '검색 중...' : '검색'}
            </button>
          </div>

          {/* 검색 결과 */}
          {poiSearched && (
            <div className="border border-border rounded-xl overflow-hidden">
              {poiResults.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">검색 결과가 없습니다.</p>
              ) : (
                <ul className="max-h-64 overflow-y-auto divide-y divide-border">
                  {poiResults.map((poi) => {
                    const already = linkedPois.some((p) => p.id === poi.id)
                    const linkedElsewhere =
                      !!poi.linked_badge_id && poi.linked_badge_id !== (badge?.id ?? '')
                    return (
                      <li key={poi.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{poi.name}</p>
                          <p className="text-xs text-muted-foreground">
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
                          className="text-sm px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-white transition-colors shrink-0"
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
            <p className="text-xs text-muted-foreground mb-2">연결된 지점 {linkedPois.length}개</p>
            {linkedPois.length === 0 ? (
              <div className="bg-muted border border-border rounded-xl px-4 py-5 text-center">
                <p className="text-sm text-muted-foreground">아직 연결된 지점이 없습니다. 위에서 검색해 추가하세요.</p>
              </div>
            ) : (
              <div className="bg-white border border-border rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-left">
                      <th className="px-4 py-2.5 font-medium">이름</th>
                      <th className="px-4 py-2.5 font-medium">카테고리</th>
                      <th className="px-4 py-2.5 font-medium">반경</th>
                      <th className="px-4 py-2.5 font-medium w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedPois.map((poi) => (
                      <tr key={poi.id} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-2.5 text-foreground">{poi.name}</td>
                        <td className="px-4 py-2.5 text-foreground text-xs">{poi.category}</td>
                        <td className="px-4 py-2.5 text-foreground text-xs">{poi.radius_meters}m</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeLinkedPoi(poi.id)}
                            aria-label={`${poi.name} 연결 해제`}
                            className="text-muted-foreground hover:text-red-600 transition-colors px-1.5"
                          >
                            <IconX className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              반경 수정은 POI 관리 화면에서 할 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* 유효 기간 (공통) */}
      <div className="border border-border rounded-2xl p-5 space-y-4">
        <p className="text-sm font-semibold text-foreground">유효 기간</p>
        <p className="text-xs text-muted-foreground">
          {type === 'item'
            ? '설정하면 해당 기간에만 드랍되며, 획득된 배지의 만료일은 종료일로 자동 설정됩니다. 설정하지 않으면 상시 드랍 / 만료 없음.'
            : '설정하면 해당 기간에만 획득 조건이 평가됩니다. 기간 외 액티비티 싱크에서는 이 배지가 건너뛰어집니다. 설정하지 않으면 상시 평가.'}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">시작일 (yyyy-mm-dd)</span>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">종료일 (yyyy-mm-dd)</span>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              min={validFrom || undefined}
              className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </label>
        </div>
        {(validFrom || validUntil) && (
          <button
            type="button"
            onClick={() => { setValidFrom(''); setValidUntil('') }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            기간 설정 초기화
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '배지 등록'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/badges')}
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
            <h3 className="text-lg font-bold mb-2">배지 삭제</h3>
            <p className="text-muted-foreground text-sm mb-5">
              &apos;{badge?.name}&apos; 배지를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '삭제 중...' : '삭제 확인'}
              </button>
              <button
                type="button"
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
