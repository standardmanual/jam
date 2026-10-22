'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Skeleton } from '@/components/admin/ui/skeleton'
import BadgeSearchSelect from '@/components/admin/BadgeSearchSelect'
import { FieldLabel, FieldMessage, SuffixInput } from '@/app/admin/badges/BadgeFormControls'
import {
  TIER_NAME_LABEL,
  findDuplicateRewardBadgeTiers,
  parsePointsText,
  type TierRewardRow,
} from '@/lib/admin/itembookTierRewards'
import { TIER_ORDER, type TierName } from '@/lib/itembook/tier-readiness'

/**
 * 컬렉션 등급별 보상 편집기 (티켓 20261022_1139 2회, 상위 20261022_1131 묶음 7)
 *
 * 4등급 방식이 켜진 컬렉션에서만 붙는다(`app/admin/itembooks/[id]/page.tsx`). 등급 네 개의 포인트와 보상 배지를 한 번에 저장한다.
 *   - 포인트: 비우면 기본값(`item_book_tier_default_rewards`, 칸 안내에 값을 보인다), 0이면 지급하지 않는다. 기본값을 바꾸는 곳은 설정 구역이다.
 *   - 보상 배지: 기존 `BadgeSearchSelect`를 쓴다. 비우면 주지 않는다. 같은 배지를 두 등급에 고르면 저장하지 못한다(서버도 400이다).
 * 읽기·저장은 `GET`·`PUT /api/admin/itembooks/[id]/tier-rewards`다. 이미 받은 보상은 바뀌지 않는다.
 *
 * 보기 부분(`ItemBookTierRewardsView`)은 훅이 없는 표시 컴포넌트로 떼어 서버 렌더 시험이 값만 넣어 그릴 수 있게 한다.
 * 한국어 줄바꿈 설정은 UX_WRITING_GUIDELINE §3.2를 따른다.
 */

const TEXT = 'break-keep wrap-break-word'
const PARAGRAPH = `${TEXT} text-pretty`
const LABEL = `${TEXT} whitespace-nowrap`
const TITLE = `${TEXT} text-balance`

const LOAD_ERROR_MESSAGE = '등급별 보상을 불러오지 못했어요. 네트워크가 끊겼거나 서버에서 오류가 났을 수 있어요. 다시 불러와 주세요.'
const SAVE_ERROR_MESSAGE = '등급별 보상을 저장하지 못했어요. 네트워크가 끊겼거나 서버에서 오류가 났을 수 있어요. 잠시 뒤 다시 시도해 주세요.'
const INVALID_POINTS_MESSAGE = '포인트는 0 이상의 정수로 써 주세요. 기본값을 쓰려면 비워 두세요.'

export type TierRewardsStatus = 'loading' | 'ready' | 'error'

/** 편집 중인 한 등급. 포인트는 입력한 글 그대로, 보상 배지는 id(비면 빈 문자열)다 */
export interface TierRewardDraft {
  tier: TierName
  points: string
  badgeId: string
}

export interface ItemBookTierRewardsViewProps {
  status: TierRewardsStatus
  loadError: string | null
  /** 서버에서 읽은 등급 네 행 — 기본값과 보상 배지 이름을 보이는 데 쓴다 */
  rows: TierRewardRow[]
  drafts: TierRewardDraft[]
  /** 서버에서 읽을 때마다 올라가는 값. 보상 배지 칸을 새로 그려 처음 라벨을 다시 읽게 한다 */
  version: number
  busy: boolean
  /** 저장이 거절되거나 실패한 이유 */
  saveError: string | null
  onPointsChange: (tier: TierName, text: string) => void
  onBadgeChange: (tier: TierName, badgeId: string) => void
  onSave: () => void
  onRetry: () => void
}

export function draftsFromRows(rows: readonly TierRewardRow[]): TierRewardDraft[] {
  return rows.map((row) => ({
    tier: row.tier,
    points: row.rewardPoints === null ? '' : String(row.rewardPoints),
    badgeId: row.rewardBadgeId ?? '',
  }))
}

/** 저장할 수 없는 이유가 있는지 — 포인트 글이 정수가 아니거나, 같은 배지를 두 등급에 골랐다 */
export function blockingReasons(drafts: readonly TierRewardDraft[]) {
  const invalidPointTiers = drafts.filter((draft) => !parsePointsText(draft.points).ok).map((draft) => draft.tier)
  const duplicates = findDuplicateRewardBadgeTiers(drafts.map((draft) => ({ tier: draft.tier, rewardBadgeId: draft.badgeId || null })))
  return { invalidPointTiers, duplicates, blocked: invalidPointTiers.length > 0 || duplicates.length > 0 }
}

