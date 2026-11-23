'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/admin/ui/alert-dialog'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { requestJson } from '@/components/admin/data-table/admin-fetch'
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'
import TodayCardPreview from '@/app/admin/today/TodayCardPreview'
import { FEED_COLOR_LABELS } from '@/app/admin/today/FeedCardSection'
import {
  IMPACT_CARD_LIMIT,
  buildEditedPalette,
  changedColorKeys,
  comparePalettes,
  findNewlyViolatedCards,
  type ColorSlot,
  type FeedColorCardInput,
} from '@/lib/admin/feedColorImpact'
import { DEFAULT_FEED_PALETTE } from '@/lib/today/feedAssign'
import type { CardView } from '@/lib/today/cardView'
import {
  buildFeedPalette,
  isOverrideHex,
  normalizeOverrides,
  FEED_COLOR_VAR_PREFIX,
  type FeedColorOverrides,
} from '@/lib/today/feedColorOverrides'
import type { ColorRuleName } from '@/lib/today/feedColorRules'
import { FEED_COLOR_KEYS, type FeedColorKey } from '@/lib/today/feedConstants'
import { previewView } from '@/lib/today/feedPreviewData'

/**
 * 홈피드 컬러셋 편집기 (티켓 20261121_2146). 색 표 · 미리보기 · 규칙 재계산 · 영향받는 카드 · 적용/복원.
 *
 * 적용 전에는 아무것도 저장하지 않는다. 편집 중인 값은 이 화면의 상태일 뿐이고, 미리보기는 미리보기 컨테이너에만 CSS 변수(`--feed-color-<키>`)를 걸어
 * 저장 전 값이 다른 곳에 새지 않는다. 저장은 «적용»(확인 대화상자를 거쳐)과 «전체 기본값으로 되돌리기»뿐이고 `PUT /api/admin/feed-colors`를 부른다.
 */

const TEXT = 'break-keep wrap-break-word'

const SLOT_LABELS: Readonly<Record<ColorSlot, string>> = { bg: '배경색', chip: '칩 색', box: '박스 색' }

/** 걸린 규칙의 이름(규칙 ②~④). */
const RULE_NAMES: Readonly<Record<ColorRuleName, string>> = {
  same: '같은 색',
  contrast: '대비',
  kids: '어수선함',
  lightness: '밝기 차이',
  image: '이미지 색',
  table: '배제 표',
}

const HEX_ERROR = '#과 영문·숫자 6자리로 입력해 주세요. 예: #ff9a9a'

/**
 * 통합 팔레트 색 9개(노랑·초록·짙은 초록·분홍·하늘·빨강·보라·파랑·흰색)가 한 번씩 보이도록 고른 미리보기 샘플(가짜 카드, 티켓 20261122_2224 회차 9).
 * 짙은 초록 바탕 카드(목록형, 바탕 위 제목·설명이 흰색)를 한 장 포함한다. 색 키는 직접 지정한 값이라 자동 배정에 흔들리지 않고, 칩은 배제 표에 걸리지 않게 골랐다.
 */
const PREVIEW_VIEWS: CardView[] = [
  previewView('hero_box', { bg_color_key: 'yellow', chip_color_key: 'purple', box_color_key: 'sky' }),
  previewView('text_box', { bg_color_key: 'pink', chip_color_key: 'blue', box_color_key: 'yellow' }),
  previewView('badge_intro', { bg_color_key: 'sky', chip_color_key: 'red' }),
  previewView('drop_pickup', { bg_color_key: 'green', chip_color_key: 'white', box_color_key: 'pink' }),
  previewView('gallery_list', { bg_color_key: 'green-deep', chip_color_key: 'pink', box_color_key: 'yellow' }),
  previewView('badge_only', { bg_color_key: 'pink' }),
]

const lower = (hex: string): string => hex.toLowerCase()

type Drafts = Record<FeedColorKey, string>

const draftsFrom = (overrides: FeedColorOverrides): Drafts => {
  const palette = buildFeedPalette(overrides)
  return Object.fromEntries(FEED_COLOR_KEYS.map((key) => [key, lower(palette[key])])) as Drafts
}

