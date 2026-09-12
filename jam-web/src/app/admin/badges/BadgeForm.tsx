'use client'

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { IconX } from '@tabler/icons-react'
import type { BadgeRow, BadgeCondition, ActivityType, BadgeType, BadgeRarity, TribeRow, ItemBookRow } from '@/types/database'
import ImageUploadField from '@/components/admin/ImageUploadField'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Switch } from '@/components/admin/ui/switch'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import BackgroundGeneratorPreview from './BackgroundGeneratorPreview'
import BadgeRailPreview from './BadgeRailPreview'
import BadgeConditionSection, { conditionControlDomId } from './BadgeConditionSection'
import { FieldLabel, FieldMessage, SegmentedControl, SuffixInput } from './BadgeFormControls'
import {
  BadgeEditorShell,
  BadgeSectionCard,
  BadgeSectionNav,
  FIELD_GRID_CLASS,
  RAIL_ACTIONS_CLASS,
  RailCard,
  fieldSpanClass,
} from '@/components/admin/badges/BadgeEditorLayout'
import { parseBlobAnimation, type BlobAnimationParams } from '@/lib/blobAnimation'
import { cn } from '@/lib/utils'
import {
  buildConditionJsonFromFields,
  conditionFormFieldsFrom,
  findUnrepresentableConditionKeys,
  getUnsupportedConditionKeys,
  type ConditionFormFields,
} from './conditionFormFields'
import { BADGE_TYPE_LABEL } from '@/lib/admin/badge-labels'
import {
  ADMIN_ACTIVITY_TYPES,
  ADMIN_ACTIVITY_TYPE_LABEL,
  BADGE_TYPE_SEGMENTS,
  badgeSectionDescription,
  badgeSectionTitle,
  computeBadgeSectionStatuses,
  conditionSummaryChips,
  isActivityTypeRequiredMissing,
  previewConditionText,
  visibleBadgeSections,
  type BadgeSectionId,
} from '@/lib/admin/badge-sections'
// 조건 입력 UI는 **레지스트리 선언에서 생성한다**(티켓 20260905_0032 A-2) — 그리는 쪽은
// BadgeConditionSection.tsx다. 여기서는 짝 필드 판정에 필드 메타만 읽는다.
import { CONDITION_FORM_SECTIONS, conditionFormEntriesOf, findBlockingConditionKeys, getConditionField } from '@/lib/badge-engine/conditionRegistry'
// 등급형/레벨형 판정은 여기 한 곳에만 있다 — 다시 선언하지 않는다(티켓 20260905_0030).
import { isLeveledBadge } from '@/lib/badge-engine/badgeKind'
// 저장 API가 쓰는 것과 **같은 판정·같은 문구**. 서버 전용 의존(drop-engine → next/headers)이
// 없는 파일로 갈라 두었기에 클라이언트 컴포넌트에서 그대로 쓸 수 있다.
import { findConditionShapeSaveError, findRarityLevelError } from '@/lib/admin/badge-condition-guards'
// 배지 트리 화면(BadgeTreeClient 등)의 진행률 분류와 동일한 함수 — 어드민 경고가 화면
// 렌더링과 다른 판정 로직을 갖지 않도록 재사용한다(제안서 §08 H, 티켓 20260904_1426).
// `next/headers` 등 서버 전용 의존을 물지 않는 순수 함수라 이 클라이언트 컴포넌트에서
// 값(value) import로 바로 써도 안전하다(티켓 20260904_0921 게이트 리뷰에서 `npm run build`로 실증됨).
import { explainUnsupportedProgress } from '@/lib/badge-engine/badgeProgress'
// 드랍 엔진 본체는 서버 전용이라 import할 수 없다 — 의존 없는 목록 모듈만 가져온다.
import { CUMULATIVE_CONDITION_FIELDS } from '@/lib/drop-engine/cumulativeConditionFields'

const RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']
const RARITY_LABEL: Record<BadgeRarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic' }

/** 아이템 배지엔 이 필드들을 설정할 수 없다 — 설정하면 드랍 엔진의 hasCumulativeCondition()이
 *  항상 true가 되어 영원히 드랍 후보에서 제외된다. 드랍 엔진·저장 검증과 **같은 배열**을 쓴다
 *  (예전에는 5개만 복제해 둬서 엔진의 11개와 어긋났다, 티켓 20260911_0901 D-2). */
const CUMULATIVE_CONDITION_KEYS = CUMULATIVE_CONDITION_FIELDS
const ITEM_BLOCKED_KEYS: ReadonlySet<string> = new Set(CUMULATIVE_CONDITION_KEYS)
const NO_BLOCKED_KEYS: ReadonlySet<string> = new Set()

/**
 * 필드 옆에 바로 알리는 필드 간 제약(티켓 20260911_0901). **저장을 막는 최종 판정은 기존
 * 검증(`validateCondition`·서버)이다** — 여기서는 그 검증이 막을 조합을 입력 즉시 보여 줄 뿐이다.
 * 짝이 되는 필드는 레지스트리의 `pairedWith`에서 읽는다(하나라도 있으면 통과, OR).
 * 넷 다 기존 검증이 실제로 저장을 막는 조합이다 — 앞의 셋과 personal_record_break는
 * `PAIR_ENFORCED_CONDITION_KEYS`, season_count는 아래 `validateCondition`의 계절 짝 검사.
 */
const FIELD_PAIR_MESSAGES: Partial<Record<keyof BadgeCondition, string>> = {
  rest_after_streak: '누적 목표의 연속 활동 일수를 함께 입력해야 저장할 수 있어요.',
  rest_after_long: '한 번의 거리나 한 번의 이동시간 중 하나를 함께 입력해야 저장할 수 있어요.',
  season_count: '대상 활동에서 계절을 함께 골라야 저장할 수 있어요.',
  personal_record_break: '비교 지표를 함께 골라야 저장할 수 있어요.',
}

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
  tribes: Pick<TribeRow, 'id' | 'name'>[]
  itemBooks: Pick<ItemBookRow, 'id' | 'name'>[]
  /** 체크인 배지 전용 "지점 카테고리" Select 옵션 — poi_categories 재사용(마이그레이션 113).
   *  값을 지정하면 연결된 지점의 카테고리보다 우선 적용된다(티켓 20260830_1522). */
  poiCategories: { slug: string; label: string }[]
  /** 페이지 제목·뒤로 가기 — 섹션 열 위에 둔다(레일은 페이지 맨 위에서 시작, BadgeEditorShell 주석) */
  header?: ReactNode
}