function TierRewardRowView({
  row,
  draft,
  version,
  invalidPoints,
  duplicateWith,
  disabled,
  onPointsChange,
  onBadgeChange,
}: {
  row: TierRewardRow
  draft: TierRewardDraft
  version: number
  invalidPoints: boolean
  duplicateWith: TierName[]
  disabled: boolean
  onPointsChange: (tier: TierName, text: string) => void
  onBadgeChange: (tier: TierName, badgeId: string) => void
}) {
  const label = TIER_NAME_LABEL[row.tier]
  const pointsId = `itembook-tier-reward-${row.tier}-points`
  const helpId = `${pointsId}-help`
  const badgeLabelId = `itembook-tier-reward-${row.tier}-badge-label`
  const defaultText = row.defaultPoints === null ? '기본값' : `기본값 ${row.defaultPoints}`

  return (
    <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1.4fr)]" data-tier={row.tier}>
      <h3 className={`text-sm font-semibold ${TITLE}`}>{label}</h3>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={pointsId} className={LABEL}>
          {label} 포인트
        </FieldLabel>
        <SuffixInput
          id={pointsId}
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={draft.points}
          onChange={(e) => onPointsChange(row.tier, e.target.value)}
          placeholder={defaultText}
          suffix="포인트"
          disabled={disabled}
          aria-invalid={invalidPoints}
          describedBy={helpId}
        />
        <FieldMessage id={helpId} tone={invalidPoints ? 'error' : 'help'} className={PARAGRAPH}>
          {invalidPoints
            ? INVALID_POINTS_MESSAGE
            : `${row.defaultPoints === null ? '비우면 기본값을 써요.' : `비우면 기본값 ${row.defaultPoints}포인트를 써요.`} 0이면 포인트를 주지 않아요.`}
        </FieldMessage>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel id={badgeLabelId} className={LABEL}>
          {label} 보상 배지
        </FieldLabel>
        <div role="group" aria-labelledby={badgeLabelId}>
          <BadgeSearchSelect
            key={`${row.tier}-${version}`}
            value={draft.badgeId}
            initialLabel={row.rewardBadgeName ?? undefined}
            placeholder="보상 배지 검색..."
            onChange={(id) => onBadgeChange(row.tier, id)}
          />
        </div>
        {duplicateWith.length > 0 ? (
          <FieldMessage tone="error" className={PARAGRAPH}>
            {duplicateWith.map((tier) => TIER_NAME_LABEL[tier]).join('·')}에서도 같은 배지를 골랐어요.
          </FieldMessage>
        ) : (
          <FieldMessage className={PARAGRAPH}>비우면 보상 배지를 주지 않아요.</FieldMessage>
        )}
      </div>
    </div>
  )
}