const DEFAULT_HEX: Readonly<Record<FeedColorKey, string>> = Object.fromEntries(
  FEED_COLOR_KEYS.map((key) => [key, lower(DEFAULT_FEED_PALETTE[key])]),
) as Record<FeedColorKey, string>

function Swatch({ hex, label }: { hex: string; label?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="inline-block size-6 shrink-0 rounded-full border border-border"
      style={{ backgroundColor: hex }}
    />
  )
}

export interface ColorRowProps {
  colorKey: FeedColorKey
  draft: string
  savedHex: string | null
  changed: boolean
  disabled: boolean
  onChange: (value: string) => void
}

/**
 * 색 한 줄: 이름 · 색 선택기 · hex 칸 · «기본값» 버튼. 기본값과 저장된 값은 줄 안에 따로 적지 않고 버튼 설명(`title`)에 둔다.
 * 편집 값이 저장된 값과 다르면 줄 왼쪽에 굵은 선(`data-changed`)이 서고, 편집 값이 기본값과 다를 때만 «기본값» 버튼이 켜진다.
 */
export function ColorRow({ colorKey, draft, savedHex, changed, disabled, onChange }: ColorRowProps) {
  const name = FEED_COLOR_LABELS[colorKey]
  const valid = isOverrideHex(draft)
  const defaultHex = DEFAULT_HEX[colorKey]
  const inputId = `feed-color-${colorKey}-hex`
  const errorId = `feed-color-${colorKey}-error`
  return (
    <li
      data-color-key={colorKey}
      data-changed={changed ? '' : undefined}
      className={`flex flex-col gap-1 border-l-2 py-1.5 pl-3 ${changed ? 'border-primary' : 'border-transparent'}`}
    >
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className={`min-w-0 flex-1 text-sm ${TEXT}`}>
          {name}
        </label>
        <input
          type="color"
          aria-label={`${name} 색 선택`}
          value={valid ? lower(draft) : (savedHex ?? defaultHex)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="size-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Input
          id={inputId}
          value={draft}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : errorId}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-24 font-mono text-xs"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={`기본값 ${defaultHex}${savedHex ? ` · 저장된 값 ${savedHex}` : ' · 저장된 값 없음'}`}
          disabled={disabled || draft === defaultHex}
          onClick={() => onChange(defaultHex)}
          className="h-8 px-2 text-xs"
        >
          기본값
        </Button>
      </div>
      {changed && <span className="sr-only">바뀜</span>}
      {!valid && (
        <p id={errorId} role="alert" className={`text-xs text-destructive ${TEXT}`}>
          {HEX_ERROR}
        </p>
      )}
    </li>
  )
}

interface ImpactCardListProps {
  cards: ReturnType<typeof findNewlyViolatedCards>
}