const EMPTY_CONDITION: BadgeCondition = {}

// Radix Select는 SelectItem value=""를 허용하지 않는다 — "선택 안 함"을 나타내는 전용 값.
const NONE_VALUE = '__none__'

/** 저장 시 누락 필드로 포커스를 옮길 때 쓰는 DOM id */
const FOCUS_ID = {
  activityTypes: `badge-activity-type-${ADMIN_ACTIVITY_TYPES[0]}`,
  name: 'badge-name',
  description: 'badge-description',
  image: 'badge-image-field',
} as const

export default function BadgeForm({ badge, tribes, itemBooks, poiCategories, header }: BadgeFormProps) {
  const router = useRouter()
  const isEdit = !!badge

  // Select 드롭다운(Radix Portal)은 기본적으로 document.body에 렌더링되는데, shadcn 어드민
  // 테마 실값은 [data-admin-theme] 스코프 안에만 존재한다(globals.css 참고). 포털 컨테이너를
  // 그 스코프 노드로 지정해야 테마 색이 정상 적용된다 — sidebar.tsx의 동일 패턴 재사용
  // (20260826_016, 인프라 1-2).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const [name, setName] = useState(badge?.name ?? '')
  const [description, setDescription] = useState(badge?.description ?? '')
  const [type, setType] = useState<BadgeType>(badge?.type ?? 'activity')
  // 등급형과 레벨형은 **배타**다(마이그레이션 130의 badges_rarity_level_exclusive).
  // 종류 판정은 badgeKind.ts의 `isLeveledBadge` 하나만 쓴다 — 여기서 다시 선언하지 않는다
  // (티켓 20260905_0032 A-3).
  const [leveledKind, setLeveledKind] = useState<boolean>(() => (badge ? isLeveledBadge(badge) : false))
  const [rarity, setRarity] = useState<BadgeRarity>(badge?.rarity ?? 'common')
  const [level, setLevel] = useState<string>(badge?.level?.toString() ?? '1')
  // 레벨형은 활동 배지 전용이다 — 타입을 바꾸면 종류 state를 건드리지 않고 «파생값»에서만
  // 등급형으로 되돌린다(되돌아올 때 사용자가 고른 값이 그대로 살아 있어야 한다).
  const isLeveled = type === 'activity' && leveledKind
  const [imageUrl, setImageUrl] = useState(badge?.image_url ?? '')
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>(badge?.activity_types ?? [])
  const [patchAvailable, setPatchAvailable] = useState(badge?.patch_available ?? false)
  const [patchPriceKrw, setPatchPriceKrw] = useState<string>(badge?.patch_price_krw?.toString() ?? '')
  const [pointReward, setPointReward] = useState<string>(badge?.point_reward?.toString() ?? '0')
  // 배경 테마 — background_color: 배경색(피커+hex, 이미지 업로드 시 평균 컬러 자동 프리필).
  const [backgroundColor, setBackgroundColor] = useState<string>(badge?.background_color ?? '')
  // [20260901_1944] 배경색과 배타인 애니메이션 모드. null이면 배경색 모드다.
  const [backgroundAnimation, setBackgroundAnimation] = useState<BlobAnimationParams | null>(() =>
    parseBlobAnimation(badge?.background_animation)
  )

  // condition_json builder state — **레지스트리에서 파생한다**(티켓 20260905_0032 A-2).
  const initCond = (badge?.condition_json as BadgeCondition) ?? EMPTY_CONDITION
  const [condFields, setCondFields] = useState<ConditionFormFields>(() => conditionFormFieldsFrom(initCond))
  const setCondField = useCallback((field: string, value: string | boolean) => {
    setCondFields((prev) => ({ ...prev, [field]: value }))
  }, [])
  // 폼이 입력 UI를 갖지 않는 조건 필드(day_of_week 등) — 값이 있으면 저장 시 원본 그대로
  // 보존되지만 이 폼에서 보거나 고칠 수는 없다는 걸 안내한다(티켓 20260825_032).
  const unsupportedConditionKeys = getUnsupportedConditionKeys(initCond)
  // 폼 지원 필드인데도 **왕복이 성립하지 않는** 값 — 저장하면 바뀌거나 사라진다.
  const unrepresentableConditionKeys = findUnrepresentableConditionKeys(initCond)

  const [tribeId, setTribeId] = useState(badge?.tribe_id ?? '')
  const [itemBookId, setItemBookId] = useState(badge?.item_book_id ?? '')
  const [category, setCategory] = useState(badge?.category ?? '')
  // 어드민 전용 분류(JAM! 카테고리) — 위 category(지점 카테고리)와 달리 type과 무관하게
  // 저장된다(티켓 20260910_2055). 단 타입을 activity 밖으로 바꾸면 비운다(아래 changeType).
  const [adminCategory, setAdminCategory] = useState(badge?.admin_category ?? '')
  // 지도 드롭메뉴 마커 노출 여부(마이그레이션 166, 티켓 20260912_1053) — 체크인 배지 전용
  // 옵션. 기본값 ON(신규 생성 시 노출).
  const [showOnMap, setShowOnMap] = useState<boolean>(badge?.show_on_map ?? true)
  // JAM! 카테고리는 condition_json을 서비스 사용량 지표(usageBadges.ts)로만 판정한다 —
  // 일반 조건 그룹·2단 게이트·판정 시뮬레이션이 전부 무의미해 화면에서 숨긴다(티켓 20260911_0202).
  const isJamCategory = adminCategory === 'jam'
  const isJamActivity = type === 'activity' && isJamCategory
  const [dropWeight, setDropWeight] = useState<string>(badge?.drop_weight?.toString() ?? '1.0')
  const toDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')
  const [validFrom, setValidFrom] = useState<string>(toDateInput(badge?.valid_from))
  const [validUntil, setValidUntil] = useState<string>(toDateInput(badge?.valid_until))

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // 저장을 한 번 눌러 누락이 드러난 뒤부터 누락 필드에 빨간 안내·aria-invalid를 붙인다.
  // 누락 여부 자체는 매 렌더 다시 계산하므로 고치는 즉시 표시가 사라진다.
  const [showValidation, setShowValidation] = useState(false)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)

  // ── 아이템 배지: 같은 북+희귀도 내 drop_weight 상대 확률 미리보기 ──────
  // 20260827_020: 미리보기가 의미를 갖는 조건(아이템 타입 + 컬렉션 선택)이 아닐 때의 null은
  // 파생값으로 둔다(react-hooks/set-state-in-effect).
  const [fetchedSiblingWeightSum, setFetchedSiblingWeightSum] = useState<number | null>(null)
  const siblingWeightSum = type === 'item' && itemBookId ? fetchedSiblingWeightSum : null
  useEffect(() => {
    if (type !== 'item' || !itemBookId) return
    let cancelled = false
    ;(async () => {
      try {
        // 티켓 20260906_1422: 서버에서 조건에 맞는 합계만 계산해 받는다.
        const params = new URLSearchParams({ item_book_id: itemBookId, rarity })
        if (badge?.id) params.set('excludeId', badge.id)
        const res = await fetch(`/api/admin/badges/sibling-weight?${params.toString()}`)
        const data = await res.json()
        if (!res.ok || cancelled) return
        if (!cancelled) setFetchedSiblingWeightSum(data.sum ?? 0)
      } catch {
        if (!cancelled) setFetchedSiblingWeightSum(null)
      }
    })()
    return () => {
      cancelled = true
    }
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
  const poiCategoryLabel = (slug: string) => poiCategories.find((c) => c.slug === slug)?.label ?? slug

  const buildConditionJson = (): BadgeCondition | null => buildConditionJsonFromFields(condFields, initCond)

  // 타입 전환 — activity가 아닌 타입으로 바뀌면 JAM!(admin_category='jam')을 비운다.
  // 그대로 두면 JAM! 체크박스가 activity 전용이라 되돌릴 UI가 사라진다(티켓 20260911_0233 해소).
  const changeType = (next: BadgeType) => {
    setType(next)
    if (next !== 'activity') setAdminCategory('')
    // 아이템에서는 발급 방식 전환이 숨겨진다. `{mission_reward: true}`는 드랍 엔진에서 「평가할
    // 수 있는 조건 없음」으로 판정돼 영구히 드랍되지 않는데 서버 검증도 막지 않으므로, 액티비티에서
    // 켜 둔 값이 숨은 채 따라가지 않게 비운다(티켓 20260911_0901 D-1).
    if (next === 'item') setCondField('missionReward', false)
  }

  const toggleActivityType = (t: ActivityType) => {
    setActivityTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
    // 종목과 JAM!(어드민 전용 분류)은 상호배타다 — 종목을 고르면 JAM!을 비운다(티켓 20260910_2258).
    setAdminCategory((prev) => (prev === 'jam' ? '' : prev))
  }

  // JAM!(admin_category='jam')도 분류 태그 안에서 여섯 번째 종류처럼 고른다.
  // 종목과 상호배타라 선택하면 기존 종목 선택을 비운다(티켓 20260910_2258).
  const toggleAdminCategoryJam = () => {
    const turningOn = adminCategory !== 'jam'
    setAdminCategory(turningOn ? 'jam' : '')
    setActivityTypes((prev) => (prev.length > 0 ? [] : prev))
    // JAM!에서는 연결 정보 섹션이 숨겨진다. 트라이브·컬렉션은 액티비티 배지의 발급 판정에 쓰이지
    // 않지만, 화면에 보이지 않는 값이 DB에 남지 않도록 JAM!을 켜는 순간 비운다(티켓 20260911_0901 D-3).
    if (turningOn) {
      setTribeId('')
      setItemBookId('')
    }
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
    const { timeStart, timeEnd } = condFields
    if (timeStart || timeEnd) {
      if (!timeStart || !timeEnd) {
        return '시간대 조건은 시작·종료 시각을 모두 입력해야 합니다.'
      }
      if (!hhmm.test(timeStart) || !hhmm.test(timeEnd)) {
        return '시간대 조건의 시각은 HH:MM 형식이어야 합니다. (예: 05:30)'
      }
    }
    // 「저장은 되는데 영원히 안 나오는 배지」 3경로 — 저장 API와 **같은 함수·같은 문구**다.
    return findConditionShapeSaveError({ name, family_key: badge?.family_key ?? null }, cond)
  }

  const condPreview = buildConditionJson()

  // ── 필드 옆 안내·누락 판정 ─────────────────────────────────────────────

  // 조건 그룹이 화면에 있는 경우만 필드 옆 안내를 계산한다(체크인은 섹션 자체가 없고, JAM!은
  // 사용량 지표 그룹만 보여 해당 입력이 화면에 없다).
  const conditionGroupsVisible = type !== 'checkin' && !isJamActivity
  const fieldErrors: Record<string, string> = {}
  if (conditionGroupsVisible && condPreview) {
    for (const [key, message] of Object.entries(FIELD_PAIR_MESSAGES)) {
      const meta = getConditionField(key)
      const controlField = meta?.form?.controls?.[0]?.field
      if (!meta || !controlField || condPreview[meta.key] === undefined) continue
      const paired = (meta.pairedWith ?? []).some((p) => condPreview[p] !== undefined)
      if (!paired && message) fieldErrors[controlField] = message
    }
  }
  const blockedKeys = type === 'item' ? ITEM_BLOCKED_KEYS : NO_BLOCKED_KEYS

  const activityTypeMissing = isActivityTypeRequiredMissing({ type, isJam: isJamCategory, activityTypeCount: activityTypes.length })

  /** 저장 전 누락 목록 — 화면 위에서 아래 순서(분류 → 기본 정보 → 조건 → 디자인) */
  const collectMissing = (): { key: string; focusId: string }[] => {
    const list: { key: string; focusId: string }[] = []
    if (activityTypeMissing) list.push({ key: 'activityTypes', focusId: FOCUS_ID.activityTypes })
    if (!name.trim()) list.push({ key: 'name', focusId: FOCUS_ID.name })
    if (!description.trim()) list.push({ key: 'description', focusId: FOCUS_ID.description })
    if (conditionGroupsVisible) {
      // 조건 그룹 화면 순서대로 — 필드 간 제약 위반과 아이템에 쓸 수 없는 누적 조건
      for (const section of CONDITION_FORM_SECTIONS) {
        for (const entry of conditionFormEntriesOf(section)) {
          const field = entry.control.field
          const blockedWithValue = blockedKeys.has(entry.meta.key) && condPreview?.[entry.meta.key] !== undefined
          if (fieldErrors[field] || blockedWithValue) list.push({ key: `cond:${field}`, focusId: conditionControlDomId(field) })
        }
      }
    }
    if (!imageUrl) list.push({ key: 'image', focusId: FOCUS_ID.image })
    return list
  }
  const missingKeys = showValidation ? new Set(collectMissing().map((m) => m.key)) : new Set<string>()
  const invalidCondFields = new Set(
    [...missingKeys].filter((k) => k.startsWith('cond:')).map((k) => k.slice('cond:'.length))
  )

  /** 누락 필드로 이동 — 접힌 조건 그룹이면 먼저 펼친다(onToggle이 그룹 state를 맞춘다) */
  const focusMissing = (focusId: string) => {
    const el = document.getElementById(focusId)
    if (!el) return
    const details = el.closest('details')
    if (details && !details.open) details.open = true
    const focusable = el.matches('input, textarea, button, [tabindex]')
      ? el
      : el.querySelector<HTMLElement>('button, input, textarea')
    requestAnimationFrame(() => {
      focusable?.focus({ preventScroll: true })
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // 필수 누락(분류·이름·설명·이미지)과 필드 간 제약 — 개수를 알리고 첫 항목으로 이동한다.
    // 이미지는 파일 업로드로만 등록하므로(20260818_002) 브라우저 기본 required 검증이 없다.
    const missing = collectMissing()
    if (missing.length > 0) {
      setShowValidation(true)
      setSaveNotice(`고칠 곳이 ${missing.length}군데 있어요. 첫 번째 항목으로 이동했어요.`)
      focusMissing(missing[0].focusId)
      return
    }
    setSaveNotice(null)

    // 등급형/레벨형 배타 — 저장 API와 **같은 함수·같은 문구**로 먼저 막는다(티켓 20260905_0032 A-3).
    const rarityLevelError = findRarityLevelError(isLeveled ? null : rarity, isLeveled ? level : null)
    if (rarityLevelError) {
      setError(rarityLevelError)
      return
    }

    // 체크인 배지는 활동 조건을 쓰지 않는다 — 조건 빌더 값이 남아 있어도 무시. JAM! 카테고리는
    // 조건 그룹 대부분을 숨기지만 condition_json 저장 방식은 바꾸지 않는다 — 숨긴 입력값도
    // condFields에 그대로 남아 buildConditionJson() 결과가 리뉴얼 전과 같다.
    const conditionJson = type === 'checkin' ? null : buildConditionJson()
    const condError = validateCondition(conditionJson)
    if (condError) {
      setError(condError)
      return
    }

    // 애니메이션 모드에서는 배경색 입력란이 화면에 없다 — 보이지 않는 값 때문에 저장이 막히지
    // 않도록 배경색 모드일 때만 검증한다(20260901_1944).
    const trimmedBackgroundColor = backgroundColor.trim()
    if (!backgroundAnimation && trimmedBackgroundColor && !HEX_COLOR_PATTERN.test(trimmedBackgroundColor)) {
      setError('배경색 형식이 올바르지 않아요. #1a1a1a처럼 #으로 시작하는 6자리 hex 값을 입력해주세요.')
      return
    }

    setLoading(true)

    try {
      const body = {
        name,
        description,
        type,
        // 레벨형은 등급이 없다(rarity IS NULL) — 둘을 함께 보내면 CHECK 위반이다.
        rarity: isLeveled ? null : rarity,
        level: isLeveled ? parseInt(level, 10) : null,
        image_url: imageUrl,
        activity_types: activityTypes,
        patch_available: patchAvailable,
        patch_price_krw: patchAvailable && patchPriceKrw ? Math.max(0, parseInt(patchPriceKrw, 10) || 0) : null,
        condition_json: conditionJson,
        // 체크인 배지는 트라이브/컬렉션 개념이 없다 — UI는 숨겼지만 기존 값이 남아있을 수 있으므로
        // 저장 시점에 명시적으로 null 처리한다(티켓 20260830_1344). JAM! 배지는 연결 정보 섹션을
        // 숨기고, JAM!을 켜는 순간 toggleAdminCategoryJam이 트라이브·컬렉션을 비운다(티켓 20260911_0901 D-3).
        tribe_id: type === 'checkin' ? null : tribeId || null,
        item_book_id: type === 'checkin' ? null : itemBookId || null,
        // 지점 카테고리는 체크인 배지 전용 — 다른 타입에서는 항상 null.
        category: type === 'checkin' ? category || null : null,
        // 어드민 전용 분류(JAM! 카테고리)는 위 category와 달리 type과 무관하게 저장한다
        // (티켓 20260910_2055).
        admin_category: adminCategory || null,
        // 지도 드롭메뉴 마커 노출 여부는 체크인 배지 전용 옵션이나, 다른 타입에는 저장 API가
        // 어차피 마커 조회에 쓰지 않으므로 값 그대로 보낸다(티켓 20260912_1053).
        show_on_map: showOnMap,
        drop_weight: type === 'item' ? parseFloat(dropWeight) : 1.0,
        valid_from: validFrom ? new Date(validFrom).toISOString() : null,
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        point_reward: Math.max(0, parseInt(pointReward, 10) || 0),
        // background_shader_id/background_image_url/background_video_url은 보내지 않는다
        // (티켓 20260901_1929) — 저장 API는 누락된 필드를 기존 DB 값 그대로 둔다.
        // [20260901_1944] 애니메이션 모드에서는 배경색 검증을 건너뛰므로 hex가 아닌 값은 null로 정리한다.
        background_color: HEX_COLOR_PATTERN.test(trimmedBackgroundColor) ? trimmedBackgroundColor : null,
        // 배경색과 배타 — 애니메이션 모드가 아니면 명시적으로 null을 보내 해제가 저장되게 한다.
        background_animation: backgroundAnimation,
      }

      const res = await fetch(isEdit ? `/api/admin/badges/${badge.id}` : '/api/admin/badges', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
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

  // §08 H(진행 미지원 고지) 어드민 절반 — 배지 트리 화면(`/badges/tree`)이 실제로 조회하는
  // 대상은 `type: 'activity'` 배지뿐이다. JAM! 카테고리도 activity_types=[]로 저장되는 설계라
  // 배지 트리에 노출되지 않아 제외한다(티켓 20260904_1426, 20260911_0202).
  const progressIssue = type === 'activity' && !isJamCategory ? explainUnsupportedProgress(condPreview ?? {}) : null

  // 「평가 대기」 — 레지스트리에 선언은 됐지만 엔진이 아직 평가하지 않는 필드가 든 조건은
  // fail-closed로 막힌다. 저장은 되지만 **발급은 되지 않는다**는 걸 화면에서 알린다.
  const pendingConditionKeys = findBlockingConditionKeys(condPreview).pending

  // ── 섹션 상태·미리보기 ─────────────────────────────────────────────────

  const sectionCtx = { type, isJam: isJamCategory }
  const sections = visibleBadgeSections(sectionCtx)
  const statuses = computeBadgeSectionStatuses({
    ...sectionCtx,
    activityTypeCount: activityTypes.length,
    name,
    description,
    conditionCount: conditionSummaryChips(condPreview).length,
    missionReward: condFields.missionReward,
    tribeId: tribeId || null,
    itemBookId: itemBookId || null,
    poiCount: linkedPois.length,
    pointReward: parseInt(pointReward, 10) || 0,
    patchAvailable,
    hasPeriod: Boolean(validFrom || validUntil),
    imageUrl: imageUrl || null,
    hasAnimation: backgroundAnimation !== null,
    hasBackgroundColor: Boolean(backgroundColor.trim()),
  })
  const sectionHeader = (id: BadgeSectionId) => ({
    id,
    title: badgeSectionTitle(id, sectionCtx),
    description: badgeSectionDescription(id, sectionCtx),
    status: statuses[id],
  })

  const conditionText = previewConditionText({
    type,
    isJam: isJamCategory,
    condition: type === 'checkin' ? null : condPreview,
    poiNames: linkedPois.map((p) => p.name),
  })

  const nameInvalid = missingKeys.has('name')
  const descriptionInvalid = missingKeys.has('description')
  const activityTypesInvalid = missingKeys.has('activityTypes')
  const imageInvalid = missingKeys.has('image')

  // ── 섹션 본문 ─────────────────────────────────────────────────────────

  const classSection = (
    <BadgeSectionCard {...sectionHeader('class')}>
      <SegmentedControl
        label="배지 타입"
        wide
        value={type}
        options={BADGE_TYPE_SEGMENTS.map((s) => ({ value: s.value, label: BADGE_TYPE_LABEL[s.value], description: s.description }))}
        onChange={changeType}
      />

      {/* 분류 — JAM!(어드민 전용 분류)도 여섯 번째 태그로 둔다. 유저에게는 보이지 않고 어드민
          화면에서만 구분에 쓴다. 종목과는 상호배타다(티켓 20260910_2258). activity 타입 전용
          (티켓 20260911_0202). 액티비티이고 JAM!이 아니면 1개 이상 골라야 한다(티켓 20260910_2314). */}
      {type === 'activity' && (
        <div className="flex flex-col gap-2">
          <FieldLabel id="badge-activity-types-label" required>
            분류
          </FieldLabel>
          <div
            role="group"
            aria-labelledby="badge-activity-types-label"
            aria-describedby={cn('badge-activity-types-help', activityTypesInvalid && 'badge-activity-types-error') || undefined}
            className="flex flex-wrap gap-2"
          >
            {ADMIN_ACTIVITY_TYPES.map((t) => {
              const on = activityTypes.includes(t)
              return (
                <button
                  key={t}
                  id={`badge-activity-type-${t}`}
                  type="button"
                  aria-pressed={on}
                  aria-describedby={activityTypesInvalid ? 'badge-activity-types-error' : undefined}
                  onClick={() => toggleActivityType(t)}
                  className={cn(
                    'inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-foreground/80 hover:bg-muted',
                    activityTypesInvalid && !on && 'border-destructive'
                  )}
                >
                  {ADMIN_ACTIVITY_TYPE_LABEL[t]}
                </button>
              )
            })}
            <button
              id="badge-activity-type-jam"
              type="button"
              aria-pressed={isJamCategory}
              aria-describedby={activityTypesInvalid ? 'badge-activity-types-error' : undefined}
              onClick={toggleAdminCategoryJam}
              className={cn(
                'inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isJamCategory
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-dashed border-input text-foreground/80 hover:bg-muted',
                activityTypesInvalid && 'border-destructive'
              )}
            >
              JAM!
            </button>
          </div>
          <FieldMessage id="badge-activity-types-help">
            여러 종목을 함께 고를 수 있어요. JAM!은 팔로워 수·하루 동기화 횟수 같은 서비스 사용량으로 판정하는 어드민 전용
            분류라 종목과 함께 고를 수 없고, 유저에게는 보이지 않아요.
          </FieldMessage>
          {activityTypesInvalid && (
            <FieldMessage id="badge-activity-types-error" tone="error">
              분류를 하나 이상 골라 주세요. 종목이나 JAM! 중에서 고를 수 있어요.
            </FieldMessage>
          )}
        </div>
      )}

      <div className="@container">
        <div className={FIELD_GRID_CLASS}>
          {/* 배지 종류 — 레벨형은 활동 배지 전용이라 다른 타입에서는 숨긴다
              (아이템은 등급으로 드랍 풀을, 체크인은 등급으로 표시를 가른다). */}
          {type === 'activity' && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <FieldLabel htmlFor="badge-kind">배지 종류</FieldLabel>
              <Select value={leveledKind ? 'leveled' : 'graded'} onValueChange={(v) => setLeveledKind(v === 'leveled')}>
                <SelectTrigger id="badge-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={themeContainer ?? undefined}>
                  <SelectItem value="graded">등급형 · Common~Mystic</SelectItem>
                  <SelectItem value="leveled">레벨형 · Lv.1부터 무한</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isLeveled ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <FieldLabel htmlFor="badge-level" required>
                레벨
              </FieldLabel>
              <SuffixInput
                id="badge-level"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="1"
                describedBy="badge-level-help"
              />
              <FieldMessage id="badge-level-help">
                레벨형 배지에는 등급이 없어요. 같은 계열 안에서 보유 레벨 다음 레벨부터 순서대로 발급돼요.
              </FieldMessage>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-1.5">
              <FieldLabel htmlFor="badge-rarity" required>
                등급
              </FieldLabel>
              <Select value={rarity} onValueChange={(v) => setRarity(v as BadgeRarity)}>
                <SelectTrigger id="badge-rarity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={themeContainer ?? undefined}>
                  {RARITIES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {RARITY_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
    </BadgeSectionCard>
  )

  const basicSection = (
    <BadgeSectionCard {...sectionHeader('basic')}>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={FOCUS_ID.name} required>
          배지 이름
        </FieldLabel>
        <Input
          id={FOCUS_ID.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="한강 라이더"
          autoComplete="off"
          aria-invalid={nameInvalid || undefined}
          aria-describedby={nameInvalid ? 'badge-name-error' : undefined}
          className="aria-invalid:border-destructive"
        />
        {nameInvalid && (
          <FieldMessage id="badge-name-error" tone="error">
            배지 이름을 입력해 주세요.
          </FieldMessage>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={FOCUS_ID.description} required>
          설명
        </FieldLabel>
        <Textarea
          id={FOCUS_ID.description}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="배지 설명을 입력하세요"
          aria-invalid={descriptionInvalid || undefined}
          aria-describedby={cn('badge-description-count', descriptionInvalid && 'badge-description-error')}
          className="resize-y aria-invalid:border-destructive"
        />
        {/* 글자 수만 보여 준다 — 기존 데이터를 깨지 않도록 새 최대 길이 제한은 두지 않는다 */}
        <FieldMessage id="badge-description-count">{description.length}자</FieldMessage>
        {descriptionInvalid && (
          <FieldMessage id="badge-description-error" tone="error">
            설명을 입력해 주세요.
          </FieldMessage>
        )}
      </div>

      {/* 계열 키 — **읽기 전용이다.** 2단 교차 게이트가 대상 계열을 이 키로 지정하므로
          이름을 고쳐도 키가 바뀌면 게이트 참조가 조용히 끊긴다(티켓 20260905_0032 판단 ③). */}
      {isEdit && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="badge-family-key">계열 키</FieldLabel>
          {/* 읽기 전용 모양(회색 배경·고정폭 글꼴)은 shadcn Input의 bg-white를 className으로 덮을 수
              없어(`cn`이 병합하지 않는다) 직접 칠한다 */}
          <input
            id="badge-family-key"
            value={badge.family_key ?? ''}
            readOnly
            placeholder="아직 없음"
            aria-describedby="badge-family-key-help"
            className="flex h-10 w-full rounded-md border border-neutral-300 bg-muted px-3 py-2 font-mono text-sm text-muted-foreground placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          />
          <FieldMessage id="badge-family-key-help">
            2단 교차 게이트가 이 키로 계열을 가리켜요. 이름을 바꿔도 키는 그대로라 여기서는 고칠 수 없어요.
          </FieldMessage>
        </div>
      )}
    </BadgeSectionCard>
  )

  const conditionSection = type !== 'checkin' && (
    <BadgeSectionCard {...sectionHeader('cond')}>
      <BadgeConditionSection
        type={type}
        isJam={isJamCategory}
        condFields={condFields}
        setCondField={setCondField}
        condPreview={condPreview}
        blockedKeys={blockedKeys}
        fieldErrors={fieldErrors}
        invalidFields={invalidCondFields}
        unsupportedConditionKeys={unsupportedConditionKeys}
        unrepresentableConditionKeys={unrepresentableConditionKeys}
        pendingConditionKeys={pendingConditionKeys}
        progressIssue={progressIssue}
        themeContainer={themeContainer}
      />
    </BadgeSectionCard>
  )

  const linkSection = !isJamActivity && (
    <BadgeSectionCard {...sectionHeader('link')}>
      {/* 트라이브/소속 컬렉션 — 체크인 배지에는 이 개념이 없어 숨긴다(티켓 20260830_1344).
          JAM! 배지는 섹션째 숨긴다. JAM!을 켜는 순간 트라이브·컬렉션을 비운다(티켓 20260911_0901 D-3). */}
      {type !== 'checkin' && (
        <div className="@container">
          <div className={FIELD_GRID_CLASS}>
            <div className="flex min-w-0 flex-col gap-1.5">
              <FieldLabel htmlFor="badge-tribe">소속 트라이브</FieldLabel>
              <Select value={tribeId || NONE_VALUE} onValueChange={(v) => setTribeId(v === NONE_VALUE ? '' : v)}>
                <SelectTrigger id="badge-tribe">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={themeContainer ?? undefined}>
                  <SelectItem value={NONE_VALUE}>없음</SelectItem>
                  {tribes.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <FieldLabel htmlFor="badge-item-book">소속 컬렉션</FieldLabel>
              <Select value={itemBookId || NONE_VALUE} onValueChange={(v) => setItemBookId(v === NONE_VALUE ? '' : v)}>
                <SelectTrigger id="badge-item-book">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={themeContainer ?? undefined}>
                  <SelectItem value={NONE_VALUE}>없음</SelectItem>
                  {itemBooks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 아이템 배지 전용 — 컬렉션 내 상대 확률이라 여기 함께 둔다 */}
            {type === 'item' && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <FieldLabel htmlFor="badge-drop-weight">드랍 가중치</FieldLabel>
                <SuffixInput
                  id="badge-drop-weight"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={dropWeight}
                  onChange={(e) => setDropWeight(e.target.value)}
                  describedBy="badge-drop-weight-help"
                />
                <FieldMessage id="badge-drop-weight-help">
                  0.1~10 사이로 적어요.
                  {itemBookId &&
                    siblingWeightSum !== null &&
                    (() => {
                      const own = parseFloat(dropWeight) || 0
                      const total = siblingWeightSum + own
                      const pct = total > 0 ? Math.round((own / total) * 1000) / 10 : 0
                      return (
                        <>
                          {' '}같은 컬렉션·등급의 다른 배지
                          {siblingWeightSum > 0 ? `(가중치 합 ${siblingWeightSum.toFixed(1)})` : ''} 대비 뽑힐 상대 확률 약{' '}
                          <strong className="text-foreground">{pct}%</strong>
                          {siblingWeightSum === 0 && ' (이 믹스의 첫 배지)'}
                        </>
                      )
                    })()}
                </FieldMessage>
              </div>
            )}
          </div>
        </div>
      )}

      {type === 'checkin' && (
        <>
          {/* 지점 카테고리 — 체크인 배지 전용(티켓 20260830_1344). 값을 지정하면 연결된 지점의
              카테고리보다 우선 적용돼 목록·배지함 분류 기준이 된다(티켓 20260830_1522). */}
          <div className="@container">
            <div className={FIELD_GRID_CLASS}>
              <div className="flex min-w-0 flex-col gap-1.5">
                <FieldLabel htmlFor="badge-poi-category">지점 카테고리</FieldLabel>
                <Select value={category || NONE_VALUE} onValueChange={(v) => setCategory(v === NONE_VALUE ? '' : v)}>
                  <SelectTrigger id="badge-poi-category" aria-describedby="badge-poi-category-help">
                    <SelectValue placeholder="카테고리를 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent container={themeContainer ?? undefined}>
                    <SelectItem value={NONE_VALUE}>연결된 지점을 따름</SelectItem>
                    {poiCategories.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={cn('flex min-w-0 flex-col justify-end pb-1', fieldSpanClass(2))}>
                <FieldMessage id="badge-poi-category-help">
                  값을 고르면 연결된 지점의 카테고리 대신 이 값으로 목록과 배지함에서 분류돼요.
                </FieldMessage>
              </div>
            </div>
          </div>

          {/* 지도 마커 노출 토글 — 체크인 배지 전용(티켓 20260912_1053). 끄면 지도 드롭메뉴에
              마커로 표시되지 않지만(`/api/checkin-badges`), 이미 획득한 배지는 마이페이지
              이력에 그대로 남는다. */}
          <label className="flex items-center gap-3 cursor-pointer" htmlFor="badge-show-on-map">
            <Switch id="badge-show-on-map" checked={showOnMap} onCheckedChange={setShowOnMap} />
            <span className="text-sm text-foreground">지도에 마커로 표시</span>
          </label>

          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="badge-poi-search">연결된 지점</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="badge-poi-search"
                value={poiQuery}
                onChange={(e) => setPoiQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    searchPois()
                  }
                }}
                placeholder="등록된 지점 이름으로 검색"
                autoComplete="off"
                aria-describedby="badge-poi-search-help"
              />
              <Button type="button" variant="outline" onClick={searchPois} disabled={poiSearching || !poiQuery.trim()}>
                {poiSearching ? '검색 중...' : '검색'}
              </Button>
            </div>
            <FieldMessage id="badge-poi-search-help">
              GPS 경로가 연결한 지점의 반경을 지나면 획득해요. 여러 곳을 연결할 수 있고 체크인할 때마다 반복 획득돼요. 판정
              반경은 각 지점에 등록된 값을 그대로 쓰고, POI 관리 화면에서 바꿔요.
            </FieldMessage>
          </div>

          {/* 검색 결과 */}
          {poiSearched && (
            <div className="overflow-hidden rounded-lg border border-border">
              {poiResults.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">검색 결과가 없어요.</p>
              ) : (
                <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                  {poiResults.map((poi) => {
                    const already = linkedPois.some((p) => p.id === poi.id)
                    const linkedElsewhere = !!poi.linked_badge_id && poi.linked_badge_id !== (badge?.id ?? '')
                    return (
                      <li key={poi.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-foreground">{poi.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {poiCategoryLabel(poi.category)} · 반경 {poi.radius_meters}m
                            {linkedElsewhere && <span className="text-amber-700"> · 다른 배지에 연결됨 (추가하면 이 배지로 옮겨요)</span>}
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => addLinkedPoi(poi)} disabled={already}>
                          {already ? '추가됨' : '추가'}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* 연결 목록 */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">연결된 지점 {linkedPois.length}곳</p>
            {linkedPois.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted px-4 py-5 text-center text-sm text-muted-foreground">
                아직 연결한 지점이 없어요. 위에서 검색해 추가하세요.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {linkedPois.map((poi) => (
                  <li key={poi.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2 text-sm">
                    <span className="truncate text-foreground">
                      {poi.name} <span className="text-xs text-muted-foreground">{poiCategoryLabel(poi.category)}</span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">반경 {poi.radius_meters}m</span>
                    <button
                      type="button"
                      onClick={() => removeLinkedPoi(poi.id)}
                      aria-label={`${poi.name} 연결 해제`}
                      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <IconX className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </BadgeSectionCard>
  )

  const rewardSection = (
    <BadgeSectionCard {...sectionHeader('reward')}>
      <div className="@container">
        <div className={FIELD_GRID_CLASS}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="badge-point-reward">포인트 보상</FieldLabel>
            <SuffixInput
              id="badge-point-reward"
              type="number"
              inputMode="numeric"
              min="0"
              value={pointReward}
              onChange={(e) => setPointReward(e.target.value)}
              placeholder="0"
              suffix="포인트"
              describedBy="badge-point-reward-help"
            />
            <FieldMessage id="badge-point-reward-help">
              획득 시점 값으로 1번 지급돼요. 나중에 바꿔도 이미 지급한 포인트는 그대로예요. 0이면 지급하지 않아요.
            </FieldMessage>
          </div>

          {/* 패치 — 체크박스를 켜야 가격 입력이 열린다 */}
          <div className={cn('flex min-w-0 flex-col gap-1.5', fieldSpanClass(2))}>
            <FieldLabel>실물 패치</FieldLabel>
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="badge-patch-available"
                checked={patchAvailable}
                onCheckedChange={(v) => setPatchAvailable(v === true)}
                aria-describedby="badge-patch-available-help"
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <label htmlFor="badge-patch-available" className="cursor-pointer text-sm font-medium text-foreground">
                  패치 구매를 열어요
                </label>
                <FieldMessage id="badge-patch-available-help">켜면 가격을 입력할 수 있어요.</FieldMessage>
              </div>
            </div>
            <SuffixInput
              id="badge-patch-price"
              type="number"
              inputMode="numeric"
              min="0"
              value={patchPriceKrw}
              onChange={(e) => setPatchPriceKrw(e.target.value)}
              placeholder="9900"
              suffix="원"
              disabled={!patchAvailable}
              aria-label="패치 가격"
              className="max-w-[220px]"
            />
          </div>

          <div className={cn('flex min-w-0 flex-col gap-1.5', fieldSpanClass(3))}>
            <FieldLabel id="badge-period-label">유효기간</FieldLabel>
            <div
              role="group"
              aria-labelledby="badge-period-label"
              aria-describedby="badge-period-help"
              className="grid max-w-[440px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
            >
              <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} aria-label="시작일" />
              <span className="text-xs text-muted-foreground" aria-hidden="true">
                ~
              </span>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                min={validFrom || undefined}
                aria-label="종료일"
              />
            </div>
            <FieldMessage id="badge-period-help">
              {type === 'item'
                ? '설정하면 해당 기간에만 드랍되며, 획득된 배지의 만료일은 종료일로 자동 설정돼요. 비워 두면 상시 드랍, 만료 없음이에요.'
                : '설정하면 해당 기간에만 획득 조건을 평가해요. 기간 밖의 동기화에서는 이 배지를 건너뛰어요. 비워 두면 상시 평가해요.'}
            </FieldMessage>
            {(validFrom || validUntil) && (
              <button
                type="button"
                onClick={() => {
                  setValidFrom('')
                  setValidUntil('')
                }}
                className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                기간 설정 초기화
              </button>
            )}
          </div>
        </div>
      </div>
    </BadgeSectionCard>
  )

  const designSection = (
    <BadgeSectionCard {...sectionHeader('design')}>
      {/* 배지 이미지 — 기본 정보에서 이 섹션 맨 위로 옮겼다(티켓 20260911_0901) */}
      <div id={FOCUS_ID.image} className="flex flex-col gap-1.5">
        <ImageUploadField
          value={imageUrl}
          onChange={setImageUrl}
          onAverageColor={(color) => {
            if (color) setBackgroundColor(color)
          }}
          folder="badges"
          required
          label="배지 이미지"
          allowManualUrl={false}
          describedBy={imageInvalid ? 'badge-image-error' : undefined}
        />
        {imageInvalid && (
          <FieldMessage id="badge-image-error" tone="error">
            배지 이미지를 업로드해 주세요.
          </FieldMessage>
        )}
      </div>

      {/* 배경 — 배경색 / 애니메이션 배타 선택(티켓 20260901_1944). 미리보기는 오른쪽 레일이 그린다 */}
      <BackgroundGeneratorPreview
        backgroundColor={backgroundColor}
        onBackgroundColorChange={setBackgroundColor}
        backgroundAnimation={backgroundAnimation}
        onBackgroundAnimationChange={setBackgroundAnimation}
      />
    </BadgeSectionCard>
  )

  const sectionNodes: Record<BadgeSectionId, ReactNode> = {
    class: classSection,
    basic: basicSection,
    cond: conditionSection,
    link: linkSection,
    reward: rewardSection,
    design: designSection,
  }

  const rail = (
    <>
      <RailCard title="상세 화면 미리보기" className="@2xl:row-span-2 @4xl:row-span-1">
        <BadgeRailPreview
          badge={{
            image_url: imageUrl || null,
            name: name || '(배지 이름 미입력)',
            rarity: isLeveled ? null : rarity,
            level: isLeveled ? parseInt(level, 10) || null : null,
            description,
          }}
          background={{
            background_color: backgroundColor || null,
            background_shader_id: null,
            background_image_url: null,
            background_animation: backgroundAnimation,
          }}
          conditionText={conditionText}
        />
      </RailCard>

      <RailCard title="섹션">
        <BadgeSectionNav
          items={sections.map((id) => ({ id, label: badgeSectionTitle(id, sectionCtx), status: statuses[id] }))}
        />
      </RailCard>

      <RailCard className={cn('flex flex-col gap-2', RAIL_ACTIONS_CLASS)}>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '배지 등록'}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => router.push('/admin/badges')}>
            취소
          </Button>
          {isEdit && (
            <Button type="button" variant="destructive" className="flex-1" onClick={() => setShowDeleteConfirm(true)}>
              삭제
            </Button>
          )}
        </div>
        {/* 누락을 다 고치면 안내도 사라진다(누락 판정은 매 렌더 다시 계산) */}
        <p role="status" className="text-xs text-destructive empty:hidden">
          {saveNotice && missingKeys.size > 0 ? saveNotice : null}
        </p>
        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </RailCard>
    </>
  )

  return (
    <form
      onSubmit={handleSubmit}
      // 브라우저 기본 검증(수치 min·max 등)이 접힌 조건 그룹 안의 입력을 가리키면, 포커스할 수
      // 없어 말없이 저장이 막힌다 — 검증 실패 이벤트를 받아 그 그룹을 먼저 펼친다.
      onInvalidCapture={(e) => {
        const details = (e.target as HTMLElement).closest('details')
        if (details && !details.open) details.open = true
      }}
      className="mx-auto w-full max-w-6xl"
    >
      <BadgeEditorShell
        header={header}
        railLabel="미리보기와 저장"
        main={sections.map((id) => (
          <Fragment key={id}>{sectionNodes[id]}</Fragment>
        ))}
        rail={rail}
      />

      {/* 삭제 확인 — Radix AlertDialog. role/aria-modal·포커스 트랩·ESC 닫기가 기본 제공된다
          (티켓 20260911_0202 1단계). */}
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open && !loading) setShowDeleteConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>배지 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              &apos;{badge?.name}&apos; 배지를 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다.
              단, 발급·드랍 등 이력이 있는 배지는 삭제할 수 없으며 비활성화만 가능합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={loading} onClick={() => setShowDeleteConfirm(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={loading} onClick={handleDelete}>
              {loading ? '삭제 중...' : '삭제 확인'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
