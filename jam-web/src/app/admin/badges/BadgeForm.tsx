'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconX } from '@tabler/icons-react'
import type { BadgeRow, BadgeCondition, ActivityType, BadgeType, BadgeRarity, FactionRow, ItemBookRow } from '@/types/database'
import ImageUploadField from '@/components/admin/ImageUploadField'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import BackgroundGeneratorPreview, {
  type BackgroundGeneratorLivePreviewState,
} from './BackgroundGeneratorPreview'
import BadgeDetailPreviewFrame from './BadgeDetailPreviewFrame'
import { parseBlobAnimation, type BlobAnimationParams } from '@/lib/blobAnimation'
import {
  buildConditionJsonFromFields,
  conditionFormFieldsFrom,
  findUnrepresentableConditionKeys,
  getUnsupportedConditionKeys,
  type ConditionFormFields,
} from './conditionFormFields'
import { BADGE_TYPES, BADGE_TYPE_LABEL } from '@/lib/admin/badge-labels'
// 조건 입력 UI는 **레지스트리 선언에서 생성한다** — 필드마다 JSX를 하드코딩하던 구조를
// 뒤집었다(티켓 20260905_0032 A-2). 새 조건 필드는 conditionRegistry.ts의 `form` 선언과
// ConditionFormFields의 state 키만 추가하면 이 화면에 자동으로 나타난다.
import {
  CONDITION_FORM_ENTRIES,
  CONDITION_FORM_SECTIONS_IN_USE,
  CONDITION_FORM_SECTION_LABEL,
  findBlockingConditionKeys,
  getConditionField,
  type ConditionFormEntry,
} from '@/lib/badge-engine/conditionRegistry'
// 등급형/레벨형 판정은 여기 한 곳에만 있다 — 다시 선언하지 않는다(티켓 20260905_0030).
import { isLeveledBadge } from '@/lib/badge-engine/badgeKind'
// 저장 API가 쓰는 것과 **같은 판정·같은 문구**. 서버 전용 의존(drop-engine → next/headers)이
// 없는 파일로 갈라 두었기에 클라이언트 컴포넌트에서 그대로 쓸 수 있다.
import { findConditionShapeSaveError, findRarityLevelError } from '@/lib/admin/badge-condition-guards'
// 배지 트리 화면(BadgeTreeClient 등)의 진행률 분류와 동일한 함수 — 어드민 경고가 화면
// 렌더링과 다른 판정 로직을 갖지 않도록 재사용한다(제안서 §08 H, 티켓 20260904_1426).
// `next/headers` 등 서버 전용 의존을 물지 않는 순수 함수라 이 클라이언트 컴포넌트에서
// 값(value) import로 바로 써도 안전하다 — badgeProgressText.ts가 이미 같은 모듈에서
// LOWER_IS_BETTER_KEYS를 값으로 import해 클라이언트 컴포넌트에 쓰고 있고(티켓 20260904_0921
// 게이트 리뷰에서 `npm run build`로 실증됨), 이 파일 스스로도 재검증했다.
import { explainUnsupportedProgress } from '@/lib/badge-engine/badgeProgress'

/** 2단 교차 게이트 3종의 입력 블록 정의 — 폼 state 키 접두는 레지스트리의 `gateForm`과 짝이다 */
const CROSS_GATE_BLOCKS = [
  {
    prefix: 'crossInAxis',
    title: '축 내 교차',
    help: '같은 축 안의 다른 계열 배지를 요구해요.',
  },
  {
    prefix: 'crossBetweenAxis',
    title: '축 간 교차',
    help: '보완 축(다른 축)의 계열 배지를 요구해요.',
  },
] as const

/** 미리보기 본문에 넣는 예시 조건 문구 — 실제 조건은 배지마다 달라 저작 화면에서는 알 수 없다 */
const PREVIEW_CONDITION_TEXT = '실제 화면에서는 이 자리에 배지 획득 조건이 표시돼요.'

