'use client'

import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getDisplayName } from '@/lib/utils'
import { d, t } from '@/lib/i18n'
import TopNav from '@/components/ui/TopNav'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import Button from '@/components/ui/Button'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import { PointHistorySection } from '@/components/points/PointHistoryList'
import { compactCount } from '@/lib/format/compactCount'
import { ListRow } from '@/components/ui/ListRow'
import PopInNumber from '@/components/ui/PopInNumber'
import SwapText from '@/components/ui/SwapText'
import {
  UserIcon,
  UsersIcon,
  MedalIcon,
} from '@/components/ui/icons'
import type { UserRow, ActivityFeedRow, BadgeRarity } from '@/types/database'
import FeedSection, { earnCountOf, badgeLevelOf, feedTarget, goToFeedTarget } from '../FeedSection'
import BadgeRevealOverlay, { type RevealBadge } from '@/components/BadgeRevealOverlay'
import { useToast } from '@/components/ui/Toast'
import CapsuleWidget from '@/components/capsule/CapsuleWidget'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'
import ChapterLine, { type MyChapterLineData, type PublicChapterLineData } from '@/components/chapter/ChapterLine'
import { leveledFamilyKey } from '@/lib/activity-feed/collapseLeveled'

/** `POST /api/follows` 응답 중 배지 리빌 연출에 필요한 조각(sync.ts EarnedBadgePayload와 동일 계약) */
interface FollowResponse {
  earnedBadges?: RevealBadge[]
  earnedBadgesMore?: number
  /** ADR 0001 — 서버가 완성한 에러 문구(티켓 20260915_2249) */
  error?: string
}

// ─── 탭 ─────────────────────────────────────────────────────────────────────

type TabKey = 'followers' | 'following' | 'points'
/** 해시 이동 — 브라우저 뒤로가기가 목록을 되짚는다. 해시와 같은 id의 요소가 없어 스크롤은 움직이지 않는다 */
function openTabHash(tab: TabKey) {
  window.location.hash = tab
}

/** 해시가 열 수 있는 목록인가 — `#points`는 지갑이 본인 전용이라 타인 프로필에서는 무효(기본 화면으로 본다) */
function isValidTab(hash: string, isOwnProfile: boolean): hash is TabKey {
  return hash === 'followers' || hash === 'following' || (isOwnProfile && hash === 'points')
}

// ─── 피드 (본인 Feed 섹션용 UI는 ../FeedSection 공용 컴포넌트로 이전됨) ──────


// ─── 타입 (탭 콘텐츠) ────────────────────────────────────────────────────────

interface FollowUser {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  isFollowing: boolean
}

// ─── 공통 조각 ───────────────────────────────────────────────────────────────

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

/**
 * 서버 컴포넌트가 이 컴포넌트로 넘기는 대상 유저 정보 — 화면이 쓰는 필드만 담는다.
 * 이 컴포넌트는 클라이언트라 prop 전체가 브라우저로 직렬화된다(20261008_1354). `UserRow`처럼
 * 넓은 타입으로 되돌리면 email·last_location_*·is_admin이 다시 새는 구조가 된다.
 */
export type ProfileClientProfile = Pick<UserRow, 'username' | 'display_name' | 'avatar_url'>

