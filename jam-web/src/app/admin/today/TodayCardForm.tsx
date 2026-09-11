'use client'

/**
 * 투데이 카드 생성·수정 폼 — 티켓 20260911_1454(배지 생성조회수정 화면 리뉴얼, 티켓
 * 20260911_0901 기준으로 리뉴얼)
 *
 * 예전에는 `/admin/today` 목록 화면 안에서 인라인으로 펼쳐지는 폼이었다(`TodayCardList.tsx`).
 * 이제 배지 화면과 같은 페이지 전환 방식 — 생성 전용 화면(`new/page.tsx`), 카드별 수정 전용
 * 화면(`[id]/edit/page.tsx`)이 이 컴포넌트를 공유한다.
 *
 * 필드·검증 규칙(제목 필수, 시작·종료 일시 필수, 노출조건 태그 1개 이상)과 저장 페이로드
 * 구성 로직은 예전 `TodayCardList.tsx`에서 그대로 옮겼다 — 값 자체는 바뀌지 않았다. 템플릿
 * 타입 → 필요한 섹션/필드 매핑은 `lib/admin/today-sections.ts`로 옮겼다.
 */
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Checkbox } from '@/components/admin/ui/checkbox'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import BadgeMultiSearchSelect from '@/components/admin/BadgeMultiSearchSelect'
import type { BadgeSearchResult } from '@/components/admin/BadgeSearchSelect'
// 어드민 공용 필드 라벨/도움말 부품 — 배지 전용 타입에 묶여 있지 않은 제네릭 부품이라
// 그대로 재사용한다(BadgeForm.tsx는 건드리지 않는다).
import { FieldLabel, FieldMessage } from '@/app/admin/badges/BadgeFormControls'
import {
  TodayEditorShell,
  TodaySectionCard,
  TodaySectionNav,
  FIELD_GRID_CLASS,
  RAIL_ACTIONS_CLASS,
  RailCard,
} from '@/components/admin/today/TodayEditorLayout'
import {
  TODAY_TEMPLATE_OPTIONS,
  TODAY_LAYOUT_OPTIONS,
  TODAY_EXPOSURE_TAG_OPTIONS,
  SUGGESTED_LAYOUT_FOR,
  todayTemplateFields,
  visibleTodaySections,
  todaySectionTitle,
  todaySectionDescription,
  computeTodaySectionStatuses,
  buildTodayCardSavePayload,
  type TodaySectionId,
} from '@/lib/admin/today-sections'
// resolveTargetHref는 순수 함수라 서버 전용 의존이 없는 targetHref.ts에서 값으로 가져온다.
// `@/lib/today/cards`에서 값으로 import하면 그 파일의 `next/headers` 의존까지 클라이언트
// 번들에 딸려 들어가 빌드 오류가 난다 — `TodayCardWithHref`는 타입만 필요하니 그대로 가져온다.
import { resolveTargetHref } from '@/lib/today/targetHref'
import type { TodayCardWithHref } from '@/lib/today/cards'
import TodayCardStack from '@/app/(main)/TodayCardStack'
import type { TodayCardRow, TodayCardTemplateType, TodayCardLayoutType } from '@/types/database'
import { cn } from '@/lib/utils'

interface MissionOption {
  id: string
  title: string
}
interface ItemBookOption {
  id: string
  name: string
}
interface RankingModeOption {
  id: string
  title: string
}

interface TodayCardFormProps {
  card?: TodayCardRow
  missions: MissionOption[]
  itemBooks: ItemBookOption[]
  /** ranking_board 카드가 연결할 수 있는 랭킹모드 전체 목록(티켓 20260911_1440) — missions·itemBooks와
   *  같은 방식(전체 목록을 그대로 넘김, 배지처럼 검색 API를 쓰지 않는다 — 운영 큐레이션 목적이라
   *  개수가 적을 것으로 본다). */
  rankingModes: RankingModeOption[]
  /** 이미 카드에 연결된(badge_ids) 배지의 표시용 라벨 — 실제로 참조되는 id만 bounded 조회한
   *  결과다(수정 화면 전용, 20260826_011 A2와 동일 패턴). 생성 화면은 빈 배열로 시작한다. */
  badgeLabels: BadgeSearchResult[]
  /** 캘린더뷰가 보던 날짜('YYYY-MM-DD') — 생성 화면에서 시작 일시 프리필에 쓴다(선택). */
  initialDate?: string
  /** 저장·취소·삭제 후 돌아갈 목록 날짜('YYYY-MM-DD') — 캘린더뷰 맥락 보존(20260902_1028). */
  returnDate: string
  /** 페이지 제목·뒤로 가기 — 섹션 열 위에 둔다(레일은 페이지 맨 위에서 시작, TodayEditorShell 주석) */
  header?: ReactNode
}