const ACTIVITY_TYPES: ActivityType[] = ['cycling', 'running', 'trail_running', 'hiking', 'walking']
const RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

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
  // 등급형과 레벨형은 **배타**다(마이그레이션 130의 badges_rarity_level_exclusive).
  // 예전에는 `badge?.rarity ?? 'common'` 하나뿐이라 **등급 없는 배지를 Common으로 접었고**,
  // 그대로 저장하면 CHECK 위반이거나 레벨형이 등급형으로 뒤집혔다(티켓 20260905_0032 A-3).
  // 종류 판정은 badgeKind.ts의 `isLeveledBadge` 하나만 쓴다 — 여기서 다시 선언하지 않는다.
  const [leveledKind, setLeveledKind] = useState<boolean>(() => (badge ? isLeveledBadge(badge) : false))
  const [rarity, setRarity] = useState<BadgeRarity>(badge?.rarity ?? 'common')
  const [level, setLevel] = useState<string>(badge?.level?.toString() ?? '1')
  // 레벨형은 활동 배지 전용이다 — 아이템 배지는 등급으로 드랍 풀을, 체크인 배지는 등급으로
  // 표시를 가른다. 타입을 바꾸면 종류 state를 건드리지 않고 «파생값»에서만 등급형으로 되돌린다
  // (되돌아올 때 사용자가 고른 값이 그대로 살아 있어야 한다).
  const isLeveled = type === 'activity' && leveledKind
  const [imageUrl, setImageUrl] = useState(badge?.image_url ?? '')
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>(badge?.activity_types ?? [])
  const [patchAvailable, setPatchAvailable] = useState(badge?.patch_available ?? false)
  const [patchPriceKrw, setPatchPriceKrw] = useState<string>(
    badge?.patch_price_krw?.toString() ?? ''
  )
  const [pointReward, setPointReward] = useState<string>(
    badge?.point_reward?.toString() ?? '0'
  )
  // 배경 테마 — background_color: 배경색(피커+hex, 이미지 업로드 시 평균 컬러 자동 프리필).
  // 제너레이터(패턴/애니메이션/Paper 필터)와 배경 쉐이더 드롭다운은 티켓 20260901_1929에서 제거.
  const [backgroundColor, setBackgroundColor] = useState<string>(badge?.background_color ?? '')
  // [20260901_1944] 배경색과 배타인 애니메이션 모드. null이면 배경색 모드다.
  const [backgroundAnimation, setBackgroundAnimation] = useState<BlobAnimationParams | null>(
    () => parseBlobAnimation(badge?.background_animation)
  )

  // condition_json builder state — **레지스트리에서 파생한다**(티켓 20260905_0032 A-2).
  // 예전에는 필드마다 `useState`를 하나씩 선언했고(18개), 새 조건 필드를 추가하면서 여기
  // 초기화를 빠뜨리면 그 배지를 열어 저장하기만 해도 값이 조용히 사라졌다.
  const initCond = (badge?.condition_json as BadgeCondition) ?? EMPTY_CONDITION
  const [condFields, setCondFields] = useState<ConditionFormFields>(() => conditionFormFieldsFrom(initCond))
  const setCondField = useCallback((field: string, value: string | boolean) => {
    setCondFields((prev) => ({ ...prev, [field]: value }))
  }, [])
  // 폼이 입력 UI를 갖지 않는 조건 필드(day_of_week 등) — 값이 있으면 저장 시 원본 그대로
  // 보존되지만(conditionFormFields.ts), 이 폼에서 보거나 고칠 수는 없다는 걸 안내한다
  // (티켓 20260825_032). initCond는 배지를 열 때의 원본 스냅샷이라 폼 세션 동안 불변이다.
  const unsupportedConditionKeys = getUnsupportedConditionKeys(initCond)
  // 폼 지원 필드인데도 **왕복이 성립하지 않는** 값 — 저장하면 바뀌거나 사라진다.
  const unrepresentableConditionKeys = findUnrepresentableConditionKeys(initCond)

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

  const buildConditionJson = (): BadgeCondition | null => buildConditionJsonFromFields(condFields, initCond)

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
    // 여기서 먼저 걸러 왕복을 아낀다(최종 판정은 서버가 다시 한다).
    return findConditionShapeSaveError({ name, family_key: badge?.family_key ?? null }, cond)
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

    // 등급형/레벨형 배타 — 저장 API와 **같은 함수·같은 문구**로 먼저 막는다. 그대로 보내면
    // Postgres CHECK 위반 원문이 화면에 그대로 뜬다(티켓 20260905_0032 A-3).
    const rarityLevelError = findRarityLevelError(isLeveled ? null : rarity, isLeveled ? level : null)
    if (rarityLevelError) {
      setError(rarityLevelError)
      return
    }

    // 체크인 배지는 활동 조건을 쓰지 않는다 — 조건 빌더 값이 남아 있어도 무시
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
        // background_shader_id/background_image_url/background_video_url은 보내지 않는다
        // (티켓 20260901_1929) — 제너레이터가 사라져 이 필드들을 새로 만들 방법이 없고, 저장
        // API는 누락된 필드를 기존 DB 값 그대로 둔다(undefined 병합, badges PUT/POST 참조).
        // [20260901_1944] 애니메이션 모드에서는 배경색 입력란이 화면에 없어 검증을 건너뛰므로,
        // 형식이 어긋난 값이 DB로 새어들지 않도록 hex가 아닌 값은 null로 정리한다. 배경색 모드는
        // 위에서 이미 검증돼 동작이 달라지지 않는다.
        background_color: HEX_COLOR_PATTERN.test(trimmedBackgroundColor) ? trimmedBackgroundColor : null,
        // 배경색과 배타 — 애니메이션 모드가 아니면 명시적으로 null을 보내 해제가 저장되게 한다
        // (PUT의 `!== undefined` 병합에서 null과 undefined는 다르게 취급된다).
        background_animation: backgroundAnimation,
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

  // §08 H(진행 미지원 고지) 어드민 절반 — 배지 트리 화면(`/badges/tree`)이 실제로 조회하는
  // 대상은 `type: 'activity'` 배지뿐이다(page.tsx의 `.eq('type', 'activity')`). 아이템/체크인
  // 배지는 이 분류 결과와 무관하게 그 화면에 애초에 등장하지 않으므로, type이 'activity'가
  // 아닐 때 이 경고를 띄우면 "배지 트리 화면에 표시 안 됨"이라는 문구 자체가 부정확해진다
  // (체크인은 조건 빌더 자체가 이 블록 밖이라 자동으로 배제된다 — 티켓 20260904_1426).
  // 경고가 **왜인지도 말한다** — 숨겨지는 축 키는 0031의 `unabsorbedAxisKeys`가 이미
  // 계산하고 있었다(티켓 20260905_0032).
  const progressIssue = type === 'activity' ? explainUnsupportedProgress(condPreview ?? {}) : null

  // 「평가 대기」 — 레지스트리에 선언은 됐지만 엔진이 아직 평가하지 않는 필드가 든 조건은
  // fail-closed로 막힌다. 저장은 되지만 **발급은 되지 않는다**는 걸 화면에서 알린다
  // (0035 시딩이 0030 평가 구현보다 먼저 들어오는 경우를 전제한 표시).
  const pendingConditionKeys = findBlockingConditionKeys(condPreview).pending

  /** 조건 입력 1개를 레지스트리 선언대로 그린다 — 필드마다 JSX를 쓰지 않는다 */
  const renderConditionControl = ({ meta, control }: ConditionFormEntry) => {
    const label = control.label ?? (meta.unit ? `${meta.label} (${meta.unit})` : meta.label)
    const raw = (condFields as Record<string, string | boolean>)[control.field]
    const wideClass = control.wide ? 'col-span-2' : ''
    const labelNode = (
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
        {label}
        {meta.evaluation === 'pending' && (
          <span className="rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-800">평가 대기</span>
        )}
      </span>
    )
    const help = control.help ? <span className="text-xs text-muted-foreground">{control.help}</span> : null

    if (control.kind === 'checkbox') {
      return (
        <label key={control.field} className={`flex items-start gap-2 cursor-pointer ${wideClass}`}>
          <input
            type="checkbox"
            checked={raw === true}
            onChange={(e) => setCondField(control.field, e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span className="flex flex-col gap-0.5">
            {labelNode}
            {help}
          </span>
        </label>
      )
    }

    if (control.kind === 'select') {
      const current = typeof raw === 'string' && raw ? raw : NONE_VALUE
      return (
        <label key={control.field} className={`flex flex-col gap-1.5 ${wideClass}`}>
          {labelNode}
          <Select
            value={current}
            onValueChange={(v) => setCondField(control.field, v === NONE_VALUE ? '' : v)}
          >
            <SelectTrigger aria-label={label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={themeContainer ?? undefined}>
              <SelectItem value={NONE_VALUE}>{control.noneLabel ?? '— 없음 —'}</SelectItem>
              {(control.options ?? []).map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {help}
        </label>
      )
    }

    const inputClass =
      'bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50'
    return (
      <label key={control.field} className={`flex flex-col gap-1.5 ${wideClass}`}>
        {labelNode}
        <input
          type={control.kind === 'number' ? 'number' : control.kind === 'time' ? 'time' : 'text'}
          {...(control.kind === 'number' ? { min: meta.min, max: meta.max, step: meta.step } : {})}
          value={typeof raw === 'string' ? raw : ''}
          onChange={(e) => setCondField(control.field, e.target.value)}
          placeholder={control.placeholder}
          className={inputClass}
        />
        {help}
      </label>
    )
  }

  /** 교차 게이트 1개(계열 키 · 최소 등급 · 필요 계열 수) */
  const renderCrossGate = (prefix: string, title: string, help: string) => {
    const value = (field: string) => {
      const raw = (condFields as Record<string, string | boolean>)[field]
      return typeof raw === 'string' ? raw : ''
    }
    const inputClass =
      'bg-white border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50'
    return (
      <div className="rounded-xl border border-border bg-white p-3 space-y-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{help}</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">대상 계열 키 (쉼표 구분)</span>
          <input
            value={value(`${prefix}FamilyKeys`)}
            onChange={(e) => setCondField(`${prefix}FamilyKeys`, e.target.value)}
            placeholder="예: running:tempo, running:interval"
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">최소 등급</span>
            <Select
              value={value(`${prefix}MinRarity`) || NONE_VALUE}
              onValueChange={(v) => setCondField(`${prefix}MinRarity`, v === NONE_VALUE ? '' : v)}
            >
              <SelectTrigger aria-label={`${title} 최소 등급`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={themeContainer ?? undefined}>
                <SelectItem value={NONE_VALUE}>— 제한 없음 —</SelectItem>
                {RARITIES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">필요 계열 수</span>
            <input
              type="number"
              min="1"
              step="1"
              value={value(`${prefix}MinCount`)}
              onChange={(e) => setCondField(`${prefix}MinCount`, e.target.value)}
              placeholder="비우면 1개 (OR)"
              className={inputClass}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          레벨형 계열을 대상으로 삼을 때는 최소 등급을 비워두세요. 등급이 없어 서열 비교가 성립하지 않아요.
        </p>
      </div>
    )
  }

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

        {/* 배지 종류 — 등급형 / 레벨형. 레벨형은 활동 배지 전용이라 다른 타입에서는 숨긴다
            (아이템은 등급으로 드랍 풀을, 체크인은 등급으로 표시를 가른다). */}
        {type === 'activity' && (
          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="text-sm text-foreground">배지 종류 *</span>
            <Select
              value={leveledKind ? 'leveled' : 'graded'}
              onValueChange={(v) => setLeveledKind(v === 'leveled')}
            >
              <SelectTrigger aria-label="배지 종류">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={themeContainer ?? undefined}>
                <SelectItem value="graded">등급형 (Common ~ Mystic)</SelectItem>
                <SelectItem value="leveled">레벨형 (Lv.1 ~ 무한)</SelectItem>
              </SelectContent>
            </Select>
          </label>
        )}

        {isLeveled ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-foreground">레벨 *</span>
            <input
              type="number"
              min="1"
              step="1"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="bg-white border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:border-primary/50"
              placeholder="예: 1"
            />
            <span className="text-xs text-muted-foreground">
              레벨형 배지에는 등급이 없어요. 같은 계열 안에서 보유 레벨 다음 레벨부터 순서대로 발급돼요.
            </span>
          </label>
        ) : (
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
        )}

        {/* 계열 키 — **읽기 전용이다.** 2단 교차 게이트가 대상 계열을 이 키로 지정하므로
            이름을 고쳐도 키가 바뀌면 게이트 참조가 조용히 끊긴다(티켓 20260905_0032 판단 ③). */}
        {isEdit && (
          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="text-sm text-foreground">계열 키 (family_key)</span>
            <input
              value={badge.family_key ?? ''}
              readOnly
              disabled
              placeholder="— 아직 없음 —"
              className="bg-muted border border-border rounded-xl px-4 py-2.5 text-muted-foreground cursor-not-allowed"
            />
            <span className="text-xs text-muted-foreground">
              2단 교차 게이트가 이 키로 계열을 가리켜요. 배지 이름을 바꿔도 키는 그대로 두므로 여기서는 고칠 수 없어요.
            </span>
          </label>
        )}

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

        {/* 배경 테마 — 배경색 / 애니메이션 배타 선택 (티켓 20260901_1944) */}
        <div className="col-span-2">
          <BackgroundGeneratorPreview
            backgroundColor={backgroundColor}
            onBackgroundColorChange={setBackgroundColor}
            backgroundAnimation={backgroundAnimation}
            onBackgroundAnimationChange={setBackgroundAnimation}
            renderPreview={({ themed, backgroundLayerStyle, backgroundLayerRef, liveNode, backgroundAnimation: previewAnimation }: BackgroundGeneratorLivePreviewState) => (
              <>
                <BadgeDetailPreviewFrame
                  badge={{
                    image_url: imageUrl || null,
                    name: name || '(배지 이름 미입력)',
                    rarity: isLeveled ? null : rarity,
                    description,
                    background_color: backgroundColor || null,
                    background_shader_id: null,
                    background_image_url: null,
                    // 편집 중인 애니메이션 파라미터를 그대로 넘긴다 — Hero 카드 내부의
                    // `hasBadgeBackgroundTheme` 판정이 실제 화면과 동일하게 동작해야 한다.
                    background_animation: previewAnimation,
                  }}
                  themed={themed}
                  backgroundLayerStyle={backgroundLayerStyle}
                  backgroundLayerRef={backgroundLayerRef}
                  liveNode={liveNode}
                  backgroundAnimation={previewAnimation}
                  conditionText={PREVIEW_CONDITION_TEXT}
                />
                <p className="text-xs text-muted-foreground mt-2 max-w-[430px]">
                  실제 배지 상세화면과 같은 구조로 보여줘요. 본문 문구는 예시라 실제 조건과 달라요.
                </p>
              </>
            )}
          />
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

          {/* 입력 UI는 conditionRegistry.ts의 `form` 선언에서 **생성한다** — 필드마다 JSX를
              쓰지 않는다(티켓 20260905_0032 A-2). 섹션·순서 모두 그 선언 순서를 따른다.
              2단 게이트(gate) 섹션만 아래 전용 블록에서 관계와 함께 그린다. */}
          {CONDITION_FORM_SECTIONS_IN_USE.filter((section) => section !== 'gate').map((section) => (
            <div key={section} className="space-y-2">
              <p className="text-xs font-semibold text-foreground/70">{CONDITION_FORM_SECTION_LABEL[section]}</p>
              <div className="grid grid-cols-2 gap-4">
                {CONDITION_FORM_ENTRIES.filter((e) => e.section === section).map(renderConditionControl)}
              </div>
            </div>
          ))}

          {/* 2단 게이트 — 관계(교차 둘은 OR, 미션 게이트는 AND)를 화면에서 드러낸다.
              선행 배지 이름 한 줄만으로는 AND를 표현할 수 없었다(티켓 20260905_0032 A-4). */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground/70">
              {CONDITION_FORM_SECTION_LABEL.gate}
            </p>
            <div className="grid grid-cols-2 gap-4">
              {CONDITION_FORM_ENTRIES.filter((e) => e.section === 'gate').map(renderConditionControl)}
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">다음 중 하나만 충족해도 통과해요 (OR)</p>
              {CROSS_GATE_BLOCKS.map((g) => (
                <div key={g.prefix}>{renderCrossGate(g.prefix, g.title, g.help)}</div>
              ))}
            </div>
            <p className="text-center text-xs font-semibold text-foreground">그리고 (AND)</p>
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              {renderCrossGate(
                'gateMissionBadge',
                '미션 보상 배지',
                '미션 완료로만 지급되는 배지를 요구해요. 위 교차 조건과 함께 충족돼야 통과해요.'
              )}
            </div>
          </div>

          {/* 메타데이터 필드 — 위 조건 필드들과 성격이 다르다(발급 판정에 관여하지 않음)는 것을
              시각적으로도 드러내기 위해 별도 색상 박스로 구분한다 (티켓 20260825_031) */}
          <label className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={condFields.missionReward}
              onChange={(e) => setCondField('missionReward', e.target.checked)}
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

          {/* 평가 대기 — 저장은 되지만 엔진이 그 필드를 아직 평가하지 않아 발급이 막힌다
              (fail-closed). 0035 시딩이 0030 평가 구현보다 먼저 들어올 때 어드민이 화면에서
              원인을 알 수 있게 한다(티켓 20260905_0032). */}
          {pendingConditionKeys.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">아직 평가되지 않는 조건 필드가 있어요</p>
              <p className="text-xs text-amber-800/80 mt-0.5">
                {pendingConditionKeys
                  .map((k) => `${getConditionField(k)?.label ?? k}(${k})`)
                  .join(', ')}
                {' '}는 엔진이 아직 평가하지 않아요. 저장은 되지만 이 배지는 평가가 열릴 때까지 발급되지 않아요.
              </p>
            </div>
          )}


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

          {/* 왕복 불가 값 안내 — 폼이 다루는 필드인데도 원본을 그대로 재현하지 못하는 값이다
              (쉼표가 든 배지 이름, 형태가 깨진 교차 게이트 등). 저장하면 바뀌거나 사라진다.
              저장을 막지는 않는다 — 어드민이 화면에서 고쳐 넣을 여지를 남긴다. */}
          {unrepresentableConditionKeys.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">이 폼이 그대로 재현하지 못하는 값이 있어요</p>
              <p className="text-xs text-amber-800/80 mt-0.5">
                {unrepresentableConditionKeys.join(', ')} 값의 형태가 입력 항목과 맞지 않아요. 이대로
                저장하면 값이 바뀌거나 사라져요. 위 JSON 미리보기에서 실제 저장될 값을 확인해주세요.
              </p>
            </div>
          )}

          {/* 진행 미지원 조건 경고 — 저장을 막지 않는다(§08 H 어드민 절반, 티켓 20260904_1426).
              classifyBadgeProgressKind가 8개 유형(누적·기록·주기·2축·다중카운터·레벨·회차·휴식)
              중 어디에도 못 걸리면, 이 조건은 배지 트리 화면에서 "진행 표시 준비 중"(화면 쪽,
              badgeProgressText.ts)으로만 그려지고 진행률 수치는 못 보여준다 — 발급(획득) 자체는
              기존 evaluateConditionDetailed/checkCondition이 그대로 판정하므로 영향 없다.
              **왜인지도 함께 말한다** — 숨겨지는 축 키는 0031의 unabsorbedAxisKeys가 이미
              계산한다(티켓 20260905_0032). */}
          {progressIssue && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">이 조건은 배지 트리 화면에 진행률이 표시되지 않아요</p>
              <p className="text-xs text-amber-800/80 mt-0.5">{progressIssue.reason}</p>
              {progressIssue.hiddenAxisLabels.length > 0 && (
                <p className="text-xs text-amber-800/80 mt-0.5">
                  화면에서 빠지는 축: {progressIssue.hiddenAxisLabels.join(', ')}
                </p>
              )}
              <p className="text-xs text-amber-800/80 mt-0.5">배지 획득에는 영향이 없어요.</p>
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
              &apos;{badge?.name}&apos; 배지를 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다.
              단, 발급·드랍 등 이력이 있는 배지는 삭제할 수 없으며 비활성화만 가능합니다.
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