export function ImpactCardList({ cards }: ImpactCardListProps) {
  if (cards.total === 0) {
    return <p className={`text-sm text-muted-foreground ${TEXT}`}>지금 노출 중이거나 노출 예정인 카드 중에 새로 규칙에 걸리는 카드는 없어요.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2" aria-label="새로 규칙에 걸리는 카드">
        {cards.cards.map((card) => (
          <li key={card.id} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
            <p className={`font-medium ${TEXT}`}>{card.title}</p>
            {card.violations.map((violation) => (
              <p key={violation.slots.join('-')} className={`text-xs text-muted-foreground ${TEXT}`}>
                {SLOT_LABELS[violation.slots[0]]} {FEED_COLOR_LABELS[violation.keys[0]]} · {SLOT_LABELS[violation.slots[1]]}{' '}
                {FEED_COLOR_LABELS[violation.keys[1]]} 조합이 «{RULE_NAMES[violation.rule]}» 규칙에 걸려요.
              </p>
            ))}
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {card.changedColors.map((color) => (
                <li key={color.slot} className="flex items-center gap-1">
                  <Swatch hex={color.before} />
                  <Swatch hex={color.after} />
                  <span className={TEXT}>
                    {FEED_COLOR_LABELS[color.key]} {color.before} → {color.after}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {cards.hidden > 0 && <p className={`text-sm text-muted-foreground ${TEXT}`}>외 {cards.hidden}장</p>}
    </div>
  )
}

export default function FeedColorsEditor({
  savedOverrides,
  cards,
}: {
  savedOverrides: FeedColorOverrides
  cards: readonly FeedColorCardInput[]
}) {
  const router = useRouter()
  const portalContainer = useAdminPortalContainer()
  const [saved, setSaved] = useState<FeedColorOverrides>(savedOverrides)
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(savedOverrides))
  const [confirm, setConfirm] = useState<'apply' | 'reset' | null>(null)
  const [pending, setPending] = useState(false)

  const savedPalette = useMemo(() => buildFeedPalette(saved), [saved])
  const editedPalette = useMemo(() => buildEditedPalette(savedPalette, drafts), [savedPalette, drafts])
  const changedKeys = useMemo(() => changedColorKeys(savedPalette, editedPalette), [savedPalette, editedPalette])
  const invalidKeys = FEED_COLOR_KEYS.filter((key) => !isOverrideHex(drafts[key]))
  const comparison = useMemo(() => comparePalettes(savedPalette, editedPalette), [savedPalette, editedPalette])
  const impact = useMemo(
    () => findNewlyViolatedCards(savedPalette, editedPalette, cards, IMPACT_CARD_LIMIT),
    [savedPalette, editedPalette, cards],
  )
  // 전체 기본값으로 되돌렸을 때의 변화(확인 대화상자에서 알린다)
  const resetChangedKeys = useMemo(() => changedColorKeys(savedPalette, DEFAULT_FEED_PALETTE), [savedPalette])
  const resetImpact = useMemo(
    () => findNewlyViolatedCards(savedPalette, DEFAULT_FEED_PALETTE, cards, IMPACT_CARD_LIMIT),
    [savedPalette, cards],
  )

  const hasSaved = Object.keys(saved).length > 0
  const draftsDifferFromDefault = FEED_COLOR_KEYS.some((key) => drafts[key] !== DEFAULT_HEX[key])
  const canApply = changedKeys.length > 0 && invalidKeys.length === 0 && !pending
  const canReset = (hasSaved || draftsDifferFromDefault) && !pending

  // 미리보기 컨테이너에만 거는 변수. 저장 전 값이 이 컨테이너 밖으로 새지 않는다.
  const previewVars = useMemo(
    () =>
      Object.fromEntries(
        FEED_COLOR_KEYS.map((key) => [`${FEED_COLOR_VAR_PREFIX}${key}`, lower(editedPalette[key])]),
      ) as CSSProperties,
    [editedPalette],
  )

  const setDraft = (key: FeedColorKey, value: string) => setDrafts((prev) => ({ ...prev, [key]: value }))

  const applyResponse = (response: { overrides?: unknown }) => {
    const next = normalizeOverrides(response.overrides ?? {})
    setSaved(next)
    setDrafts(draftsFrom(next))
    router.refresh()
  }

  const apply = async () => {
    const body: Record<string, string | null> = {}
    for (const key of changedKeys) {
      const next = lower(editedPalette[key])
      body[key] = next === DEFAULT_HEX[key] ? null : next
    }
    setPending(true)
    try {
      applyResponse(
        await requestJson<{ overrides?: unknown }>('/api/admin/feed-colors', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ overrides: body }),
        }),
      )
      toast.success(`색 ${changedKeys.length}개를 적용했어요. 홈 화면에 바로 반영돼요.`)
      setConfirm(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '색을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  const reset = async () => {
    // 저장된 값이 없으면 서버에 보낼 것이 없다 — 편집 중인 값만 기본값으로 되돌린다
    if (!hasSaved) {
      setDrafts(draftsFrom({}))
      setConfirm(null)
      return
    }
    const body = Object.fromEntries(Object.keys(saved).map((key) => [key, null]))
    setPending(true)
    try {
      applyResponse(
        await requestJson<{ overrides?: unknown }>('/api/admin/feed-colors', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ overrides: body }),
        }),
      )
      toast.success('모든 색을 기본값으로 되돌렸어요.')
      setConfirm(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '색을 되돌리지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  const closeDialog = () => {
    if (!pending) setConfirm(null)
  }

  const isReset = confirm === 'reset'
  const dialogChanged = isReset ? resetChangedKeys.length : changedKeys.length
  const dialogImpacted = isReset ? resetImpact.total : impact.total

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={!canApply} onClick={() => setConfirm('apply')}>
          적용
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!canReset} onClick={() => setConfirm('reset')}>
          전체 기본값으로 되돌리기
        </Button>
        <p role="status" className={`text-sm text-muted-foreground ${TEXT}`}>
          {invalidKeys.length > 0
            ? `값이 올바르지 않은 색이 ${invalidKeys.length}개 있어요. 고친 뒤에 적용할 수 있어요.`
            : changedKeys.length > 0
              ? `바뀐 색 ${changedKeys.length}개 · 새로 규칙에 걸리는 카드 ${impact.total}장`
              : '바꾼 색이 없어요.'}
        </p>
      </div>

      {/* 큰 화면에서는 두 칸이 높이를 나눠 갖고 각자 스크롤한다. 좁은 화면에서는 위아래로 쌓여 문서가 스크롤된다. */}
      <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <section aria-label="색 설정" data-pane="settings" className="lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          <ul className="flex flex-col">
            {FEED_COLOR_KEYS.map((key) => (
              <ColorRow
                key={key}
                colorKey={key}
                draft={drafts[key]}
                savedHex={saved[key] ?? null}
                changed={changedKeys.includes(key)}
                disabled={pending}
                onChange={(value) => setDraft(key, value)}
              />
            ))}
          </ul>
        </section>

        <section aria-label="미리보기" data-pane="preview" className="flex flex-col gap-6 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">미리보기</h2>
            <p className={`text-xs text-muted-foreground ${TEXT}`}>편집 중인 색으로 그린 샘플 카드예요. 저장되지 않아요.</p>
            <div data-feed-color-preview="" style={previewVars}>
              <TodayCardPreview views={PREVIEW_VIEWS} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">색 규칙 다시 계산</h2>
            <p data-rule-summary="" className={`text-sm ${TEXT}`}>
              통과하는 조합 {comparison.edited.remaining}개 (지금 {comparison.current.remaining}개)
            </p>
            <p className={`text-xs text-muted-foreground ${TEXT}`}>
              전체 {comparison.edited.total}개 중 대비 {comparison.edited.excludedByContrast}개 · 어수선함{' '}
              {comparison.edited.excludedByKids}개 · 밝기 차이 {comparison.edited.excludedByLightness}개가 빠져요.
            </p>
            {comparison.decreased && (
              <Alert variant="warning">
                <AlertTitle className={TEXT}>통과하는 조합이 {-comparison.delta}개 줄어요</AlertTitle>
                <AlertDescription className={`text-sm ${TEXT}`}>
                  자동 색 배정이 고를 수 있는 조합이 줄어요. 적용은 할 수 있지만 색을 한 번 더 살펴봐 주세요.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h2 className={`text-sm font-semibold ${TEXT}`}>새로 규칙에 걸리는 카드 {impact.total}장</h2>
            <p className={`text-xs text-muted-foreground ${TEXT}`}>
              노출 기간이 아직 끝나지 않은 카드 가운데, 지금은 규칙을 통과하는데 편집 중인 색으로는 걸리는 카드예요. 카드에 저장된 색 이름은 바뀌지 않고
              보이는 색만 바뀌어요. 위에서 {IMPACT_CARD_LIMIT}장까지 보여요.
            </p>
            <ImpactCardList cards={impact} />
          </div>
        </section>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && closeDialog()}>
        <AlertDialogContent container={portalContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle className={TEXT}>{isReset ? '전체 기본값으로 되돌릴까요?' : '컬러셋을 적용할까요?'}</AlertDialogTitle>
            <AlertDialogDescription className={TEXT}>
              바뀌는 색 {dialogChanged}개, 새로 걸리는 카드 {dialogImpacted}장이에요. {isReset ? '저장된 값을 모두 지우고' : '적용하면'} 홈 화면의
              색이 바로 바뀌어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={closeDialog}>
              취소
            </Button>
            <Button type="button" disabled={pending} onClick={isReset ? reset : apply}>
              {pending ? '처리 중...' : isReset ? '되돌리기' : '적용'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
