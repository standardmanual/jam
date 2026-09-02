import Link from 'next/link'
import Image from 'next/image'
import { Card } from '@ds/components/cards/Card'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { PackageIcon, TargetIcon, UserIcon, UsersIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import type { TodayLeftStatus, TodayRightStatus } from '@/lib/today/status'

/**
 * 투데이 홈 "오늘의 현황" 스트립 (티켓 20260830_2030) — 좌: 내 진행도 / 우: 친구 활동.
 *
 * MODULAR 재사용 판정(오케스트레이터 결정) — 신규 컴포넌트 없이 기존 Card(tone="inverse")·
 * ProgressBar·icons.tsx만으로 구성한다. EmptyState는 셀에 직접 넣지 않고(카드 여백·타이포
 * 규격 불일치) "아이콘 opacity 0.5 + 뮤트 톤" 시각 관례만 인라인으로 차용한다.
 */

const CELL_CLASS =
  'h-full min-h-[92px] flex flex-col gap-[var(--spacing-8)] active:scale-[0.98] transition-transform duration-100'
const CELL_BODY_CLASS = 'flex-1 flex flex-col justify-center gap-[var(--spacing-8)]'

/**
 * 카드 좌측 상단 타이틀 레이블 (티켓 20260830_2121). TodayCardStack.tsx의 TemplateChip
 * 스타일 관례(캡션 크기·bold·bg-surface text-text 칩)를 인라인으로 차용 — TemplateChip은
 * TodayCardTemplateType에 의존적이라 그대로 import하지 않는다.
 */
function CellLabel({ children }: { children: string }) {
  return (
    <span className="self-start inline-flex items-center text-[length:var(--text-caption)] leading-none font-bold uppercase px-2.5 py-1.5 rounded-[var(--radius-tags)] bg-surface text-text">
      {children}
    </span>
  )
}

function LeftCell({ status }: { status: TodayLeftStatus }) {
  if (status.kind === 'strava_disconnected') {
    return (
      <Link href={status.href} className="block h-full">
        <Card tone="inverse" className={CELL_CLASS}>
          <CellLabel>{d.todayStatus.myProgressLabel}</CellLabel>
          <div className={CELL_BODY_CLASS}>
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-bold">
              {d.todayStatus.stravaCta}
            </p>
          </div>
        </Card>
      </Link>
    )
  }

  if (status.kind === 'progress') {
    return (
      <Link href={status.href} className="block h-full">
        <Card tone="inverse" className={CELL_CLASS}>
          <CellLabel>{d.todayStatus.myProgressLabel}</CellLabel>
          <div className={CELL_BODY_CLASS}>
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-bold">
              {t(d.todayStatus.progressLabel, { name: status.name, current: status.current, total: status.total })}
            </p>
            <ProgressBar current={status.current} total={status.total} />
          </div>
        </Card>
      </Link>
    )
  }

  const Icon = status.category === 'missions' ? TargetIcon : PackageIcon
  return (
    <Link href={status.href} className="block h-full">
      <Card tone="inverse" className={CELL_CLASS}>
        <CellLabel>{d.todayStatus.myProgressLabel}</CellLabel>
        <div className={CELL_BODY_CLASS}>
          <span className="text-text-inverse/60 opacity-50">
            <Icon className="w-6 h-6" />
          </span>
          <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-bold">
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
            <span className="text-text-inverse/60 opacity-50">
              <UsersIcon className="w-6 h-6" />
            </span>
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-bold">
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
          <div className="flex items-center gap-[var(--spacing-8)]">
            <div className="flex -space-x-2 shrink-0">
              {status.avatarUrls.map((url, i) => (
                <span
                  key={i}
                  className="w-7 h-7 rounded-full ring-2 ring-[color:var(--color-surface-inverse)] overflow-hidden bg-white/8 flex items-center justify-center"
                >
                  {url ? (
                    <Image src={url} alt="" width={28} height={28} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-3.5 h-3.5 text-text-inverse/40" />
                  )}
                </span>
              ))}
            </div>
            <p className="min-w-0 flex-1 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-bold">
              {message}
            </p>
          </div>
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
      <div className="grid grid-cols-1 gap-[var(--spacing-16)]">
        <LeftCell status={left} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-[var(--spacing-16)]">
      <LeftCell status={left} />
      <RightCell status={right} />
    </div>
  )
}
