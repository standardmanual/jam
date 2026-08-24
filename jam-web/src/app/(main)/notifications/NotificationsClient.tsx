'use client'

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  // 줄바꿈 — 두 속성이 각각 다른 일을 한다.
  //  · word-break: keep-all — CSS 기본값에서 한글은 **음절 단위로 아무 데서나** 끊긴다.
  //    ("'각성 상태의 동/공'을" 처럼) 어절 단위로 끊으려면 명시해야 한다.
  //    BadgeRevealCarousel이 이미 쓰는 프로젝트 선례를 따른다.
  //  · break-words(overflow-wrap: break-word) — 한 덩어리가 카드보다 길 때만 끊는다.
  //    ListRowCard의 title/subtitle 경로에는 truncate가 있지만 children 경로는 무방비라,
  //    공백 없는 긴 닉네임이 밖으로 삐져나오는 것을 막는 최후 수단이다.
  //    (anywhere는 이 목적에 과해서 일반 문장까지 끊는다 — 20260825 되돌림)
  return (
    <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text [word-break:keep-all] break-words">
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
    // 아바타 링크는 이미지/아이콘뿐이라 접근 가능한 이름이 없다 — 스크린리더에 "링크"로만
    // 읽히지 않도록 대상 이름을 붙인다.
    const actorName = view.actor?.username ?? d.profile.anonymous
    return (
      <ListRowCard
        icon={
          <Link
            href={avatarHref}
            aria-label={t(d.notifications.avatarLinkLabel, { name: actorName })}
            className="block active:scale-95 transition-transform duration-100"
          >
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

/**
 * 새 소식 ↔ 이전 소식 **경계선** — 진입 직전 seen_at 스냅샷으로만 그린다
 * (읽음 처리는 이미 끝났으므로 새로고침하면 사라진다).
 *
 * 라벨을 목록 맨 위가 아니라 **경계**에 둔다. 맨 위에 두면 위에 아무것도 없어 나누는
 * 게 없고(사실상 헤더), 정작 "여기부터 예전 것"이라는 정보가 필요한 지점엔 라벨 없는
 * 실선만 남는다(iOS Mail·Slack의 미읽음 구분과 같은 배치).
 */
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
  /** 첫 페이지 **조회 실패** 여부. "소식 0건"과 반드시 구분해서 보여준다 */
  initialFailed: boolean
  /** 진입 **직전**의 notifications_seen_at. 이 값보다 최신이면 "새 소식"이다 */
  seenAtSnapshot: string | null
}

export default function NotificationsClient({
  initialItems,
  initialCursor,
  initialFailed,
  seenAtSnapshot,
}: Props) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationView[]>(initialItems)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const { clearNotificationDot, restoreNotificationDot } = useTopNavData()

  // 진입 시 전체 읽음 처리 — UPDATE 1회. 구분선용 스냅샷은 서버가 이미 잡아 보냈다.
  // **조회에 실패했으면 읽음 처리하지 않는다** — 보여주지도 못한 소식을 읽음으로 만들면
  // 버블만 꺼지고 유저는 무엇이 새 소식이었는지 영영 알 수 없다.
  useEffect(() => {
    if (initialFailed) {
      // 종을 누른 순간 낙관적으로 껐던 버블을 되돌린다. 보여주지도 못한 소식을
      // 읽음 처리한 것처럼 두면 유저는 새 소식이 있었다는 사실조차 모른다.
      restoreNotificationDot()
      return
    }
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
  }, [clearNotificationDot, restoreNotificationDot, initialFailed])

  const loadMore = useCallback(async () => {
    if (!cursor) return
    setLoadingMore(true)
    setError(false)
    try {
      const res = await fetch(`/api/notifications?cursor=${encodeURIComponent(cursor)}`)
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as { items: NotificationView[]; nextCursor: string | null }
      // id 기준 중복 제거 — 025 배치가 도는 동안 목록을 넘기면 묶음 병합으로 updated_at이
      // 위로 튄 행이 다음 페이지에 다시 실려 같은 view.id가 두 번 들어온다(React key 중복).
      setItems((prev) => {
        const seen = new Set(prev.map((it) => it.id))
        return [...prev, ...data.items.filter((it) => !seen.has(it.id))]
      })
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
        {initialFailed ? (
          // 조회 실패를 빈 상태로 보여주면 유저는 "내 소식이 사라졌다"로 읽는다.
          <EmptyState
            icon={<AlertTriangleIcon className="w-8 h-8" />}
            title={d.notifications.errorTitle}
            description={d.notifications.errorBody}
            action={{ label: d.notifications.retry, onClick: () => router.refresh() }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BellIcon className="w-8 h-8" />}
            title={d.notifications.emptyTitle}
            description={d.notifications.emptyBody}
          />
        ) : (
          <>
            {rows.map(({ view, header }, index) => (
              <Fragment key={view.id}>
                {header && <SectionHeader label={header} />}
                <NotificationRow view={view} />
                {/* 새 소식 구간의 끝 = 실제 경계. 안 읽은 소식은 최신순 목록의 앞쪽
                    연속 구간이므로 개수만으로 위치가 정해진다. 로드된 목록이 전부
                    새 소식이면 나눌 경계가 없으니 선도 그리지 않는다. */}
                {newCount > 0 && index === newCount - 1 && index < rows.length - 1 && (
                  <NewDivider count={newCount} />
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
