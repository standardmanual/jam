'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Badge } from '@/components/admin/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/admin/ui/alert-dialog'
import { TIER_ORDER, type TierName, type TierReadiness } from '@/lib/itembook/tier-readiness'

/**
 * 컬렉션 4등급 방식 켜기·끄기 패널 (티켓 20261022_1139 1회, 상위 20261022_1131 묶음 7)
 *
 * 현재 상태(켜짐·꺼짐)와 켜기 전 점검 세 가지를 보여 주고 켜기·끄기를 한다. 점검은 `GET /api/admin/itembooks/[id]/tier`,
 * 쓰기는 같은 경로의 `PUT { tier_mode }`다. 켜기를 막는 이유는 숫자로 보인다(유저 id는 응답에 없다).
 *   1. 장착한 등급 분포 — 여러 등급을 장착한 유저가 있으면 켜기를 막는다.
 *   2. 이름 점검 — 경고로만 보인다. 켜기를 막지 않는다.
 *   3. 등급별 완성 기록 — 하나라도 있으면 끄기를 막는다.
 *
 * 보기 부분(`ItemBookTierPanelView`)은 훅이 없는 표시 컴포넌트로 떼어 서버 렌더 시험이 값만 넣어 그릴 수 있게 한다.
 * 한국어 줄바꿈 설정은 UX_WRITING_GUIDELINE §3.2를 따른다.
 */

const TEXT = 'break-keep wrap-break-word'
const PARAGRAPH = `${TEXT} text-pretty`
const LABEL = `${TEXT} whitespace-nowrap`
const TITLE = `${TEXT} text-balance`

const LOAD_ERROR_MESSAGE = '점검 결과를 불러오지 못했어요. 네트워크가 끊겼거나 서버에서 오류가 났을 수 있어요. 다시 불러와 주세요.'
const SAVE_ERROR_MESSAGE = '4등급 방식을 바꾸지 못했어요. 네트워크가 끊겼거나 서버에서 오류가 났을 수 있어요. 잠시 뒤 다시 시도해 주세요.'

const TIER_LABEL: Record<TierName, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic' }

export type TierPanelStatus = 'loading' | 'ready' | 'error'

export interface ItemBookTierPanelViewProps {
  status: TierPanelStatus
  tierMode: boolean
  /** `status`가 `ready`일 때만 쓴다 */
  readiness: TierReadiness | null
  loadError: string | null
  /** 켜기·끄기 요청 중 — 버튼을 잠근다 */
  busy: boolean
  /** 켜기·끄기가 거절되거나 실패한 이유 */
  actionError: string | null
  onToggle: () => void
  onRetry: () => void
}

function TierCombo({ tiers }: { tiers: readonly TierName[] }) {
  return <>{tiers.map((tier) => TIER_LABEL[tier]).join(' + ')}</>
}