/** 훅 없는 표시 컴포넌트 — 서버 렌더 시험이 값만 넣어 그린다. */
export function ItemBookTierRewardsView({
  status,
  loadError,
  rows,
  drafts,
  version,
  busy,
  saveError,
  onPointsChange,
  onBadgeChange,
  onSave,
  onRetry,
}: ItemBookTierRewardsViewProps) {
  const { invalidPointTiers, duplicates, blocked } = blockingReasons(drafts)

  return (
    <section aria-labelledby="itembook-tier-rewards-heading" className="space-y-4">
      <h2 id="itembook-tier-rewards-heading" className={`text-xl font-bold ${TITLE}`}>
        등급별 보상
      </h2>
      <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>
        유저가 등급 하나를 완성할 때 한 번 받는 포인트와 보상 배지예요. 저장한 값은 앞으로 등급을 완성하는 유저부터 적용되고, 이미 받은 보상은 바뀌지 않아요.
      </p>

      {status === 'loading' && (
        <div className="space-y-2" aria-busy="true">
          <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>등급별 보상을 불러오는 중이에요.</p>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {status === 'error' && (
        <Alert variant="destructive">
          <AlertTitle className={TITLE}>등급별 보상을 보여 줄 수 없어요</AlertTitle>
          <AlertDescription>
            <p className={PARAGRAPH}>{loadError ?? LOAD_ERROR_MESSAGE}</p>
            <Button type="button" variant="outline" size="sm" className={`mt-3 ${LABEL}`} onClick={onRetry}>
              다시 불러오기
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {status === 'ready' && (
        <>
          <div className="space-y-3">
            {rows.map((row) => {
              const draft = drafts.find((d) => d.tier === row.tier) ?? { tier: row.tier, points: '', badgeId: '' }
              const group = duplicates.find((d) => d.tiers.includes(row.tier))
              return (
                <TierRewardRowView
                  key={row.tier}
                  row={row}
                  draft={draft}
                  version={version}
                  invalidPoints={invalidPointTiers.includes(row.tier)}
                  duplicateWith={group ? group.tiers.filter((tier) => tier !== row.tier) : []}
                  disabled={busy}
                  onPointsChange={onPointsChange}
                  onBadgeChange={onBadgeChange}
                />
              )
            })}
          </div>

          {duplicates.length > 0 && (
            <Alert variant="warning">
              <AlertTitle className={TITLE}>같은 배지를 두 등급에 골랐어요</AlertTitle>
              <AlertDescription>
                <p className={PARAGRAPH}>
                  한 배지는 한 번만 받을 수 있어서 두 등급이 나누면 한 등급의 보상만 나가요. 등급마다 다른 배지를 고르거나 비워야 저장할 수 있어요.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {saveError && (
            <Alert variant="destructive">
              <AlertDescription>
                <p className={PARAGRAPH}>{saveError}</p>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className={LABEL} disabled={busy || blocked} onClick={onSave}>
              {busy ? '저장하는 중' : '등급별 보상 저장'}
            </Button>
            {blocked && <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>빨간 안내를 먼저 고쳐 주세요.</p>}
          </div>
        </>
      )}
    </section>
  )
}

type RewardsState = { ok: true; rows: TierRewardRow[] } | { ok: false; message: string }

async function requestRewards(itemBookId: string): Promise<RewardsState> {
  try {
    const res = await fetch(`/api/admin/itembooks/${itemBookId}/tier-rewards`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, message: typeof data.error === 'string' ? data.error : LOAD_ERROR_MESSAGE }
    return { ok: true, rows: data.tiers as TierRewardRow[] }
  } catch {
    return { ok: false, message: LOAD_ERROR_MESSAGE }
  }
}

interface ItemBookTierRewardsProps {
  itemBookId: string
}

export function ItemBookTierRewards({ itemBookId }: ItemBookTierRewardsProps) {
  const [status, setStatus] = useState<TierRewardsStatus>('loading')
  const [rows, setRows] = useState<TierRewardRow[]>([])
  const [drafts, setDrafts] = useState<TierRewardDraft[]>([])
  const [version, setVersion] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const apply = useCallback((result: RewardsState) => {
    if (result.ok) {
      setRows(result.rows)
      setDrafts(draftsFromRows(result.rows))
      setVersion((v) => v + 1)
      setLoadError(null)
      setStatus('ready')
    } else {
      setLoadError(result.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void requestRewards(itemBookId).then((result) => {
      if (!cancelled) apply(result)
    })
    return () => {
      cancelled = true
    }
  }, [itemBookId, apply])

  const retry = async () => {
    setStatus('loading')
    apply(await requestRewards(itemBookId))
  }

  const save = async () => {
    // 화면에서 한 번 더 거른다(서버도 같은 규칙으로 거절한다)
    const { blocked } = blockingReasons(drafts)
    if (blocked) return
    setBusy(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/admin/itembooks/${itemBookId}/tier-rewards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiers: TIER_ORDER.map((tier) => {
            const draft = drafts.find((d) => d.tier === tier)
            const parsed = parsePointsText(draft?.points ?? '')
            return {
              tier,
              reward_points: parsed.ok ? parsed.value : null,
              reward_badge_id: draft?.badgeId ? draft.badgeId : null,
            }
          }),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 입력은 그대로 두고 이유만 보인다. 저장은 같은 값으로 다시 눌러도 결과가 같아(upsert·delete) 서버 오류 뒤에 다시 저장해도 안전하다.
        setSaveError(typeof data.error === 'string' ? data.error : SAVE_ERROR_MESSAGE)
        return
      }
      toast.success('등급별 보상을 저장했어요.')
      apply(await requestRewards(itemBookId))
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ItemBookTierRewardsView
      status={status}
      loadError={loadError}
      rows={rows}
      drafts={drafts}
      version={version}
      busy={busy}
      saveError={saveError}
      onPointsChange={(tier, text) => setDrafts((current) => current.map((d) => (d.tier === tier ? { ...d, points: text } : d)))}
      onBadgeChange={(tier, badgeId) => setDrafts((current) => current.map((d) => (d.tier === tier ? { ...d, badgeId } : d)))}
      onSave={save}
      onRetry={retry}
    />
  )
}
