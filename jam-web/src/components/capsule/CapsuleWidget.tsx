'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ds/components/buttons/Button'
import { Skeleton } from '@ds/components/feedback/Skeleton'
import BadgeRevealOverlay, { type RevealBadge } from '@/components/BadgeRevealOverlay'
import InlineNotice from '@/components/ui/InlineNotice'
import { useToast } from '@/components/ui/Toast'
import CapsuleGauge, { CAPSULE_GAUGE_HEIGHT_PX } from '@/components/capsule/CapsuleGauge'
import { toRevealBadges } from '@/components/capsule/capsuleReveal'
import { fetchCapsule } from '@/lib/capsule/capsule-client'
import { runClaim } from '@/lib/capsule/capsule-flow'
import type { CapsuleNoticeKind, CapsuleStatus } from '@/lib/capsule/capsule-contract'
import { d, t } from '@/lib/i18n'

/**
 * 캡슐 위젯 — 홈과 내 프로필이 같이 쓰는 클라이언트 컴포넌트 (티켓 20261028_1739 2회, 채원 사전 판정 2026-10-30)
 *
 * 서버가 준 초기값(`initial`)이 있으면 로딩 없이 바로 그리고, 없거나 조회가 실패하면 `GET /api/capsule`로 가져온다.
 * 위에서 아래로 `[게이지][안내 영역(조건부)]`이고 시트는 없다. 게이지를 눌러도 아무 일도 없다.
 *  - 로딩: MODULAR `Skeleton`(높이 72). 오류: 상자 자체가 «다시 시도» 버튼이다.
 *  - 안내 영역: 서버가 정해 준 `notice`로 간결 문구를 고른다(서비스 `InlineNotice`). 화면은 개수나 단계로 다시 따지지 않는다.
 *    이용 정지는 안내가 없다(서버가 `notice: 'none'`을 준다. 홈은 `SuspensionBanner`가 알린다).
 *  - «받기»: `claim.available`일 때만 보인다. 빈칸이 모자라면 «받기» 대신 «인벤토리 보기»와 빈칸 덧줄을 둔다.
 *    받은 뒤 상태는 응답으로 계산하지 않고 `GET /api/capsule`을 다시 불러 갱신한다. 받은 배지는 `BadgeRevealOverlay`로 보인다.
 *  - 보지 않은 결과(`capsule_unseen_results`)는 읽지 않는다. 합친 연출은 레이아웃의 `CapsuleResultProvider`가 맡는다(티켓 20261028_1740 3회).
 * 이 컴포넌트를 감싸는 곳은 z-index를 주지 않는다(오버레이가 탭바에 가려진 2026-08-25 사고).
 */

interface RevealState {
  open: boolean
  items: RevealBadge[]
  message: string
}

const CLOSED_REVEAL: RevealState = { open: false, items: [], message: '' }

/** 서버가 정한 안내 종류 → 간결 문구. 안내가 없으면 null */
function noticeText(kind: CapsuleNoticeKind): string | null {
  switch (kind) {
    case 'pending':
      return d.capsule.widget.notice.pending
    case 'pending_nearly_full':
      return d.capsule.widget.notice.pendingNearlyFull
    case 'jam_blocked':
      return d.capsule.widget.notice.jamBlocked
    case 'full_waiting':
      return d.capsule.widget.notice.fullWaiting
    case 'none':
      return null
  }
}

/** 게이지의 스크린리더 이름 — 숫자 없이 상태만 알린다 */
function gaugeAriaLabel(kind: CapsuleNoticeKind): string {
  switch (kind) {
    case 'pending':
    case 'pending_nearly_full':
      return d.capsule.widget.gaugeAria.pending
    case 'jam_blocked':
      return d.capsule.widget.gaugeAria.jamBlocked
    case 'full_waiting':
      return d.capsule.widget.gaugeAria.full
    case 'none':
      return d.capsule.aria.filling
  }
}

