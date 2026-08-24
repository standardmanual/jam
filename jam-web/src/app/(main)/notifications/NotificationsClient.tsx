'use client'

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import TopNav from '@/components/ui/TopNav'
import ListRowCard from '@/components/ui/ListRowCard'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import {
  ActivityIcon,
  AlertTriangleIcon,
  BellIcon,
  BookIcon,
  CoinIcon,
  GiftIcon,
  MedalIcon,
  NewspaperIcon,
  PackageIcon,
  PinIcon,
  TargetIcon,
  UserIcon,
  UsersIcon,
} from '@/components/ui/icons'
import { notificationTokens, type NotificationView } from '@/lib/notifications/message'
import { notificationTarget } from '@/lib/notifications/href'
import { notificationSection, type NotificationSection } from '@/lib/notifications/section'
import { formatRelativeTime } from '@/lib/utils'
import { d, t } from '@/lib/i18n'
import { useTopNavData } from '@/lib/topNavData'
import type { NotificationType } from '@/types/database'

const SECTION_LABEL: Record<NotificationSection, string> = {
  today: d.notifications.sectionToday,
  week: d.notifications.sectionWeek,
  month: d.notifications.sectionMonth,
  earlier: d.notifications.sectionEarlier,
}

/**
 * 종류별 아이콘. 행위자가 있는 소식(팔로우·픽업됨·팔로잉 활동)은 아이콘 대신 아바타를 쓴다.
 * 경고로 재평가된 ⑧ 소식은 이 매핑을 무시하고 경고 아이콘으로 대체된다.
 */
function TypeIcon({ type, className }: { type: NotificationType; className?: string }): ReactNode {
  switch (type) {
    case 'badge_earned':
    case 'rare_badge_earned':
    case 'first_badge':
    case 'following_rare_badge':
      return <MedalIcon className={className} />
    case 'poi_badge_earned':
      return <PinIcon className={className} />
    case 'item_badge_earned':
    case 'inventory_full':
      return <PackageIcon className={className} />
    case 'points_earned':
    case 'admin_points_changed':
      return <CoinIcon className={className} />
    case 'collection_slottable':
    case 'collection_near_complete':
    case 'collection_completable':
    case 'following_collection_complete':
      return <BookIcon className={className} />
    case 'drop_picked_up':
      return <GiftIcon className={className} />
    case 'drop_spot_active':
    case 'following_nearby_drop':
    case 'nearby_drops':
      return <PinIcon className={className} />
    case 'mission_milestone':
    case 'mission_deadline':
    case 'mission_completed':
    case 'mission_rank_up':
    case 'mission_ended':
    case 'following_mission_complete':
      return <TargetIcon className={className} />
    case 'followed':
    case 'mutual_follow':
      return <UsersIcon className={className} />
    case 'strava_disconnected':
    case 'sync_stalled':
      return <ActivityIcon className={className} />
    case 'announcement':
      return <NewspaperIcon className={className} />
    default:
      return <BellIcon className={className} />
  }
}

/** 40×40 아이콘 영역 — 아바타 / 경고 / 종류별 아이콘 */
function RowIcon({ view }: { view: NotificationView }) {
  if (view.warning) {
    // 경고는 아이콘 + --color-warning으로만 표시한다. 본문 텍스트에는 컬러를 쓰지 않는다(PRD §5).
    return (
      <div
        role="img"
        aria-label={d.notifications.warningLabel}
        className="w-10 h-10 rounded-[var(--radius-cards)] bg-white/8 flex items-center justify-center"
      >
        <AlertTriangleIcon className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
      </div>
    )
  }

  if (view.actor) {
    return view.actor.avatarUrl ? (
      <Image
        src={view.actor.avatarUrl}
        alt={d.profile.avatarAlt}
        width={40}
        height={40}
        className="w-10 h-10 rounded-[var(--radius-pill)] object-cover"
      />
    ) : (
      <span className="w-10 h-10 rounded-[var(--radius-pill)] bg-white/8 text-text flex items-center justify-center">
        <UserIcon className="w-5 h-5" />
      </span>
    )
  }

  return (
    <div className="w-10 h-10 rounded-[var(--radius-cards)] bg-white/8 flex items-center justify-center">
      <TypeIcon type={view.type} className="w-5 h-5 text-text" />
    </div>
  )
}

/**
 * 문구 — **payload 슬롯만 볼드**. 컬러 강조는 쓰지 않는다(PRD §5).
 * 강조 지점을 소식마다 정의하지 않고 토크나이저 결과를 그대로 그린다.
 */
function NotificationBody({ view }: { view: NotificationView }) {
  const tokens = notificationTokens(view)
  return (
    <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text">
      {tokens.map((token, i) =>
        token.bold ? (
          <strong key={i} className="font-bold">
            {token.text}
          </strong>
        ) : (
          <Fragment key={i}>{token.text}</Fragment>
        )
      )}
    </p>
  )
}