function DistributionCheck({ readiness }: { readiness: TierReadiness }) {
  const { distribution } = readiness
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h3 className={`text-sm font-semibold ${TITLE}`}>1. 장착한 등급 분포 (켜기를 막는 점검)</h3>
      {distribution.slotCount === 0 ? (
        <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>아직 이 컬렉션에 장착한 유저가 없어요.</p>
      ) : (
        <>
          <p className={`text-sm ${PARAGRAPH}`}>
            장착 {distribution.slotCount}개, 장착한 유저 {distribution.userCount}명이에요.
          </p>
          <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>
            등급별 유저:{' '}
            {TIER_ORDER.map((tier) => `${TIER_LABEL[tier]} ${distribution.userCountByTier[tier]}명`).join(' · ')}
          </p>
        </>
      )}
      {distribution.noTierSlotCount > 0 && (
        <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>
          등급이 비어 있는 배지에 꽂힌 장착 {distribution.noTierSlotCount}개는 등급을 가릴 때 빠져요.
        </p>
      )}
      {distribution.multiTierUserCount > 0 ? (
        <Alert variant="destructive">
          <AlertTitle className={TITLE}>여러 등급을 장착한 유저가 {distribution.multiTierUserCount}명 있어요</AlertTitle>
          <AlertDescription>
            <p className={PARAGRAPH}>
              켜면 이 유저들의 장착이 등급 규칙과 어긋나요. 장착을 정리한 뒤에 켤 수 있어요. 정리는 이 화면에서 하지 않아요.
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {distribution.multiTierCombos.map((combo) => (
                <li key={combo.tiers.join('+')} className={TEXT}>
                  <TierCombo tiers={combo.tiers} />: {combo.userCount}명
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        distribution.slotCount > 0 && (
          <p className={`text-sm ${PARAGRAPH}`}>여러 등급을 장착한 유저가 없어요. 이 점검은 통과예요.</p>
        )
      )}
    </div>
  )
}

function NamesCheck({ readiness }: { readiness: TierReadiness }) {
  const { names } = readiness
  const hasWarning = names.duplicateTierNameCount > 0 || names.tierCountMismatch
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h3 className={`text-sm font-semibold ${TITLE}`}>2. 이름 점검 (경고만 해요)</h3>
      {names.nameCount === 0 ? (
        <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>아직 이 컬렉션에 아이템 배지가 없어요.</p>
      ) : (
        <>
          <p className={`text-sm ${PARAGRAPH}`}>
            이름 {names.nameCount}개예요. 등급 수별로 {names.tierCountGroups.map((g) => `${g.tierCount}등급 ${g.nameCount}개`).join(', ')}예요.
          </p>
          {names.noTierBadgeCount > 0 && (
            <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>
              등급이 비어 있는 배지 {names.noTierBadgeCount}개는 어느 등급의 칸에도 들지 않아요.
            </p>
          )}
          {hasWarning ? (
            <Alert variant="warning">
              <AlertTitle className={TITLE}>이름을 맞춰야 완성되는 칸이 있어요</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-0.5 pl-5">
                  {names.duplicateTierNameCount > 0 && (
                    <li className={TEXT}>같은 이름에 같은 등급 배지가 둘 이상인 이름이 {names.duplicateTierNameCount}개 있어요.</li>
                  )}
                  {names.tierCountMismatch && <li className={TEXT}>이름마다 등급 수가 달라요.</li>}
                </ul>
                <p className={`mt-2 ${PARAGRAPH}`}>켜는 것은 막지 않아요. 켠 뒤에 이름을 맞춰도 돼요. 맞추기 전에는 그 칸이 채워지지 않아 컬렉션이 완성되지 않을 수 있어요.</p>
              </AlertDescription>
            </Alert>
          ) : (
            <p className={`text-sm ${PARAGRAPH}`}>이름마다 등급 수가 같고 겹치는 등급도 없어요.</p>
          )}
          <details className="text-sm">
            <summary className={`cursor-pointer ${LABEL}`}>이름별 등급 보기 ({names.nameCount}개)</summary>
            <Table className="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead className={LABEL}>이름</TableHead>
                  {TIER_ORDER.map((tier) => (
                    <TableHead key={tier} className={LABEL}>
                      {TIER_LABEL[tier]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {names.rows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className={TEXT}>{row.name}</TableCell>
                    {TIER_ORDER.map((tier) => (
                      <TableCell key={tier} className={row.counts[tier] > 1 ? 'font-semibold text-amber-700' : undefined}>
                        {row.counts[tier] === 0 ? '-' : row.counts[tier]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </>
      )}
    </div>
  )
}

function CompletionCheck({ readiness }: { readiness: TierReadiness }) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h3 className={`text-sm font-semibold ${TITLE}`}>3. 등급별 완성 기록 (끄기를 막는 점검)</h3>
      {readiness.tierCompletionCount > 0 ? (
        <p className={`text-sm ${PARAGRAPH}`}>
          등급별 완성 기록이 {readiness.tierCompletionCount}건 있어요. 기록이 있는 컬렉션은 끌 수 없어요.
        </p>
      ) : (
        <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>등급별 완성 기록이 아직 없어요.</p>
      )}
    </div>
  )
}

/** 훅 없는 표시 컴포넌트 — 서버 렌더 시험이 값만 넣어 그린다. */
export function ItemBookTierPanelView({
  status,
  tierMode,
  readiness,
  loadError,
  busy,
  actionError,
  onToggle,
  onRetry,
}: ItemBookTierPanelViewProps) {
  const toggleBlockedReason =
    status === 'ready' && readiness
      ? tierMode
        ? readiness.canDisable
          ? null
          : '등급별 완성 기록이 있어서 끌 수 없어요.'
        : readiness.canEnable
          ? null
          : '여러 등급을 장착한 유저가 있어서 켤 수 없어요.'
      : null

  return (
    <section aria-labelledby="itembook-tier-heading" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="itembook-tier-heading" className={`text-xl font-bold ${TITLE}`}>
          4등급 방식
        </h2>
        <Badge variant={tierMode ? 'default' : 'secondary'} className={LABEL}>
          {tierMode ? '켜짐' : '꺼짐'}
        </Badge>
      </div>
      <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>
        같은 이름의 배지 4등급(Common · Rare · Epic · Mystic)을 한 칸으로 묶어 등급별로 완성하고 보상하는 방식이에요. 켜도 이미 받은 기록과 장착은 지우지 않아요.
      </p>

      {status === 'loading' && (
        <div className="space-y-2" aria-busy="true">
          <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>켜기 전 점검 결과를 불러오는 중이에요.</p>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {status === 'error' && (
        <Alert variant="destructive">
          <AlertTitle className={TITLE}>점검 결과를 보여 줄 수 없어요</AlertTitle>
          <AlertDescription>
            <p className={PARAGRAPH}>{loadError ?? LOAD_ERROR_MESSAGE}</p>
            <Button type="button" variant="outline" size="sm" className={`mt-3 ${LABEL}`} onClick={onRetry}>
              다시 불러오기
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {status === 'ready' && readiness && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <DistributionCheck readiness={readiness} />
            <NamesCheck readiness={readiness} />
            <CompletionCheck readiness={readiness} />
          </div>

          {actionError && (
            <Alert variant="destructive">
              <AlertDescription>
                <p className={PARAGRAPH}>{actionError}</p>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant={tierMode ? 'outline' : 'default'}
              className={LABEL}
              disabled={busy || toggleBlockedReason !== null}
              onClick={onToggle}
            >
              {busy ? (tierMode ? '끄는 중' : '켜는 중') : tierMode ? '4등급 방식 끄기' : '4등급 방식 켜기'}
            </Button>
            {toggleBlockedReason && <p className={`text-sm text-muted-foreground ${PARAGRAPH}`}>{toggleBlockedReason}</p>}
          </div>
        </>
      )}
    </section>
  )
}

type TierState = { ok: true; tierMode: boolean; readiness: TierReadiness } | { ok: false; message: string }

async function requestTierState(itemBookId: string): Promise<TierState> {
  try {
    const res = await fetch(`/api/admin/itembooks/${itemBookId}/tier`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, message: typeof data.error === 'string' ? data.error : LOAD_ERROR_MESSAGE }
    return { ok: true, tierMode: Boolean(data.tierMode), readiness: data.readiness as TierReadiness }
  } catch {
    return { ok: false, message: LOAD_ERROR_MESSAGE }
  }
}

interface ItemBookTierPanelProps {
  itemBookId: string
  /** 서버에서 읽은 값. 점검 결과를 받기 전 상태 배지에 쓴다 */
  initialTierMode: boolean
}

export function ItemBookTierPanel({ itemBookId, initialTierMode }: ItemBookTierPanelProps) {
  const router = useRouter()
  const [status, setStatus] = useState<TierPanelStatus>('loading')
  const [tierMode, setTierMode] = useState(initialTierMode)
  const [readiness, setReadiness] = useState<TierReadiness | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, 어드민 테마 실값은
  // [data-admin-theme] 스코프 안에만 있다 — 포털 컨테이너를 그 노드로 지정한다(BadgeActiveToggleButton과 같은 패턴).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const apply = useCallback((result: TierState) => {
    if (result.ok) {
      setTierMode(result.tierMode)
      setReadiness(result.readiness)
      setLoadError(null)
      setStatus('ready')
    } else {
      setLoadError(result.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void requestTierState(itemBookId).then((result) => {
      if (!cancelled) apply(result)
    })
    return () => {
      cancelled = true
    }
  }, [itemBookId, apply])

  const retry = async () => {
    setStatus('loading')
    apply(await requestTierState(itemBookId))
  }

  const submit = async () => {
    const next = !tierMode
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/itembooks/${itemBookId}/tier`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier_mode: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(typeof data.error === 'string' ? data.error : SAVE_ERROR_MESSAGE)
        // 막힌 이유가 낡은 점검 결과일 수 있어 다시 읽는다.
        apply(await requestTierState(itemBookId))
        return
      }
      toast.success(next ? '4등급 방식을 켰어요.' : '4등급 방식을 껐어요.')
      apply(await requestTierState(itemBookId))
      // 편집 폼이 서버에서 읽은 tier_mode로 옛 보상 칸을 접거나 펴도록 서버 화면을 다시 읽는다.
      router.refresh()
    } catch {
      setActionError(SAVE_ERROR_MESSAGE)
    } finally {
      setBusy(false)
      setShowConfirm(false)
    }
  }

  return (
    <>
      <ItemBookTierPanelView
        status={status}
        tierMode={tierMode}
        readiness={readiness}
        loadError={loadError}
        busy={busy}
        actionError={actionError}
        onToggle={() => setShowConfirm(true)}
        onRetry={retry}
      />

      <AlertDialog
        open={showConfirm}
        onOpenChange={(open) => {
          if (!open && !busy) setShowConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle className={TITLE}>{tierMode ? '4등급 방식을 끌까요?' : '4등급 방식을 켤까요?'}</AlertDialogTitle>
            <AlertDialogDescription className={PARAGRAPH}>
              {tierMode
                ? '끄면 이 컬렉션은 옛 완성 규칙으로 돌아가요. 이미 받은 기록과 장착은 지우지 않아요.'
                : '켜면 이 컬렉션은 등급별 완성·보상 규칙을 따르고, 한 유저는 한 등급만 장착할 수 있어요. 이미 받은 기록과 장착은 지우지 않아요.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className={LABEL} disabled={busy} onClick={() => setShowConfirm(false)}>
              취소
            </Button>
            <Button type="button" className={LABEL} disabled={busy} onClick={submit}>
              {busy ? (tierMode ? '끄는 중' : '켜는 중') : tierMode ? '끄기' : '켜기'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