// Radix Select는 SelectItem value=""를 허용하지 않는다 — "선택 안 함"을 나타내는 전용 값.
const NONE_VALUE = '__none__'

/** ISO(UTC) 문자열을 datetime-local input이 요구하는 "YYYY-MM-DDTHH:mm" 로컬 형식으로 변환 */
function toLocalInputValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 저장 시 누락 필드로 포커스를 옮길 때 쓰는 DOM id */
const FOCUS_ID = {
  title: 'today-card-title',
  exposureTags: 'today-card-exposure-tags-group',
  startsAt: 'today-card-starts-at',
  endsAt: 'today-card-ends-at',
} as const

export default function TodayCardForm({ card, missions, itemBooks, rankingModes, badgeLabels, initialDate, returnDate, header }: TodayCardFormProps) {
  const router = useRouter()
  const isEdit = !!card

  // Select·AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민
  // 테마 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(BadgeForm.tsx와 동일 패턴, 20260826_016).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const [templateType, setTemplateType] = useState<TodayCardTemplateType>(card?.template_type ?? 'badge_spotlight')
  const [layoutType, setLayoutType] = useState<TodayCardLayoutType>(card?.layout_type ?? SUGGESTED_LAYOUT_FOR.badge_spotlight)
  const [title, setTitle] = useState(card?.title ?? '')
  const [subtitle, setSubtitle] = useState(card?.subtitle ?? '')
  const [coverImageUrl, setCoverImageUrl] = useState(card?.cover_image_url ?? '')
  const [badgeIds, setBadgeIds] = useState<string[]>(card?.badge_ids ?? [])
  // 배지 id → 검색 결과 객체 캐시. badgeLabels(초기 참조 배지)로 시작해 새로 검색·선택한
  // 배지가 추가되면서 자라난다.
  const [badgeLabelCache, setBadgeLabelCache] = useState(() => new Map(badgeLabels.map((b) => [b.id, b])))
  const [missionId, setMissionId] = useState(card?.mission_id ?? '')
  const [itemBookId, setItemBookId] = useState(card?.item_book_id ?? '')
  const [regionLabel, setRegionLabel] = useState(card?.region_label ?? '')
  const [bodyMarkdown, setBodyMarkdown] = useState(card?.body_markdown ?? '')
  const [rankingModeId, setRankingModeId] = useState(card?.ranking_mode_id ?? '')
  // 레일 실시간 미리보기(User Story 6)용 — 랭킹모드가 실제로 계산하는 순위 목록을 그 랭킹모드가
  // 바뀔 때만 가져온다(다른 필드 입력마다 다시 불러오지 않는다). 랭킹모드는 이미 저장돼 있어야
  // 카드에 연결할 수 있으므로(User Story 4) id로 바로 조회할 수 있다 — targetHref.ts 주석 참고.
  const [previewRanking, setPreviewRanking] = useState<TodayCardWithHref['resolved_ranking']>(null)
  // 이펙트 본문에서 동기 setState를 피하기 위해 조회 자체를 별도 async 함수로 분리하고 그
  // 안에서만 상태를 갱신한다(TodayPreviewModal.tsx·UserGrantForm.tsx와 동일 패턴, react-hooks/set-state-in-effect).
  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!rankingModeId) {
        setPreviewRanking(null)
        return
      }
      try {
        const res = await fetch(`/api/admin/ranking-modes/${rankingModeId}/preview`)
        const data = res.ok ? await res.json() : null
        if (alive) setPreviewRanking(data)
      } catch {
        if (alive) setPreviewRanking(null)
      }
    }
    load()
    return () => { alive = false }
  }, [rankingModeId])
  const [targetHref, setTargetHref] = useState(card?.target_href ?? '')
  const [exposureTags, setExposureTags] = useState<string[]>(card?.exposure_tags ?? ['all'])
  const [startsAt, setStartsAt] = useState(() => {
    if (card) return toLocalInputValue(card.starts_at)
    return initialDate ? `${initialDate}T00:00` : ''
  })
  const [endsAt, setEndsAt] = useState(card ? toLocalInputValue(card.ends_at) : '')
  const [sortOrder, setSortOrder] = useState(card?.sort_order?.toString() ?? '0')
  const [isActive, setIsActive] = useState(card?.is_active ?? true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // 저장을 한 번 눌러 누락이 드러난 뒤부터 누락 필드에 빨간 안내·aria-invalid를 붙인다.
  const [showValidation, setShowValidation] = useState(false)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)

  const fields = todayTemplateFields(templateType)
  const hasRef = Boolean(fields.badges || fields.mission || fields.itemBook || fields.region || fields.body || fields.rankingMode)
  const selectedBadgeChips = badgeIds.map((id) => badgeLabelCache.get(id)).filter((b): b is BadgeSearchResult => !!b)

  function changeTemplateType(next: TodayCardTemplateType) {
    setTemplateType(next)
    setLayoutType(SUGGESTED_LAYOUT_FOR[next])
  }

  function addBadge(b: BadgeSearchResult) {
    setBadgeIds((prev) => (prev.includes(b.id) ? prev : [...prev, b.id]))
    setBadgeLabelCache((prev) => new Map(prev).set(b.id, b))
  }
  function removeBadge(id: string) {
    setBadgeIds((prev) => prev.filter((x) => x !== id))
  }
  function toggleTag(value: string) {
    setExposureTags((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]))
  }

  /** 저장 전 누락 목록 — 화면 위에서 아래 순서(기본 정보 → 노출 설정 → 게시 기간) */
  const collectMissing = (): { key: string; focusId: string }[] => {
    const list: { key: string; focusId: string }[] = []
    if (!title.trim()) list.push({ key: 'title', focusId: FOCUS_ID.title })
    if (exposureTags.length === 0) list.push({ key: 'exposureTags', focusId: FOCUS_ID.exposureTags })
    if (!startsAt) list.push({ key: 'startsAt', focusId: FOCUS_ID.startsAt })
    if (!endsAt) list.push({ key: 'endsAt', focusId: FOCUS_ID.endsAt })
    return list
  }
  const missingKeys = showValidation ? new Set(collectMissing().map((m) => m.key)) : new Set<string>()

  /** 누락 필드로 이동(배지 화면과 같은 방식, BadgeForm.tsx의 focusMissing과 동일 로직) */
  const focusMissing = (focusId: string) => {
    const el = document.getElementById(focusId)
    if (!el) return
    const focusable = el.matches('input, textarea, button, [tabindex]') ? el : el.querySelector<HTMLElement>('button, input, textarea')
    requestAnimationFrame(() => {
      focusable?.focus({ preventScroll: true })
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const missing = collectMissing()
    if (missing.length > 0) {
      setShowValidation(true)
      setSaveNotice(`고칠 곳이 ${missing.length}군데 있어요. 첫 번째 항목으로 이동했어요.`)
      focusMissing(missing[0].focusId)
      return
    }
    setSaveNotice(null)
    setLoading(true)

    try {
      const body = buildTodayCardSavePayload({
        templateType,
        layoutType,
        title,
        subtitle,
        coverImageUrl,
        badgeIds,
        missionId,
        itemBookId,
        regionLabel,
        bodyMarkdown,
        rankingModeId,
        targetHref,
        exposureTags,
        startsAt,
        endsAt,
        sortOrder,
        isActive,
      })

      const res = await fetch(isEdit ? `/api/admin/today/${card.id}` : '/api/admin/today', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? '저장 실패')
      }
      router.push(`/admin/today?date=${returnDate}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!card) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/today/${card.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? '삭제 실패')
      }
      router.push(`/admin/today?date=${returnDate}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  // ── 섹션 상태·미리보기 ─────────────────────────────────────────────────

  const sections = visibleTodaySections(templateType)
  const statuses = computeTodaySectionStatuses({
    templateType,
    title,
    badgeCount: badgeIds.length,
    missionId: missionId || null,
    itemBookId: itemBookId || null,
    regionLabel,
    bodyMarkdown,
    rankingModeId: rankingModeId || null,
    exposureTagCount: exposureTags.length,
    hasStartsAt: Boolean(startsAt),
    hasEndsAt: Boolean(endsAt),
  })
  const sectionHeader = (id: TodaySectionId) => ({
    id,
    title: todaySectionTitle(id),
    description: todaySectionDescription(id),
    status: statuses[id],
  })

  const titleInvalid = missingKeys.has('title')
  const exposureTagsInvalid = missingKeys.has('exposureTags')
  const startsAtInvalid = missingKeys.has('startsAt')
  const endsAtInvalid = missingKeys.has('endsAt')

  // 홈 화면과 같은 카드 렌더링 부품(TodayCardStack)을 그대로 재사용해 지금 폼 값으로 만든
  // 카드 하나만 담아 넘긴다(User Story 4). 날짜 미리보기 모달(TodayPreviewModal.tsx)과 달리
  // 저장 없이 실시간으로 갱신된다.
  const previewCardBase: TodayCardRow = {
    id: card?.id ?? 'preview',
    template_type: templateType,
    layout_type: layoutType,
    title: title.trim() || '(제목 미입력)',
    subtitle: subtitle.trim() || null,
    cover_image_url: coverImageUrl.trim() || null,
    badge_ids: badgeIds,
    mission_id: missionId || null,
    item_book_id: itemBookId || null,
    region_label: regionLabel.trim() || null,
    body_markdown: bodyMarkdown || null,
    ranking_mode_id: rankingModeId || null,
    target_href: targetHref.trim() || null,
    exposure_tags: exposureTags,
    starts_at: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
    ends_at: endsAt ? new Date(endsAt).toISOString() : new Date().toISOString(),
    sort_order: Number(sortOrder) || 0,
    is_active: isActive,
    created_at: card?.created_at ?? new Date().toISOString(),
    created_by: card?.created_by ?? null,
  }
  const previewCard: TodayCardWithHref = {
    ...previewCardBase,
    // 랭킹모드의 대상이 미션 참가자일 때 미션 링크까지 정확히 재현하려면 랭킹모드 전체 행이
    // 필요한데, 이 폼은 목록용 { id, title }만 들고 있다 — 레일 미리보기는 카드 모양(제목·
    // 순위 목록) 확인이 목적이라 이동 경로 정확도는 범위 밖으로 남겨둔다(비대화형 미리보기).
    resolved_href: resolveTargetHref(previewCardBase),
    resolved_badges: selectedBadgeChips.map((b) => ({
      id: b.id,
      name: b.name,
      image_url: b.image_url ?? null,
      rarity: b.rarity ?? null,
      earned: true,
    })),
    resolved_ranking: previewRanking,
  }

  // ── 섹션 본문 ─────────────────────────────────────────────────────────

  const classSection = (
    <TodaySectionCard {...sectionHeader('class')}>
      <div className="@container">
        <div className={FIELD_GRID_CLASS}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="today-card-template">템플릿 타입</FieldLabel>
            <Select value={templateType} onValueChange={(v) => changeTemplateType(v as TodayCardTemplateType)}>
              <SelectTrigger id="today-card-template" aria-describedby="today-card-template-help">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={themeContainer ?? undefined}>
                {TODAY_TEMPLATE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldMessage id="today-card-template-help">콘텐츠 종류예요. 아래 참조 컨텐츠가 여기에 맞춰 바뀌어요.</FieldMessage>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="today-card-layout">노출 형태</FieldLabel>
            <Select value={layoutType} onValueChange={(v) => setLayoutType(v as TodayCardLayoutType)}>
              <SelectTrigger id="today-card-layout" aria-describedby="today-card-layout-help">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={themeContainer ?? undefined}>
                {TODAY_LAYOUT_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldMessage id="today-card-layout-help">화면에 보여줄 모양이에요.</FieldMessage>
          </div>
        </div>
      </div>
    </TodaySectionCard>
  )

  const basicSection = (
    <TodaySectionCard {...sectionHeader('basic')}>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={FOCUS_ID.title} required>
          제목
        </FieldLabel>
        <Input
          id={FOCUS_ID.title}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="핫한 성수동에서 발견된 Epic 배지 5"
          autoComplete="off"
          aria-invalid={titleInvalid || undefined}
          aria-describedby={titleInvalid ? 'today-card-title-error' : undefined}
          className="aria-invalid:border-destructive"
        />
        {titleInvalid && (
          <FieldMessage id="today-card-title-error" tone="error">
            제목을 입력해 주세요.
          </FieldMessage>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="today-card-subtitle">부제</FieldLabel>
        <Input id="today-card-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="today-card-cover">커버 이미지 URL</FieldLabel>
        <Input
          id="today-card-cover"
          value={coverImageUrl}
          onChange={(e) => setCoverImageUrl(e.target.value)}
          placeholder="https://..."
          autoComplete="off"
          aria-describedby="today-card-cover-help"
        />
        <FieldMessage id="today-card-cover-help">
          비워 두면 템플릿에 따라 첫 배지 이미지로 대체되거나 이미지 없이 노출돼요.
        </FieldMessage>
      </div>
    </TodaySectionCard>
  )

  const refSection = hasRef && (
    <TodaySectionCard {...sectionHeader('ref')}>
      {fields.badges && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="today-card-badges">배지</FieldLabel>
          <div id="today-card-badges">
            <BadgeMultiSearchSelect selected={selectedBadgeChips} onSelect={addBadge} onRemove={removeBadge} placeholder="배지 이름 검색..." />
          </div>
          <FieldMessage id="today-card-badges-help">여러 개 선택할 수 있어요.</FieldMessage>
        </div>
      )}

      {fields.mission && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <FieldLabel htmlFor="today-card-mission">미션</FieldLabel>
          <Select value={missionId || NONE_VALUE} onValueChange={(v) => setMissionId(v === NONE_VALUE ? '' : v)}>
            <SelectTrigger id="today-card-mission" aria-describedby="today-card-mission-help">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={themeContainer ?? undefined}>
              <SelectItem value={NONE_VALUE}>없음</SelectItem>
              {missions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldMessage id="today-card-mission-help">이 카드가 소개할 미션이에요.</FieldMessage>
        </div>
      )}

      {fields.itemBook && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <FieldLabel htmlFor="today-card-itembook">컬렉션</FieldLabel>
          <Select value={itemBookId || NONE_VALUE} onValueChange={(v) => setItemBookId(v === NONE_VALUE ? '' : v)}>
            <SelectTrigger id="today-card-itembook">
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
      )}

      {fields.region && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="today-card-region">지역명</FieldLabel>
          <Input id="today-card-region" value={regionLabel} onChange={(e) => setRegionLabel(e.target.value)} placeholder="성수동" autoComplete="off" />
        </div>
      )}

      {fields.body && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="today-card-body">본문</FieldLabel>
          <Textarea
            id="today-card-body"
            value={bodyMarkdown}
            onChange={(e) => setBodyMarkdown(e.target.value)}
            rows={8}
            placeholder={'첫 문단...\n\n두 번째 문단...'}
            className="resize-y font-mono"
            aria-describedby="today-card-body-help"
          />
          <FieldMessage id="today-card-body-help">빈 줄로 문단을 구분해요.</FieldMessage>
        </div>
      )}

      {fields.rankingMode && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <FieldLabel htmlFor="today-card-ranking-mode">랭킹 규칙</FieldLabel>
          <Select value={rankingModeId || NONE_VALUE} onValueChange={(v) => setRankingModeId(v === NONE_VALUE ? '' : v)}>
            <SelectTrigger id="today-card-ranking-mode" aria-describedby="today-card-ranking-mode-help">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={themeContainer ?? undefined}>
              <SelectItem value={NONE_VALUE}>없음</SelectItem>
              {rankingModes.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldMessage id="today-card-ranking-mode-help">
            이 카드가 보여줄 순위예요. 랭킹 규칙이 없다면{' '}
            <a href="/admin/ranking-modes/new" target="_blank" rel="noreferrer" className="underline">
              먼저 만들어 주세요
            </a>
            .
          </FieldMessage>
        </div>
      )}
    </TodaySectionCard>
  )

  const exposeSection = (
    <TodaySectionCard {...sectionHeader('expose')}>
      <div className="flex flex-col gap-2">
        <FieldLabel id="today-card-exposure-tags-label" required>
          노출조건 태그
        </FieldLabel>
        <div
          id={FOCUS_ID.exposureTags}
          role="group"
          aria-labelledby="today-card-exposure-tags-label"
          aria-describedby={cn('today-card-exposure-tags-help', exposureTagsInvalid && 'today-card-exposure-tags-error') || undefined}
          className="flex flex-wrap gap-2"
        >
          {TODAY_EXPOSURE_TAG_OPTIONS.map((t) => {
            const checked = exposureTags.includes(t.value)
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={checked}
                aria-describedby={exposureTagsInvalid ? 'today-card-exposure-tags-error' : undefined}
                onClick={() => toggleTag(t.value)}
                className={cn(
                  'inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-foreground/80 hover:bg-muted',
                  exposureTagsInvalid && !checked && 'border-destructive'
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        <FieldMessage id="today-card-exposure-tags-help">하나라도 해당하면 노출돼요(OR 매칭).</FieldMessage>
        {exposureTagsInvalid && (
          <FieldMessage id="today-card-exposure-tags-error" tone="error">
            노출조건 태그를 하나 이상 선택해 주세요.
          </FieldMessage>
        )}
      </div>

      {fields.targetHref && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="today-card-target-href">이동 경로</FieldLabel>
          <Input
            id="today-card-target-href"
            value={targetHref}
            onChange={(e) => setTargetHref(e.target.value)}
            placeholder="/badges 또는 /badges/{id}"
            autoComplete="off"
            aria-describedby="today-card-target-href-help"
          />
          <FieldMessage id="today-card-target-href-help">비워 두면 템플릿 규칙으로 자동 생성돼요.</FieldMessage>
        </div>
      )}
      {templateType === 'drop_alert' && <FieldMessage>이동 경로는 /drops로 고정돼요.</FieldMessage>}
      {templateType === 'editorial_article' && <FieldMessage>이동 경로는 전용 기사 페이지(/today/{'{id}'})로 고정돼요.</FieldMessage>}
    </TodaySectionCard>
  )

  const periodSection = (
    <TodaySectionCard {...sectionHeader('period')}>
      <div className="@container">
        <div className={FIELD_GRID_CLASS}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor={FOCUS_ID.startsAt} required>
              시작 일시
            </FieldLabel>
            <Input
              id={FOCUS_ID.startsAt}
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              aria-invalid={startsAtInvalid || undefined}
              className="aria-invalid:border-destructive"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor={FOCUS_ID.endsAt} required>
              종료 일시
            </FieldLabel>
            <Input
              id={FOCUS_ID.endsAt}
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              aria-invalid={endsAtInvalid || undefined}
              className="aria-invalid:border-destructive"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="today-card-sort-order">정렬 순서</FieldLabel>
            <Input
              id="today-card-sort-order"
              type="number"
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              aria-describedby="today-card-sort-order-help"
              className="tabular-nums"
            />
            <FieldMessage id="today-card-sort-order-help">작을수록 위에 노출돼요.</FieldMessage>
          </div>
          <div className="flex min-w-0 flex-col justify-end gap-1.5 pb-1.5">
            <div className="flex items-center gap-2.5">
              <Checkbox id="today-card-active" checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
              <label htmlFor="today-card-active" className="cursor-pointer text-sm font-medium text-foreground">
                활성화
              </label>
            </div>
          </div>
        </div>
      </div>
      {(startsAtInvalid || endsAtInvalid) && (
        <FieldMessage tone="error">시작·종료 일시를 모두 입력해 주세요.</FieldMessage>
      )}
    </TodaySectionCard>
  )

  const sectionNodes: Record<TodaySectionId, ReactNode> = {
    class: classSection,
    basic: basicSection,
    ref: refSection,
    expose: exposeSection,
    period: periodSection,
  }

  const rail = (
    <>
      <RailCard title="홈 화면 미리보기" className="@2xl:row-span-2 @4xl:row-span-1">
        {/* 홈 화면 실제 캔버스와 동일한 배경(bg-surface, DS v2 다크 그레이) 위에 그려야
            TodayCardStack의 tone="inverse"(흰 카드) 대비가 실제 화면과 같게 보인다
            (TodayPreviewModal.tsx와 동일 이유). */}
        <div className="rounded-lg bg-surface p-4 text-text">
          <TodayCardStack cards={[previewCard]} />
        </div>
      </RailCard>

      <RailCard title="섹션">
        <TodaySectionNav items={sections.map((id) => ({ id, label: todaySectionTitle(id), status: statuses[id] }))} />
      </RailCard>

      <RailCard className={cn('flex flex-col gap-2', RAIL_ACTIONS_CLASS)}>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? '저장 중...' : isEdit ? '수정 저장' : '카드 등록'}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => router.push(`/admin/today?date=${returnDate}`)}>
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
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-6xl">
      <TodayEditorShell
        header={header}
        railLabel="미리보기와 저장"
        main={sections.map((id) => (
          <Fragment key={id}>{sectionNodes[id]}</Fragment>
        ))}
        rail={rail}
      />

      {/* 삭제 확인 — Radix AlertDialog(BadgeForm.tsx와 동일 패턴) */}
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open && !loading) setShowDeleteConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>투데이 카드 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              &apos;{card?.title}&apos; 카드를 삭제합니다. 삭제하면 되돌릴 수 없습니다.
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