function NotificationRow({ view }: { view: NotificationView }) {
  const { href, avatarHref } = notificationTarget(view)
  const trailing = (
    <span className="text-[length:var(--text-caption)] text-text/40">
      {formatRelativeTime(view.updatedAt)}
    </span>
  )

  // 2단 타겟(아바타 탭 → 사람 / 본문 탭 → 대상)이 필요한 행은 행 전체를 링크로 감싸지
  // 않는다 — ListRowCard가 href를 받으면 <Link>로 감싸는데 그 안에 또 링크를 넣으면
  // <a> 안의 <a>라 HTML상 무효다. icon·children 슬롯에 각각 링크를 넣는다.
  if (avatarHref) {
    return (
      <ListRowCard
        icon={
          <Link href={avatarHref} className="block active:scale-95 transition-transform duration-100">
            <RowIcon view={view} />
          </Link>
        }
        trailing={trailing}
      >
        {href ? (
          <Link href={href} className="block active:opacity-70 transition-opacity duration-100">
            <NotificationBody view={view} />
          </Link>
        ) : (
          <NotificationBody view={view} />
        )}
      </ListRowCard>
    )
  }

  return (
    <ListRowCard icon={<RowIcon view={view} />} trailing={trailing} href={href ?? undefined}>
      <NotificationBody view={view} />
    </ListRowCard>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="text-[length:var(--text-caption)] uppercase text-text/40 px-1 pt-[var(--spacing-8)]">
      {label}
    </h2>
  )
}

/** "새 소식 N" 구분선 — 진입 직전 seen_at 스냅샷으로만 그린다(새로고침하면 사라진다) */
function NewDivider({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-[var(--spacing-8)] py-[var(--spacing-8)]">
      <span className="h-px flex-1 bg-[color:var(--color-border)]" />
      <span className="text-[length:var(--text-caption)] text-text/60 shrink-0">
        {t(d.notifications.newDivider, { count })}
      </span>
      <span className="h-px flex-1 bg-[color:var(--color-border)]" />
    </div>
  )
}

interface Props {
  initialItems: NotificationView[]
  initialCursor: string | null
  /** 진입 **직전**의 notifications_seen_at. 이 값보다 최신이면 "새 소식"이다 */
  seenAtSnapshot: string | null
}

export default function NotificationsClient({ initialItems, initialCursor, seenAtSnapshot }: Props) {
  const [items, setItems] = useState<NotificationView[]>(initialItems)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const { clearNotificationDot } = useTopNavData()

  // 진입 시 전체 읽음 처리 — UPDATE 1회. 구분선용 스냅샷은 서버가 이미 잡아 보냈다.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        await fetch('/api/notifications/seen', { method: 'POST' })
      } catch {
        // 읽음 처리 실패는 화면을 막지 않는다 — 다음 진입에 다시 시도된다
      }
      if (active) clearNotificationDot()
    })()
    return () => {
      active = false
    }
  }, [clearNotificationDot])

  const loadMore = useCallback(async () => {
    if (!cursor) return
    setLoadingMore(true)
    setError(false)
    try {
      const res = await fetch(`/api/notifications?cursor=${encodeURIComponent(cursor)}`)
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as { items: NotificationView[]; nextCursor: string | null }
      setItems((prev) => [...prev, ...data.items])
      setCursor(data.nextCursor)
    } catch {
      setError(true)
    } finally {
      setLoadingMore(false)
    }
  }, [cursor])

  // 안 읽은 소식은 최신순 목록의 **앞쪽 연속 구간**이므로 개수만 세면 구분선 위치가 정해진다
  const newCount = useMemo(() => {
    if (!seenAtSnapshot) return items.length
    const seenMs = new Date(seenAtSnapshot).getTime()
    return items.filter((it) => new Date(it.updatedAt).getTime() > seenMs).length
  }, [items, seenAtSnapshot])

  // 구간 헤더(오늘/이번 주/이번 달/이전)는 앞 행과 구간이 바뀌는 지점에만 붙인다.
  // 판정 기준 시각은 한 번만 잡아 목록 전체가 같은 "지금"을 본다.
  const now = useMemo(() => new Date(), [])
  const rows = useMemo(
    () =>
      items.map((view, i) => {
        const section = notificationSection(view.updatedAt, now)
        const prevSection = i > 0 ? notificationSection(items[i - 1].updatedAt, now) : null
        return { view, header: section === prevSection ? null : SECTION_LABEL[section] }
      }),
    [items, now]
  )

  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.notifications.title} />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-8)] pb-[var(--spacing-40)] flex flex-col gap-[var(--spacing-8)]">
        {items.length === 0 ? (
          <EmptyState
            icon={<BellIcon className="w-8 h-8" />}
            title={d.notifications.emptyTitle}
            description={d.notifications.emptyBody}
          />
        ) : (
          <>
            {newCount > 0 && <NewDivider count={newCount} />}
            {rows.map(({ view, header }, index) => (
              <Fragment key={view.id}>
                {header && <SectionHeader label={header} />}
                <NotificationRow view={view} />
                {/* 새 소식 구간의 끝 — 안 읽은 소식은 최신순 목록의 앞쪽 연속 구간이다 */}
                {newCount > 0 && index === newCount - 1 && index < rows.length - 1 && (
                  <div className="h-px w-full bg-[color:var(--color-border)] my-[var(--spacing-8)]" />
                )}
              </Fragment>
            ))}
          </>
        )}

        {error && (
          <p className="text-center text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60 py-[var(--spacing-16)]">
            {d.notifications.loadError}
          </p>
        )}

        {cursor && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="mx-auto mt-1 min-h-11 px-[var(--spacing-24)] rounded-[var(--radius-nav-buttons)] bg-surface-elevated text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] active:scale-95 transition-transform duration-100 disabled:opacity-50"
          >
            {loadingMore
              ? d.notifications.loadingMore
              : error
                ? d.notifications.retry
                : d.common.loadMore}
          </button>
        )}
      </div>
    </div>
  )
}
