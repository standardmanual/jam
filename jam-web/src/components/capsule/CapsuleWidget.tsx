'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ds/components/buttons/Button'
import { Skeleton } from '@ds/components/feedback/Skeleton'
import CapsuleBlockedCard from '@/components/capsule/CapsuleBlockedCard'
import CapsuleGauge, { CAPSULE_GAUGE_HEIGHT_PX } from '@/components/capsule/CapsuleGauge'
import { fetchCapsule } from '@/lib/capsule/capsule-client'
import type { CapsuleNoticeKind, CapsuleStatus } from '@/lib/capsule/capsule-contract'
import { d, t } from '@/lib/i18n'

/**
 * 캡슐 위젯 — 홈과 내 프로필이 같이 쓰는 클라이언트 컴포넌트 (티켓 20261028_1739 2회, 채원 사전 판정 2026-10-30)
 *
 * 서버가 준 초기값(`initial`)이 있으면 로딩 없이 바로 그리고, 없거나 조회가 실패하면 `GET /api/capsule`로 가져온다.
 * `router.refresh()`로 새 초기값이 내려오면 상태가 그 값을 따라간다(동기화 직후 합친 연출을 닫은 게이지가 최신 값까지 차도록).
 * 위에서 아래로 `[게이지][안내 영역(조건부)]`이고 시트는 없다. 게이지를 눌러도 아무 일도 없다.
 *  - 로딩: MODULAR `Skeleton`(게이지와 같은 높이). 오류: 상자 자체가 «다시 시도» 버튼이다.
 *  - 안내 문구: 서버가 정해 준 `notice`(막힘 한 종류, 티켓 20261105_0104)로 간결 문구를 고른다. 게이지 안 숫자 자리에 보인다(숫자는 지운다, 2026-11-05 사용자 요청). 안내 영역에는 빈칸 줄과 «인벤토리 보기»만 남는다.
 *    이용 정지는 안내가 없다(서버가 `notice: 'none'`을 준다. 홈은 `SuspensionBanner`가 알린다).
 *    홈은 `blockedCard`를 켜서 막힘일 때 게이지 아래에 `CapsuleBlockedCard`(두 줄 안내와 «인벤토리 가기»를 한 카드로 묶음)를 놓고 빈칸 줄과 «인벤토리 보기»는 그리지 않는다. 게이지는 카드 밖에서 원래 가로 폭 그대로다(티켓 20261105_1912). 프로필은 그대로 둔다.
 *    막힘이면 게이지는 채운 양과 상관없이 가득 차고 문구가 채움 안쪽 왼쪽에 보인다. 풀리면 문구가 사라지고 남은 잼 값으로 줄며 숫자가 보인다.
 *  - «받기» 버튼은 없다(티켓 20261105_0105 T5). 대기 보상은 인벤토리 빈칸이 생기면 서버가 자동으로 지급한다. 대기 보상이 빈칸에 막혔을 때만 빈칸 덧줄과 «인벤토리 보기»를 둔다.
 *  - 보지 않은 결과(`capsule_unseen_results`)는 읽지 않는다. 합친 연출은 레이아웃의 `CapsuleResultProvider`가 맡는다(티켓 20261028_1740 3회).
 * 이 컴포넌트를 감싸는 곳은 z-index를 주지 않는다(오버레이가 탭바에 가려진 2026-08-25 사고).
 */

/** 서버가 정한 안내 종류 → 간결 문구. 안내가 없으면 null */
function noticeText(kind: CapsuleNoticeKind): string | null {
  return kind === 'blocked' ? d.capsule.widget.notice.blocked : null
}

/** 게이지의 스크린리더 이름 — 숫자 없이 상태만 알린다 */
function gaugeAriaLabel(kind: CapsuleNoticeKind): string {
  return kind === 'blocked' ? d.capsule.widget.gaugeAria.blocked : d.capsule.aria.filling
}

export default function CapsuleWidget({
  initial,
  blockedCard = false,
}: {
  initial?: CapsuleStatus | null
  /** 막힘이면 게이지를 안내·버튼과 한 카드로 묶고 빈칸 줄과 «인벤토리 보기»는 그리지 않는다. 홈만 켠다(티켓 20261105_1912). 프로필은 끄고 기존 구성을 그대로 둔다 */
  blockedCard?: boolean
}) {
  const router = useRouter()
  const [capsule, setCapsule] = useState<CapsuleStatus | null>(initial ?? null)
  const [load, setLoad] = useState<'ready' | 'loading' | 'error'>(initial ? 'ready' : 'loading')

  // 동기화 뒤 `router.refresh()`로 서버가 새 초기값을 내려주면 그 값을 따라간다. 그러지 않으면 합친 연출을 닫을 때
  // 게이지가 동기화 이전 값까지만 찬다. 렌더 중에 상태를 맞추는 방식이라 새 값이 첫 그리기에 바로 반영된다
  const [followedInitial, setFollowedInitial] = useState(initial)
  if (initial !== followedInitial) {
    setFollowedInitial(initial)
    if (initial) {
      setCapsule(initial)
      setLoad('ready')
    }
  }

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
  // 막힘 안내이거나 대기 보상이 빈칸 때문에 지급되지 못할 때 빈칸 줄과 «인벤토리 보기»를 둔다.
  // 홈의 막힘 카드는 같은 말을 안내와 «인벤토리 가기»로 하므로 이 줄 대신 카드를 둔다.
  const blocked = capsule.notice === 'blocked'
  const gauge = (
    <CapsuleGauge filled={capsule.filled} required={capsule.required} ariaLabel={gaugeAriaLabel(capsule.notice)} message={text ?? undefined} />
  )
  const showSlotsAction = blocked || claim.blockedReason === 'no_slots'

  const action = blocked && blockedCard ? (
    <CapsuleBlockedCard />
  ) : showSlotsAction ? (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-sm text-muted break-keep wrap-break-word text-balance">
        {t(d.capsule.widget.slots, { free: claim.freeSlots, needed: claim.neededSlots })}
      </p>
      <Button variant="outline" fullWidth onClick={() => router.push('/inventory')}>
        {d.capsule.widget.inventory}
      </Button>
    </div>
  ) : null

  return (
    <div className="flex w-full flex-col gap-3">
      {gauge}
      {action}
    </div>
  )
}