interface Props {
  profile: ProfileClientProfile | null
  feedItems: ActivityFeedRow[]
  isOwnProfile: boolean
  isFollowing: boolean
  targetUserId: string
  followerCount: number
  followingCount: number
  username: string
  currentUserId: string
  /** 본인 프로필에서만 전달됨. 타인 프로필에서는 null. */
  pointBalance: number | null
  /**
   * 20260827_018 — 피드 묶음 카드에 쓸 활동 이름 맵. 키는 Strava 숫자 id의 문자열.
   * 옵셔널이다 — 안 넘겨도 묶음은 이름 없이 그대로 동작한다.
   */
  activityNames?: Record<string, string>
  /**
   * 캡슐 위젯의 서버 초기값(티켓 20261018_0054). **내 프로필에서만 내려온다 — 타인이 보는 프로필에는 prop 자체가 없다(`undefined`).**
   * 그래서 타인에게는 DOM과 RSC 페이로드에 캡슐 값이 실리지 않는다(클라이언트에서 숨기는 방식이 아니다).
   * `null`은 «내 프로필인데 서버 조회가 실패했다»이고 위젯이 클라이언트에서 다시 가져온다.
   */
  capsuleInitial?: CapsuleStatus | null
  /**
   * 내 챕터 줄의 서버 값(티켓 20261019_1317). **내 프로필에서만 내려온다 — 타인이 보는 프로필에는 prop 자체가 없다(`undefined`).**
   * 챕터 번호만 담는다(막대·다음 챕터는 없다, 티켓 20261031_1806). 내 정보라 `capsuleInitial`과 같은 방식으로 DOM과 RSC 페이로드에서 막는다.
   * `null`은 «챕터가 없다(퀘스트 전)» 또는 «서버가 읽지 못했다»이고 둘 다 줄을 그리지 않는다(사용자 결정 4).
   * 값이면 헤더의 표시 이름 위에 작은 글씨 «챕터 N» 한 줄로 그린다.
   */
  chapterInitial?: MyChapterLineData | null
  /**
   * 다른 유저 프로필의 트라이브·챕터 한 줄(티켓 20261019_1317). **다른 유저 프로필에서만 내려온다.** 진행은 담지 않는다.
   * `null`은 읽지 못함이고 줄을 그리지 않는다. 보일 조각이 없으면 `ChapterLine`이 아무것도 그리지 않는다.
   */
  publicChapter?: PublicChapterLineData | null
}