export default function CapsuleWidget({ initial }: { initial?: CapsuleStatus | null }) {
  const { toast } = useToast()
  const router = useRouter()
  const [capsule, setCapsule] = useState<CapsuleStatus | null>(initial ?? null)
  const [load, setLoad] = useState<'ready' | 'loading' | 'error'>(initial ? 'ready' : 'loading')
  const [claiming, setClaiming] = useState(false)
  const [reveal, setReveal] = useState<RevealState>(CLOSED_REVEAL)

  // 서버 초기값이 없을 때만 마운트 직후 한 번 가져온다
  useEffect(() => {
    if (initial) return
    let alive = true
    void fetchCapsule().then((result) => {
      if (!alive) return
      if (result.kind === 'ok') {
        setCapsule(result.data)
        setLoad('ready')
      } else {
        setLoad('error')
      }
    })
    return () => {
      alive = false
    }
  }, [initial])

  /** 조용한 재조회 — 성공하면 상태를 바꾸고, 실패하면 지금 화면을 그대로 둔다 */
  const refresh = useCallback(async () => {
    const result = await fetchCapsule()
    if (result.kind === 'ok') {
      setCapsule(result.data)
      setLoad('ready')
    }
  }, [])

  async function retryLoad() {
    setLoad('loading')
    const result = await fetchCapsule()
    if (result.kind === 'ok') {
      setCapsule(result.data)
      setLoad('ready')
    } else {
      setLoad('error')
    }
  }

  async function handleClaim() {
    if (claiming) return
    setClaiming(true)
    const outcome = await runClaim()
    setClaiming(false)

    if (outcome.kind === 'claimed') {
      setReveal({ open: true, items: toRevealBadges(outcome.items), message: outcome.message })
    } else {
      toast(outcome.notice.message, outcome.notice.type)
    }
    // 받은 뒤와 거절 뒤 모두 화면 값이 낡았을 수 있다 — 응답으로 계산하지 않고 다시 조회한다
    if (outcome.refresh) void refresh()
  }

  if (load === 'loading' || (load === 'ready' && !capsule)) {
    return (
      <div role="status" aria-label={d.capsule.aria.loading} className="w-full">
        <Skeleton height={CAPSULE_GAUGE_HEIGHT_PX} borderRadius="var(--radius-full)" className="w-full" />
      </div>
    )
  }

  if (load === 'error' || !capsule) {
    return (
      <button
        type="button"
        onClick={() => void retryLoad()}
        aria-label={d.capsule.aria.error}
        className="jam-press flex w-full cursor-pointer flex-col items-center justify-center rounded-full border border-border bg-surface p-4 text-foreground"
        style={{ height: CAPSULE_GAUGE_HEIGHT_PX }}
      >
        <span className="text-sm font-bold text-muted break-keep wrap-break-word text-balance">{d.capsule.pill.loadFailed}</span>
        <span className="mt-1 text-xs font-semibold text-link break-keep wrap-break-word">{d.capsule.pill.retry}</span>
      </button>
    )
  }

  const text = noticeText(capsule.notice)
  const { claim } = capsule
  const showSlotsAction = !claim.available && claim.blockedReason === 'no_slots'

  let action = null
  if (claim.available) {
    action = (
      <Button variant="primary" fullWidth disabled={claiming} onClick={() => void handleClaim()}>
        {claiming ? d.capsule.widget.claiming : d.capsule.widget.claim}
      </Button>
    )
  } else if (showSlotsAction) {
    action = (
      <div className="flex flex-col gap-2">
        <p className="m-0 text-sm text-muted break-keep wrap-break-word text-pretty">
          {t(d.capsule.widget.slots, { free: claim.freeSlots, needed: claim.neededSlots })}
        </p>
        <Button variant="outline" fullWidth onClick={() => router.push('/inventory')}>
          {d.capsule.widget.inventory}
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="flex w-full flex-col gap-3">
        <CapsuleGauge filled={capsule.filled} required={capsule.required} ariaLabel={gaugeAriaLabel(capsule.notice)} />
        {text && <InlineNotice action={action}>{text}</InlineNotice>}
      </div>

      <BadgeRevealOverlay
        open={reveal.open}
        items={reveal.items}
        profileHref="/profile"
        resultMessage={reveal.message}
        onClose={() => setReveal(CLOSED_REVEAL)}
      />
    </>
  )
}
