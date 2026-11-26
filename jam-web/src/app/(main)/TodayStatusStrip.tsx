import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { LabelChip } from '@/components/ui/LabelChip'
import ProgressCountBar from '@/components/ui/ProgressCountBar'
import { d, t } from '@/lib/i18n'
import { formatMissionProgress } from '@/lib/missions/format'
import type { TodayLeftStatus, TodayRightStatus } from '@/lib/today/status'

/**
 * 투데이 홈 "오늘의 현황" 스트립 (티켓 20260830_2030) — 좌: 진행상황 / 우: 팔로잉.
 *
 * MODULAR 재사용 판정(오케스트레이터 결정) — 신규 컴포넌트 없이 기존 Card·LabelChip·ProgressBar만으로 구성한다. 빈 셀(suggestion·no_following)은 아이콘 없이 문구만 둔다(티켓 20261109_1429).
 *
 * 카드 면은 블랙이다(Card `inverse` 톤, 티켓 20261127_0829, 사용자 지시 2026-11-27). 반전 면 위 색은 토큰으로만 고른다:
 * 글자는 Card가 주는 `--snow`, 라벨 칩 면은 `--surface-on-inverse`(반전 면 위 한 단계 밝은 면)이며 칩 글자는 `--snow`다.
 * 진행 바는 인벤토리 상단과 같은 정본 `ProgressCountBar`(채움 그린)에 `onInverse`를 켜서 쓴다: 트랙은 `--surface-on-inverse`, 「n/n」 숫자는 `--snow`다.
 */

const CELL_CLASS =
  'h-full min-h-23 flex flex-col gap-2 jam-press'
const CELL_BODY_CLASS = 'flex-1 flex flex-col justify-center gap-2'
/** 블랙 카드 위 라벨 칩 — `LabelChip`의 두 색조(default·inverse)는 블랙 면에서 각각 너무 튀거나 면에 묻혀, 반전 면 위 토큰으로 면·글자를 덮는다 */
const LABEL_ON_INVERSE_STYLE = { background: 'var(--surface-on-inverse)', color: 'var(--snow)' } as const

/**
 * 카드 좌측 상단 타이틀 레이블 (티켓 20260830_2121). 칩 모양은 MODULAR `LabelChip`
 * (티켓 20261001_1204)이 그리고, flex-col 셀에서 칩이 가로로 늘어나지 않게 하는 `self-start`만
 * 여기서 붙인다.
 */
function CellLabel({ children }: { children: string }) {
  return (
    <LabelChip className="self-start" style={LABEL_ON_INVERSE_STYLE}>
      {children}
    </LabelChip>
  )
}

function LeftCell({ status }: { status: TodayLeftStatus }) {
  if (status.kind === 'strava_not_connected') {
    return (
      <Link href={status.href} className="block h-full">
        <Card tone="inverse" className={CELL_CLASS}>
          <CellLabel>{d.todayStatus.myProgressLabel}</CellLabel>
          <div className={CELL_BODY_CLASS}>
            <p className="text-base font-bold">
              {d.todayStatus.stravaCta}
            </p>
          </div>
        </Card>
      </Link>
    )
  }

  if (status.kind === 'progress') {
    // 티켓 20260902_0933: 거리(distance) 미션은 소수 1자리, 그 외(아이템북 포함)는 정수 —
    // formatMissionProgress()로 미션 상세·미션 현황과 동일한 자릿수 규칙을 쓴다.
    // missionType이 null(아이템북)이면 항상 정수형 취급.
    const formatCount = (n: number) => formatMissionProgress(n, status.missionType ?? '')
    return (
      <Link href={status.href} className="block h-full">
        <Card tone="inverse" className={CELL_CLASS}>
          <CellLabel>{d.todayStatus.myProgressLabel}</CellLabel>
          <div className={CELL_BODY_CLASS}>
            <p className="text-base font-bold break-words [overflow-wrap:anywhere]">
              {status.name}
            </p>
            {/* 티켓 20261109_1429: n/n은 진행 바 오른쪽에 text-xs로 둔다. 티켓 20261127_0829: 바는 ProgressCountBar(반전 면용) */}
            <ProgressCountBar
              percent={status.total > 0 ? (status.current / status.total) * 100 : 0}
              current={status.current}
              total={status.total}
              format={formatCount}
              onInverse
            />
          </div>
        </Card>
      </Link>
    )
  }

  return (
    <Link href={status.href} className="block h-full">
      <Card tone="inverse" className={CELL_CLASS}>
        <CellLabel>{d.todayStatus.myProgressLabel}</CellLabel>
        <div className={CELL_BODY_CLASS}>
          <p className="text-base font-bold">
            {status.text}
          </p>
        </div>
      </Card>
    </Link>
  )
}

function RightCell({ status }: { status: Exclude<TodayRightStatus, { kind: 'none' }> }) {
  if (status.kind === 'no_following') {
    return (
      <Link href={status.href} className="block h-full">
        <Card tone="inverse" className={CELL_CLASS}>
          <CellLabel>{d.todayStatus.friendActivityLabel}</CellLabel>
          <div className={CELL_BODY_CLASS}>
            <p className="text-base font-bold">
              {d.todayStatus.noFollowing}
            </p>
          </div>
        </Card>
      </Link>
    )
  }

  const message =
    status.count === 1 && status.singleFriendName
      ? t(d.todayStatus.friendActivitySingle, { name: status.singleFriendName })
      : t(d.todayStatus.friendActivity, { count: status.count })

  return (
    <Link href={status.href} className="block h-full">
      <Card tone="inverse" className={CELL_CLASS}>
        <CellLabel>{d.todayStatus.friendActivityLabel}</CellLabel>
        <div className={CELL_BODY_CLASS}>
          <p className="text-base font-bold">
            {message}
          </p>
        </div>
      </Card>
    </Link>
  )
}

interface Props {
  left: TodayLeftStatus
  right: TodayRightStatus
}

export default function TodayStatusStrip({ left, right }: Props) {
  // 팔로잉은 있으나 오늘 활동이 없으면 빈 콘텐츠로 자리를 차지하지 않는다 — 좌측 카드만 표시.
  if (right.kind === 'none') {
    return (
      <div className="grid grid-cols-1 gap-4">
        <LeftCell status={left} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <LeftCell status={left} />
      <RightCell status={right} />
    </div>
  )
}