export default function ProfileClient({
  profile,
  feedItems,
  isOwnProfile,
  isFollowing,
  targetUserId,
  followerCount,
  followingCount,
  username,
  currentUserId,
  pointBalance,
  activityNames,
  capsuleInitial,
  chapterInitial,
  publicChapter,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  // 알림함에서 진입했으면(?from=notifications) `<` 버튼이 알림으로 직행해야 한다 —
  // 통계탭 클릭(handleTabClick)이 해시 이동마다 히스토리 엔트리를 쌓아서, 순수
  // router.back()이면 알림이 아니라 그 탭 히스토리를 되짚는다(20260831_2201).
  // 검색·팔로워목록·직접 URL 등 이 파라미터가 없는 기존 경로는 기존 router.back()을 유지한다.
  const fromNotifications = searchParams.get('from') === 'notifications'

  // ── 탭/해시 상태 ──────────────────────────────────────────────────────────
  const [hashFragment, setHashFragment] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabKey>('followers')
  const [tabLoading, setTabLoading] = useState(false)
  const [followersData, setFollowersData] = useState<FollowUser[] | null>(null)
  const [followingData, setFollowingData] = useState<FollowUser[] | null>(null)
  const [listFollowStates, setListFollowStates] = useState<Record<string, boolean>>({})
  const fetchedRef = useRef<Set<TabKey>>(new Set())


  // ── 배지 리빌 오버레이(팔로우로 배지 획득 시) — FollowButton.tsx(20260910_2056)와 동일 패턴,
  // 헤더 팔로우 버튼·팔로워/팔로잉 탭 리스트 두 호출부가 공유한다 (20260910_2132).
  const [revealOpen, setRevealOpen] = useState(false)
  const [earnedBadges, setEarnedBadges] = useState<RevealBadge[]>([])
  const [earnedBadgesMore, setEarnedBadgesMore] = useState(0)

  // ── 팔로우 (프로필 헤더) ───────────────────────────────────────────────────
  const [following, setFollowing] = useState(isFollowing)
  const [followerCnt, setFollowerCnt] = useState(followerCount)
  const [followLoading, setFollowLoading] = useState(false)
  // 목록 내 팔로우: 요청 중인 userId Set으로 경쟁 조건 방지
  const [listFollowingSet, setListFollowingSet] = useState<Set<string>>(new Set())

  // 갤러리는 배지 **종류**의 진열장이라 badge_id당 한 칸이다. 다만 20260905_0038 B 이전에는
  // 중복 행을 세지도 않고 버려서 「몇 번 획득했는지」가 화면에서 완전히 사라졌다 —
  // 이제 칸은 하나로 유지하되 횟수는 카드의 ×N으로 보존한다.
  //
  // 횟수의 출처는 두 갈래다(피드 카드와 같은 규칙 — `earnCountOf`가 단일 판정처다):
  //   - 반복형 활동 배지: `metadata.earn_count` (hydrate가 렌더 직전에 실어준 최신 회차)
  //   - 체크인 배지: `metadata.visit_count`
  // 둘 다 없으면 접힌 행 수로 폴백한다(과거 데이터 방어).
  //
  // 가상화는 넣지 않는다 — 갤러리의 원본은 프로필이 가져온 피드 윈도우(limit 150)라
  // 카드 수 상한이 150장(3열 = 50행)이다. 배지 카탈로그가 630종이어도 여기 그려지는 건
  // 보유분뿐이고, 그마저 윈도우에 잘린다. 목록 자체를 늘리려면 갤러리 전용 조회가 먼저다.
  const badgeItems = (() => {
    const indexById = new Map<string, number>()
    const rowsById = new Map<string, number>()
    const result: { item: ActivityFeedRow; count: number | null; level: number | null }[] = []
    for (const item of feedItems) {
      if (item.event_type !== 'badge_earned') continue
      const badgeId = (item.metadata as Record<string, string>).badge_id
      // 레벨형은 계열당 한 칸 — 같은 계열의 최고 레벨만 남기고 ×N을 붙이지 않는다(티켓 20261108_1622)
      const level = badgeLevelOf(item)
      if (level != null) {
        const famKey = `#lv:${leveledFamilyKey(item.metadata as Record<string, unknown>)}`
        const famIdx = indexById.get(famKey)
        if (famIdx == null) {
          indexById.set(famKey, result.length)
          result.push({ item, count: null, level })
        } else if (level > (result[famIdx].level ?? 0)) {
          result[famIdx] = { item, count: null, level }
        }
        continue
      }
      const idx = indexById.get(badgeId)
      if (idx != null) {
        rowsById.set(badgeId, (rowsById.get(badgeId) ?? 1) + 1)
        continue
      }
      indexById.set(badgeId, result.length)
      rowsById.set(badgeId, 1)
      result.push({ item, count: earnCountOf(item), level: badgeLevelOf(item) })
    }
    for (const [badgeId, rows] of rowsById) {
      if (rows < 2) continue
      const idx = indexById.get(badgeId)
      if (idx == null) continue
      const entry = result[idx]
      if (entry.count == null || entry.count < rows) entry.count = rows
    }
    return result
  })()

  // ── 탭뷰 여부 ─────────────────────────────────────────────────────────────
  // 해시로만 판정: 해시 없으면 기본뷰(본인은 활동 피드, 타인은 배지 그리드 — 티켓 20261108_1216),
  // 유효 해시 있으면 목록. 타인의 `#points`는 무효라 기본뷰다.
  const isTabView = isValidTab(hashFragment, isOwnProfile)

  // ── 해시 동기화 (마운트·뒤로가기 포함) ────────────────────────────────────
  useEffect(() => {
    const fetchIfNeeded = async (tab: TabKey) => {
      if (fetchedRef.current.has(tab)) return
      fetchedRef.current.add(tab)
      setTabLoading(true)
      try {
        if (tab === 'followers') {
          const res = await fetch(`/api/users/${username}/followers`)
          const json = await res.json()
          const users: FollowUser[] = json.users ?? []
          setFollowersData(users)
          setListFollowStates(prev => {
            const next = { ...prev }
            for (const u of users) next[u.id] = u.isFollowing
            return next
          })
        } else if (tab === 'following') {
          const res = await fetch(`/api/users/${username}/following`)
          const json = await res.json()
          const users: FollowUser[] = json.users ?? []
          setFollowingData(users)
          setListFollowStates(prev => {
            const next = { ...prev }
            for (const u of users) next[u.id] = u.isFollowing
            return next
          })
        }
        // points는 PointHistorySection이 마운트될 때 스스로 불러온다
      } finally {
        setTabLoading(false)
      }
    }

    const sync = () => {
      const hash = window.location.hash.slice(1)
      setHashFragment(hash)
      if (isValidTab(hash, isOwnProfile)) {
        setActiveTab(hash)
        if (hash !== 'points') fetchIfNeeded(hash)
      }
    }

    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [username, isOwnProfile])

  // ── 탭 클릭 — 해시 이동 (브라우저 뒤로가기 지원) ────────────────────────────
  const handleTabClick = (tab: TabKey) => openTabHash(tab)

  // 헤더의 아바타·아이디 클릭 시 현재 프로필 URL(`/${username}`)로 이동한다.
  // 탭 해시(`#followers` 등)로 열려 있던 상태에서 자기 자신에게 다시 링크하면
  // pathname이 같아 해시가 지워지지 않고 남는다 — 이동 직전에 제거한다(20260902_0956,
  // 팔로워·팔로잉 행의 ListRow onClick도 같은 함수를 쓴다 20260902_0915).
  const clearProfileHash = () => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    // replaceState는 hashchange를 일으키지 않으므로 기본 화면 복귀를 상태로 직접 알린다(티켓 20261108_1216)
    setHashFragment('')
  }

  // ── 리스트 내 팔로우 토글 ──────────────────────────────────────────────────
  const handleListFollow = async (targetId: string) => {
    if (listFollowingSet.has(targetId)) return
    const current = listFollowStates[targetId] ?? false
    setListFollowStates(prev => ({ ...prev, [targetId]: !current }))
    setListFollowingSet(prev => new Set(prev).add(targetId))
    try {
      let res: Response
      if (current) {
        res = await fetch(`/api/follows/${targetId}`, { method: 'DELETE' })
      } else {
        res = await fetch('/api/follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_user_id: targetId }),
        })
      }
      // ADR 0001 — 서버가 완성한 문구를 그대로 신뢰한다(티켓 20260915_2249)
      const data: FollowResponse = await res.json().catch(() => ({}))
      if (!res.ok) {
        setListFollowStates(prev => ({ ...prev, [targetId]: current }))
        toast(data.error ?? (current ? d.social.unfollowError : d.social.followError), 'error')
        return
      }
      // JAM! 카테고리 — 팔로우로 획득한 배지가 있으면 리빌 연출 (티켓 20260910_2132).
      // 언팔로우(current === true)에는 배지 지급이 없으므로 신규 팔로우일 때만 파싱한다.
      if (!current) {
        const badges = data.earnedBadges ?? []
        if (badges.length > 0) {
          setEarnedBadges(badges)
          setEarnedBadgesMore(data.earnedBadgesMore ?? 0)
          setRevealOpen(true)
        }
      }
    } catch {
      setListFollowStates(prev => ({ ...prev, [targetId]: current }))
      toast(d.common.networkError, 'error')
    } finally {
      setListFollowingSet(prev => { const next = new Set(prev); next.delete(targetId); return next })
    }
  }

  // ── 헤더 팔로우 토글 ───────────────────────────────────────────────────────
  const handleFollow = async () => {
    if (followLoading) return
    const prev = following
    const prevCnt = followerCnt
    setFollowLoading(true)
    if (following) {
      setFollowing(false)
      setFollowerCnt(c => c - 1)
      try {
        const res = await fetch(`/api/follows/${targetUserId}`, { method: 'DELETE' })
        if (!res.ok) {
          // ADR 0001 — 서버가 완성한 문구를 그대로 신뢰한다(티켓 20260915_2249)
          const data: FollowResponse = await res.json().catch(() => ({}))
          setFollowing(prev)
          setFollowerCnt(prevCnt)
          toast(data.error ?? d.social.unfollowError, 'error')
        }
      } catch {
        setFollowing(prev)
        setFollowerCnt(prevCnt)
        toast(d.common.networkError, 'error')
      } finally {
        setFollowLoading(false)
      }
    } else {
      setFollowing(true)
      setFollowerCnt(c => c + 1)
      try {
        const res = await fetch('/api/follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_user_id: targetUserId }),
        })
        const data: FollowResponse = await res.json().catch(() => ({}))
        if (!res.ok) {
          // ADR 0001 — 서버가 완성한 문구를 그대로 신뢰한다(티켓 20260915_2249)
          setFollowing(prev)
          setFollowerCnt(prevCnt)
          toast(data.error ?? d.social.followError, 'error')
          return
        }
        // JAM! 카테고리 — 팔로우로 획득한 배지가 있으면 리빌 연출 (티켓 20260910_2132).
        const badges = data.earnedBadges ?? []
        if (badges.length > 0) {
          setEarnedBadges(badges)
          setEarnedBadgesMore(data.earnedBadgesMore ?? 0)
          setRevealOpen(true)
        }
      } catch {
        setFollowing(prev)
        setFollowerCnt(prevCnt)
        toast(d.common.networkError, 'error')
      } finally {
        setFollowLoading(false)
      }
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // 타인 프로필의 배지 그리드 카드를 누르면 바텀시트 대신 그 배지의 상세 페이지로 간다(2026-11-08 사용자 요청). 피드 카드와 같은 판정(`feedTarget`)을 쓴다.
  const handleCardClick = (item: ActivityFeedRow) => {
    goToFeedTarget(feedTarget(item, `?u=${username}`), router.push)
  }

  // ── 탭 콘텐츠 렌더 ────────────────────────────────────────────────────────

  // 빈 상태 문구의 3인칭 주어(20260903_2022) — 타인 프로필에서 "OO님이"에 쓸 이름.
  // 헤더의 표시 이름 폴백(516행)과 동일한 규칙: 이름 없으면 anonymous.
  const subjectName = (profile && getDisplayName(profile)) || d.profile.anonymous

  // 로딩 표시는 Skeleton loader and reveal(14-skeleton-reveal.md)이 담당하므로
  // 여기서는 실제 콘텐츠만 그린다.
  // 타인 프로필의 기본 화면 — 그 사람의 배지 그리드(티켓 20261108_1216). 데이터는 서버가 내려준 피드에서 온다.
  const renderBadgeGrid = () => {
    if (badgeItems.length === 0) {
      return (
        <EmptyState
          icon={<MedalIcon className="w-8 h-8" />}
          title={isOwnProfile ? d.profile.emptyBadges : t(d.profile.emptyBadgesOther, { name: subjectName })}
          description={isOwnProfile ? d.profile.emptyBadgesBody : undefined}
        />
      )
    }
    return (
      <div className="grid grid-cols-3 gap-2">
        {badgeItems.map(({ item, count, level }) => {
          const meta = item.metadata as Record<string, string>
          return (
            <BadgeGridCard
              key={item.id}
              onClick={() => handleCardClick(item)}
              name={meta.badge_name}
              imageUrl={meta.badge_image_url ?? null}
              rarity={(meta.rarity as BadgeRarity | null) ?? null}
              level={level}
              count={count}
            />
          )
        })}
      </div>
    )
  }

  const renderTabContent = () => {
    if (activeTab === 'points') return <PointHistorySection />

    const listData = activeTab === 'followers' ? followersData : followingData
    if (listData === null) return null
    if (listData.length === 0) {
      return (
        <EmptyState
          icon={<UsersIcon className="w-8 h-8" />}
          title={
            isOwnProfile
              ? (activeTab === 'followers' ? d.profile.emptyFollowers : d.profile.emptyFollowing)
              : t(activeTab === 'followers' ? d.profile.emptyFollowersOther : d.profile.emptyFollowingOther, { name: subjectName })
          }
          description={
            isOwnProfile
              ? (activeTab === 'followers' ? d.profile.emptyFollowersBody : d.profile.emptyFollowingBody)
              : undefined
          }
        />
      )
    }
    return (
      <div className="flex flex-col gap-2">
        {listData.map(u => (
          <ListRow
            key={u.id}
            href={`/${u.username}`}
            // 팔로워/팔로잉 탭이 URL 해시로 열린 상태(예: /profile#followers)에서 다른 유저
            // 프로필로 이동하면, Next 클라이언트 라우팅이 pathname만 바꾸고 기존 해시는
            // 지우지 않아 /{username}#followers가 남는다. 이동 직전에 해시를 제거한다 (20260902_0915).
            onClick={clearProfileHash}
            lead={
              u.avatar_url ? (
                <Image src={u.avatar_url} alt="" width={48} height={48} />
              ) : (
                <UserIcon className="w-5 h-5 text-muted" />
              )
            }
            leadShape="round"
            title={getDisplayName(u)}
            titleVariant="regular"
            trail={
              u.id !== currentUserId ? (
                <Button
                  surface="sub"
                  variant={listFollowStates[u.id] ? 'secondary' : 'primary'}
                  size="xs"
                  onClick={() => handleListFollow(u.id)}
                  className="shrink-0"
                >
                  {/* Text states swap (04-text-states-swap.md) */}
                  <SwapText value={listFollowStates[u.id] ? d.profile.followingButton : d.profile.followButton} />
                </Button>
              ) : undefined
            }
          />
        ))}
      </div>
    )
  }

  // 숫자 줄 — 인스타그램식 팔로워·팔로잉·포인트(티켓 20261108_1216). 탭 카드가 아니라 글자 줄이다.
  // 선택 표시는 라벨 색 전환뿐이다(밑줄·면 없음). 해시가 없는 기본 화면에서는 아무것도 선택돼 있지 않다.
  // 팔로워 수는 팔로우/언팔로우 즉시 바뀌므로 Number pop-in(02-number-pop-in.md)을 건다.
  const statItems: { key: TabKey; label: string; value: string }[] = [
    { key: 'followers', label: d.tabs.followers, value: compactCount(followerCnt) },
    { key: 'following', label: d.tabs.following, value: compactCount(followingCount) },
    ...(isOwnProfile
      ? [{ key: 'points' as const, label: d.profile.pointBadgeLabel, value: pointBalance === null ? '–' : compactCount(pointBalance) }]
      : []),
  ]
  // 2026-11-08 사용자 요청(인스타그램 참고 이미지): 숫자 위·라벨 아래로 쌓은 칸 세 개를 한 줄에 둔다.
  // 칸 폭은 3등분(grid-cols-3)이고 타인 프로필은 두 칸만 채운다(칸 위치가 본인과 같다). 999,999도 한 칸에 들어간다.
  const statRow = (
    <div className="grid grid-cols-3 gap-x-2">
      {statItems.map(({ key, label, value }) => {
        const selected = isTabView && activeTab === key
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => handleTabClick(key)}
            className="flex flex-col items-start min-w-0 min-h-11 text-left whitespace-nowrap break-keep active:scale-95 transition-transform duration-100 motion-reduce:transition-none cursor-pointer"
          >
            <strong className="text-xl leading-tight font-bold tabular-nums text-foreground">
              {key === 'followers' ? <PopInNumber value={value} /> : value}
            </strong>
            <span className={`text-sm transition-colors duration-150 motion-reduce:transition-none ${selected ? 'text-foreground' : 'text-muted'}`}>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="min-h-full text-foreground">
      {/* 20260824_021: 본인 프로필에도 TopNav를 둔다(로고 모드) — 탭바로 직접 오는 루트
          화면이라 알림 종이 필요하다. 타인 프로필은 back+닉네임이라 종이 붙지 않는다.
          TopNav가 safe-area-inset-top을 이미 처리하므로 본문 상단 여백도 함께 줄인다. */}
      {isOwnProfile ? (
        <TopNav logo />
      ) : (
        <TopNav title="" showBack backHref={fromNotifications ? '/notifications' : undefined} />
      )}

      <div
        className={`px-4 pb-10 pt-6 flex flex-col gap-6`}
      >
        {/* 프로필 헤더 — Card 배경 제거, 컨텐츠는 페이지 패딩 폭까지 확장 (20260820_019).
            아바타 확대·편집 버튼 축소·아이디 전체노출·포인트를 아이디 아래로 이동 (20260820_021).
            티켓 20260909_2119: 아바타 모서리의 편집 버튼을 없애고, 포인트 표시 행 우측 끝에
            "편집" 버튼을 새로 두어 그걸로 /profile/edit에 진입한다. */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <Link href={`/${username}`} onClick={clearProfileHash}>
              {profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={d.profile.avatarAlt}
                  width={96}
                  height={96}
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-surface text-foreground flex items-center justify-center">
                  <UserIcon className="w-10 h-10" />
                </div>
              )}
            </Link>
          </div>

          {/* 아이디는 더 이상 truncate하지 않는다 — 줄바꿈을 허용해 전체 노출(20260820_021) */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {/* 내 챕터 — 표시 이름 위 작은 글씨 한 줄(티켓 20261031_1806). 퀘스트 전·읽지 못함(null)은 줄 자체를 그리지 않는다 */}
            {/* 챕터 줄과 같은 행 오른쪽 끝에 칩 크기의 편집 버튼을 둔다(2026-11-08 사용자 요청). 챕터가 없어도 버튼은 오른쪽 끝에 남는다 */}
            {isOwnProfile && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {chapterInitial && <ChapterLine variant="mine" chapter={chapterInitial} />}
                </div>
                {/* 칩 크기(목록 칩과 같은 12px 글자·2px 8px 여백)로 줄인다(2026-11-08 사용자 요청). 테두리 1px만큼 여백을 뺀다 */}
                <Button
                  surface="main"
                  variant="outline"
                  size="xs"
                  className="shrink-0"
                  style={{ minHeight: 0, padding: '1px 7px', lineHeight: 'var(--text-xs--line-height)' }}
                  onClick={() => router.push('/profile/edit')}
                >
                  {d.profile.editButton}
                </Button>
              </div>
            )}
            <Link
              href={`/${username}`}
              onClick={clearProfileHash}
              className="text-2xl break-words"
            >
              {(profile && getDisplayName(profile)) || d.profile.anonymous}
            </Link>

            {/* 숫자 줄(티켓 20261108_1216). 팔로우 버튼은 헤더 아래 전체 폭, 편집 버튼은 챕터 줄 오른쪽 끝에 있다(2026-11-08 사용자 요청). */}
            {statRow}
          </div>

        </div>

        {/* 팔로우/언팔로우(타인) 버튼 — 헤더 아래 전체 폭 작은 버튼(xs, 약 31px)으로 둔다(2026-11-08 사용자 요청). 편집 버튼은 챕터 줄 오른쪽 끝으로 옮겼다.
            sm은 알약 모양의 기본 세로 여백(py-[13px])에 밀려 높이가 52px로 남으므로 쓰지 않는다.
            예전에는 편집이 숫자 줄 오른쪽, 팔로우가 헤더 오른쪽에 있어 숫자 줄 칸이 좁아져 줄이 바뀌었다. */}
        {!isOwnProfile && (
          <Button
            surface="sub"
            variant={following ? 'secondary' : 'primary'}
            size="xs"
            fullWidth
            onClick={handleFollow}
            disabled={followLoading}
          >
            {/* Text states swap (04-text-states-swap.md) */}
            <SwapText value={following ? d.profile.followingButton : d.profile.followButton} />
          </Button>
        )}

        {/* 다른 유저의 챕터 줄 (티켓 20261019_1317) — 헤더 아래 전폭 한 줄 «트라이브 · 챕터 3 · 단골». 게이지 없음.
            다른 유저 프로필에서만 서버가 `publicChapter`를 내려주고, 읽지 못함(null)이거나 보일 조각이 없으면 줄이 없다. */}
        {!isOwnProfile && publicChapter && <ChapterLine variant="public" chapter={publicChapter} />}

        {/* 캡슐 위젯 — 내 프로필에서만. 프로필 헤더와 선택 영역(피드·목록) 사이이고 헤더와의 간격은 바깥 gap-6 하나다
            (챕터는 헤더의 표시 이름 위로 옮겼다, 티켓 20261031_1806. 위젯 안의 게이지-안내 간격은 위젯이 정한다).
            캡슐 위젯(티켓 20261018_0054)의 렌더 조건은 서버가 prop을 내려줬는지(`capsuleInitial !== undefined`)이고, 타인 프로필에는 prop이 없다. */}
        {isOwnProfile && capsuleInitial !== undefined && <CapsuleWidget initial={capsuleInitial} blockedCard />}

        {/* 탭 콘텐츠 — 탭뷰일 때만.
            로딩은 Skeleton loader and reveal(14-skeleton-reveal.md)로 처리한다.
            콘텐츠 높이가 가변이라 `.jam-skel-flow` 변형을 써서 콘텐츠는 흐름에 두고
            스켈레톤만 위에 겹친다. */}
        {isTabView && (
          <section>
            <div
              className={['t-skel', 'jam-skel-flow', tabLoading ? '' : 'is-revealed'].filter(Boolean).join(' ')}
              style={{ '--jam-skel-min-h': '280px' } as CSSProperties}
            >
              <div className="t-skel-skeleton is-pulsing flex flex-col gap-2 content-start" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[72px] rounded-2xl bg-background-inverse/15" />
                ))}
              </div>
              <div className="t-skel-content" aria-busy={tabLoading}>
                {tabLoading ? null : renderTabContent()}
              </div>
            </div>
          </section>
        )}

        {/* 기본뷰(해시 없음) — 본인은 활동 피드, 타인은 그 사람의 배지 그리드(티켓 20261108_1216).
            데이터는 이미 대상 유저(target) 기준으로 조회돼 전달되므로 별도 조회는 없다. */}
        {!isTabView && isOwnProfile && (
          <FeedSection feedItems={feedItems} badgeLinkQuery={`?u=${username}`} activityNames={activityNames} hideHeader />
        )}
        {!isTabView && !isOwnProfile && <section>{renderBadgeGrid()}</section>}

        {/* 로그아웃 — 본인만 */}
        {isOwnProfile && (
          <Button variant="outline" surface="main" fullWidth onClick={handleLogout}>
            {d.profile.logoutButton}
          </Button>
        )}
      </div>

      {/* 배지 리빌 오버레이 — 헤더 팔로우 버튼·팔로워/팔로잉 탭 리스트 공용 (20260910_2132) */}
      <BadgeRevealOverlay
        open={revealOpen}
        items={earnedBadges}
        moreCount={earnedBadgesMore}
        profileHref="/profile"
        onClose={() => setRevealOpen(false)}
      />
    </div>
  )
}
