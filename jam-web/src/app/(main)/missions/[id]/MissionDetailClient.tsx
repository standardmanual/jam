'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import SafeImage from '@/components/SafeImage'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import InlineNotice from '@/components/ui/InlineNotice'
import TopNav from '@/components/ui/TopNav'
import { LockIcon, CoinIcon, PackageIcon } from '@/components/ui/icons'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { LockedTile } from '@ds/components/cards/LockedTile'
import ListRowCard from '@/components/ui/ListRowCard'
import { Card } from '@ds/components/cards/Card'
import type { MissionRow, MissionCondition, BadgeRarity } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { RARITY_LABEL } from '@/lib/rarity'
import { useRevealOnMount } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'
import { trackEvent } from '@/lib/analytics/gtag'
import { formatMissionProgress } from '@/lib/missions/format'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'
import type { ClaimItemRewardsErrorCode } from '@/lib/missions/claim-contract'

export interface RewardBadgeInfo {
  id: string
  name: string
  image_url: string | null
  rarity: BadgeRarity
}

/**
 * 받지 않은 아이템 보상 한 건(티켓 20261019_1313 3회, 운영 로직 7.3절).
 * 열린 보상은 이름·그림을 싣는다. **잠긴 보상은 이름·그림·설명·배지 id 없이 등급과 `locked`만 싣는다** —
 * 받기 전에 어떤 아이템 배지인지 알 수 있는 값이 클라이언트로 내려가면 안 된다. 등급은 배지에 등급이 없으면 null이다.
 */
export type PendingRewardInfo =
  | { locked: false; id: string; name: string; image_url: string | null; rarity: BadgeRarity | null }
  | { locked: true; rarity: BadgeRarity | null }

interface Props {
  mission: MissionRow
  isParticipating: boolean
  isCompleted: boolean
  progressValue: number
  rewardBadges: RewardBadgeInfo[]
  /**
   * 보상 중 잠긴 아이템 배지의 등급 목록(티켓 20261019_1317 2회, 운영 로직 7.3절). 이름·그림·id는 내려오지 않는다 —
   * 보상 카드에서 열린 배지 행 뒤에 잠금 타일과 등급 칩으로만 보인다. 등급이 없는 배지는 null이다.
   */
  lockedRewardRarities?: (BadgeRarity | null)[]
  /**
   * 내가 아직 받지 않은 아이템 보상(인벤토리 빈칸이 모자라 보류된 것). 비어 있지 않으면 «받을 보상» 카드와 «받기» 버튼을 그린다.
   * `null`은 읽지 못했다는 뜻이다 — «받을 보상 없음»(빈 배열)과 구분해, 완료한 미션에서만 읽지 못했다고 알린다(티켓 20261019_1317 2회).
   */
  pendingRewards?: PendingRewardInfo[] | null
  /** 밤 조건(22:00~05:00 KST와 겹치는 시간대) 미션이면 «달성 조건» 카드 아래에 안전 안내를 늘 보인다 */
  nightNotice?: boolean
  /** 20260825_028: 아직 열리지 않은 레벨업 미션 — 참가 불가 안내만 노출 */
  locked?: boolean
  /** 잠금 해제에 필요한 본 배지 (locked일 때만) */
  requiredBadge?: { name: string; rarity: BadgeRarity } | null
}


function missionGoalText(type: string, condition: MissionCondition): { label: string; unit: string; target: number } {
  switch (type) {
    case 'distance':          return { label: d.missions.goalDistance,        unit: 'km', target: condition.distance_km ?? 0 }
    case 'activity_count':    return { label: d.missions.goalActivityCount,    unit: '회', target: condition.count ?? 0 }
    case 'checkin':           return { label: d.missions.goalCheckin,          unit: '곳', target: 1 }
    case 'item_collect':      return { label: d.missions.goalItemCollect,      unit: '개', target: 1 }
    case 'streak_days':       return { label: d.missions.goalStreakDays,       unit: '일', target: condition.streak_days ?? 0 }
    case 'duration_minutes':  return { label: d.missions.goalDurationMinutes,  unit: '분', target: condition.duration_minutes ?? 0 }
    case 'elevation_gain_m':  return { label: d.missions.goalElevationGainM,  unit: 'm',  target: condition.elevation_gain_m ?? 0 }
    // engine_condition(티켓 20260906_2231) — 여러 필드를 조합하는 복합 조건이라 진행바 개념이
    // 없다. checkin/item_collect와 같은 달성형(target=1)으로 취급한다.
    case 'engine_condition':  return { label: d.missions.goalEngineCondition,  unit: '',   target: 1 }
    default:                  return { label: d.missions.goalDefault,          unit: '',   target: 0 }
  }
}

function timeLeft(endsAt: string | null): string {
  if (endsAt === null) return d.missions.tagPermanent
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return d.missions.tagEnded
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간 ${d.missions.timeLeftSuffix}`
  return `${h}시간 ${m}분 ${d.missions.timeLeftSuffix}`
}

/* ── 섹션 레이블 — 배지 상세 '획득 조건'과 동일한 토큰 ── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] font-bold text-foreground">
      {children}
    </p>
  )
}

/* ── 다크 인포 카드 (20260816_012: 보더 제거, 페이지 캔버스보다 밝은 엘리베이션 배경으로 구분) ── */
function InfoCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={`flex flex-col gap-4 ${className}`}>
      {children}
    </Card>
  )
}

/* ── 달성 조건 카드의 불릿 행 (티켓 20260927_0026) — primary: 조건·활동 종류, muted: 보조 문구 ── */
function ConditionRow({
  tone,
  breakKeep = false,
  children,
}: {
  tone: 'primary' | 'muted'
  /** 긴 조건 문장이 어절 단위로 접히게 한다 */
  breakKeep?: boolean
  children: React.ReactNode
}) {
  const muted = tone === 'muted'
  return (
    <div className={`flex items-start gap-2 text-[14px] leading-[1.43] ${muted ? 'text-muted' : 'text-foreground'}`}>
      <span
        aria-hidden="true"
        className={`text-base leading-[1.2] flex-shrink-0 mt-px ${muted ? 'opacity-50' : 'text-[var(--link)]'}`}
      >
        •
      </span>
      <span className={breakKeep ? 'break-keep' : undefined}>{children}</span>
    </div>
  )
}

/* ── 미션 상태 칩 ── */
function StatusChip({ isCompleted, participating, locked }: { isCompleted: boolean; participating: boolean; locked: boolean }) {
  // 20260825_028: 잠긴 미션은 오늘카드·딥링크로만 도달하는데, 칩이 없으면 스크롤 최하단에
  // 가서야 상태를 알게 된다. 목록 잠금 카드와 같은 자물쇠 글리프를 첫 화면에 노출한다.
  if (locked) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold leading-none"
        style={{ background: 'var(--border)', color: 'var(--foreground)' }}>
        {/* 12px 렌더라 기본 strokeWidth 1.5(=24px 전제)로는 실효 0.75px로 뭉개진다 — 호출부 보정 */}
        <LockIcon className="w-3 h-3 shrink-0" strokeWidth={2.2} />
        {d.missions.tagLocked}
      </span>
    )
  }
  if (isCompleted) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold leading-none"
        style={{ background: 'var(--background-secondary)', color: 'var(--muted)' }}>
        {d.missions.tagDone}
      </span>
    )
  }
  if (participating) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold leading-none"
        style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
        {d.missions.tagJoined}
      </span>
    )
  }
  return null
}

/* ── 잠긴 아이템 배지 한 건의 자리 — 이름·그림 없이 잠금 타일과 등급 칩만 (운영 로직 7.3절) ── */
function LockedRewardRow({ rarity, caption }: { rarity: BadgeRarity | null; caption?: string }) {
  return (
    <div className="flex items-center gap-4">
      <LockedTile size={64} className="flex-shrink-0" />
      <div className="flex flex-col items-start gap-1 flex-1 min-w-0">
        <RarityBadge rarity={rarity} />
        <p className="max-w-full text-[16px] font-bold leading-[1.2] text-foreground truncate break-keep wrap-break-word">{d.lockedItem.card.name}</p>
        {caption && <p className="text-[13px] leading-[1.3] text-muted break-keep wrap-break-word text-pretty">{caption}</p>}
      </div>
    </div>
  )
}

/* ── 받을 보상 카드의 한 줄 — 열린 보상은 그림·이름·등급 칩, 잠긴 보상은 LockedRewardRow ── */
function PendingRewardRow({ reward }: { reward: PendingRewardInfo }) {
  if (reward.locked) return <LockedRewardRow rarity={reward.rarity} />
  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-border flex items-center justify-center flex-shrink-0 overflow-hidden">
        <SafeImage
          src={reward.image_url}
          alt={reward.name}
          width={52}
          height={52}
          className="w-[52px] h-[52px] object-contain"
          fallback={<PackageIcon className="w-6 h-6 text-muted" />}
        />
      </div>
      <div className="flex flex-col items-start gap-1 flex-1 min-w-0">
        <RarityBadge rarity={reward.rarity} />
        <p className="max-w-full text-[16px] font-bold leading-[1.2] text-foreground truncate break-keep wrap-break-word">{reward.name}</p>
      </div>
    </div>
  )
}

/** 받기 요청의 결과를 화면이 다룰 갈래로 나눈다 */
export type ClaimOutcome =
  | { kind: 'claimed'; granted: number | null }
  | { kind: 'insufficient_slots'; free: number | null; needed: number | null; message: string }
  | { kind: 'no_pending'; message: string }
  | { kind: 'suspended'; message: string }
  | { kind: 'failed'; message: string }

/** 받기 뒤에 카드 안에 남기는 안내 — 빈칸이 모자라거나 이용이 정지된 경우 */
type ClaimNotice = { kind: 'short'; free: number | null; needed: number | null; message: string } | { kind: 'message'; message: string }

const CLAIM_INSUFFICIENT_SLOTS: ClaimItemRewardsErrorCode = 'insufficient_slots'
const CLAIM_NO_PENDING: ClaimItemRewardsErrorCode = 'no_pending'

function readCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * `POST /api/missions/[id]/claim` 응답을 읽는다(티켓 20261019_1313 3회의 응답 계약).
 *  - 200: 받았다. · 409 `insufficient_slots`: 빈칸 부족(`free`·`needed`). · 409 `no_pending`: 받을 보상이 더 없다.
 *  - 403 `user_suspended`: 이용 정지. · 그 밖(404·500·모양이 다른 응답): 실패.
 * 문구는 서버가 보낸 `error`를 우선 쓰고, 없으면 같은 뜻의 `d.missions.claim` 문구로 대신한다.
 */
export function resolveClaimOutcome(status: number, ok: boolean, raw: unknown): ClaimOutcome {
  const data = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const serverMessage = typeof data.error === 'string' && data.error.trim() !== '' ? data.error : null
  if (ok) return { kind: 'claimed', granted: typeof data.granted === 'number' && data.granted > 0 ? data.granted : null }
  if (status === 403 && data.code === USER_SUSPENDED_CODE) {
    return { kind: 'suspended', message: serverMessage ?? d.suspension.missionClaimBlocked }
  }
  if (status === 409 && data.code === CLAIM_INSUFFICIENT_SLOTS) {
    return {
      kind: 'insufficient_slots',
      free: readCount(data.free),
      needed: readCount(data.needed),
      message: serverMessage ?? d.missions.claim.insufficientSlots,
    }
  }
  if (status === 409 && data.code === CLAIM_NO_PENDING) {
    return { kind: 'no_pending', message: serverMessage ?? d.missions.claim.noPending }
  }
  return { kind: 'failed', message: serverMessage ?? d.missions.claim.failed }
}

export default function MissionDetailClient({
  mission,
  isParticipating,
  isCompleted,
  progressValue,
  rewardBadges,
  lockedRewardRarities = [],
  pendingRewards = [],
  nightNotice = false,
  locked = false,
  requiredBadge = null,
}: Props) {
  const [participating, setParticipating] = useState(isParticipating)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // 받을 보상 받기 — 성공하면 서버가 다시 읽기 전에도 카드를 바로 숨긴다(`claimed`)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [claimNotice, setClaimNotice] = useState<ClaimNotice | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  const condition = mission.condition_json as MissionCondition
  const goal = missionGoalText(mission.mission_type, condition)
  // 20260927_0026: 직접 쓴 조건 문장이 있으면 카드 첫 줄이 그 문장이다(빈 문자열·공백은 없는 것으로 본다)
  const conditionText = mission.condition_text?.trim() || null
  const progressPct = goal.target > 0 ? Math.min(100, (progressValue / goal.target) * 100) : 0
  const isActive = new Date(mission.starts_at) <= new Date() && (mission.ends_at === null || new Date(mission.ends_at) > new Date())
  const isAchievementType = mission.mission_type === 'checkin' || mission.mission_type === 'item_collect' || mission.mission_type === 'engine_condition'
  const isStreakType = mission.mission_type === 'streak_days'
  // 티켓 20261019_1445 3-B: 달성은 완료 기록(isCompleted)으로만 판정한다. 예전에는 `|| progressValue >= 1`도 달성으로 봤지만, 복합 조건에
  // «기간 동안 모은 잼»(jam_period_earned) 같은 새 키가 있으면 진행값이 모은 양이라 1잼만 모아도 달성으로 그려졌다.
  const achieved = isCompleted

  const confirmPanelRef = useRevealOnMount<HTMLDivElement>(confirming)

  async function handleJoin() {
    setLoading(true)
    try {
      const res = await fetch(`/api/missions/${mission.id}/join`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast(data.error ?? d.missions.joinError, 'error'); return }
      setParticipating(true)
      setConfirming(false)
      toast(d.missions.joinSuccess, 'success')
      trackEvent('mission_join', { mission_id: mission.id })
      router.refresh()
    } catch {
      toast(d.missions.joinNetworkError, 'error')
    } finally {
      setLoading(false)
    }
  }

  const pendingList = pendingRewards ?? []

  /** 받지 않은 보상을 한 번에 받는다. 받는 중에는 같은 요청을 다시 보내지 않는다 */
  async function handleClaim() {
    if (claiming) return
    setClaiming(true)
    setClaimNotice(null)
    try {
      const res = await fetch(`/api/missions/${mission.id}/claim`, { method: 'POST' })
      const outcome = resolveClaimOutcome(res.status, res.ok, await res.json().catch(() => null))
      switch (outcome.kind) {
        case 'claimed':
          setClaimed(true)
          toast(t(d.missions.pendingCard.claimedToast, { count: outcome.granted ?? pendingList.length }), 'success')
          router.refresh()
          break
        case 'insufficient_slots':
          // 토스트 없이 카드 안에 안내를 남긴다. 받지 못한 보상은 그대로 남는다
          setClaimNotice({ kind: 'short', free: outcome.free, needed: outcome.needed, message: outcome.message })
          break
        case 'no_pending':
          // 이미 받았다(다른 기기, 중복 클릭) — 받을 보상이 없으므로 카드를 거두고 서버 값을 다시 읽는다
          setClaimed(true)
          toast(outcome.message, 'info')
          router.refresh()
          break
        case 'suspended':
          setClaimNotice({ kind: 'message', message: outcome.message })
          break
        default:
          toast(outcome.message, 'error')
      }
    } catch {
      toast(d.missions.claim.failed, 'error')
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="min-h-full text-foreground">
      <TopNav title={d.missions.backToDetail} backHref="/missions" />

      <div className="flex flex-col px-6 pt-0 pb-10 gap-6">

        {/* 대표 이미지 — 1:1 정사각형.
            image_url은 어드민 자유 입력이 가능했던 필드라 SafeImage로 렌더한다. next/image에
            직접 넘기면 미등록 호스트 하나로 미션 상세 화면 전체가 500이 된다 (20260824_005).
            폴백은 이미지가 아예 없을 때와 동일한 자리표시 문구 — 카드 배경(bg-surface)이
            남아 레이아웃이 무너지지 않는다. */}
        {/* 20260825_028: 잠김이면 목록 잠금 카드와 같은 grayscale — 목록↔상세 시각 언어를 맞춘다.
            필터는 컨테이너가 아니라 **이미지에만** 건다(BadgeHeroSection.tsx:46과 동일한 하우스 패턴).
            컨테이너에 걸면 카드 표면(bg-surface)까지 흐려져 캔버스와의 경계가 사라지고,
            SafeImage의 폴백 문구도 함께 딤돼 대비가 8.2:1 → 3.3:1로 떨어진다. */}
        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-surface border border-border flex items-center justify-center">
          <SafeImage
            src={mission.image_url}
            alt={t(d.missions.thumbnailAlt, { title: mission.title })}
            className={locked ? 'object-cover grayscale opacity-50' : 'object-cover'}
            sizes="(max-width: 640px) 100vw, 640px"
            priority
            fallback={<span className="text-base text-muted">{d.missions.imagePlaceholder}</span>}
          />
        </div>

        {/* 히어로 섹션 */}
        <div className="flex flex-col items-center gap-4">
          {/* 미션 상태 칩 */}
          <StatusChip isCompleted={isCompleted} participating={participating} locked={locked} />

          {/* 제목 + 설명 */}
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-[36px] font-bold leading-[1.2] text-foreground text-balance">
              {mission.title}
            </h1>
            {mission.description && (
              <p className="text-[15px] leading-[1.47] text-muted whitespace-pre-line">{mission.description}</p>
            )}
          </div>

          {/* 기간 표시 — 참가 전에만. 잠김이면 숨긴다(참가가 불가한데 참가를 재촉하는 잘못된 유도) */}
          {!locked && !isCompleted && !participating && (
            <span className="text-xs text-muted">
              {timeLeft(mission.ends_at)}
            </span>
          )}
        </div>

        {/* ── 받을 보상 — 인벤토리 빈칸이 모자라 받지 못한 보상(티켓 20261019_1317 2회). 히어로 바로 아래, 잠금 안내 위.
            한 번에 모두 받는다. 잠긴 보상은 잠금 타일·«잠긴 아이템 배지»·등급 칩만 보이고 이름·그림·id는 DOM에 없다 ── */}
        {!claimed && pendingList.length > 0 && (
          <InfoCard>
            <SectionLabel>{d.missions.pendingCard.title}</SectionLabel>
            <p className="text-[14px] leading-[1.43] text-muted break-keep wrap-break-word text-pretty">
              {t(d.missions.pendingCard.intro, { count: pendingList.length })}
            </p>
            <div className="flex flex-col gap-3">
              {pendingList.map((reward, index) => (
                <PendingRewardRow key={`${reward.locked ? 'locked' : reward.id}-${index}`} reward={reward} />
              ))}
            </div>
            <Button
              variant="primary"
              surface="main"
              size="lg"
              fullWidth
              loading={claiming}
              className="whitespace-nowrap"
              onClick={handleClaim}
            >
              {claiming ? d.missions.pendingCard.claiming : d.missions.pendingCard.claim}
            </Button>
            {claimNotice && (
              <InlineNotice
                action={
                  claimNotice.kind === 'short' ? (
                    <Link
                      href="/inventory"
                      className="inline-flex min-h-11 items-center self-start break-keep wrap-break-word whitespace-nowrap text-base text-[color:var(--link)]"
                    >
                      {d.missions.pendingCard.inventoryLink}
                    </Link>
                  ) : undefined
                }
              >
                {claimNotice.kind === 'short' && claimNotice.free !== null && claimNotice.needed !== null
                  ? t(d.missions.pendingCard.shortNotice, { free: claimNotice.free, needed: claimNotice.needed })
                  : claimNotice.message}
              </InlineNotice>
            )}
          </InfoCard>
        )}

        {/* 받을 보상을 읽지 못함 — 완료한 미션에서만. «받을 보상 없음»처럼 보이지 않게 따로 알린다 */}
        {pendingRewards === null && isCompleted && (
          <InlineNotice
            action={
              <Button variant="ghost" className="self-start whitespace-nowrap" onClick={() => router.refresh()}>
                {d.missions.pendingCard.retry}
              </Button>
            }
          >
            {d.missions.pendingCard.loadFailed}
          </InlineNotice>
        )}

        {/* ── 잠금 안내 — 히어로 직후. 왜 참가할 수 없는지를 먼저 읽히게 한다 (20260825_028) ── */}
        {locked && (
          <InfoCard>
            <SectionLabel>{d.missions.lockedTitle}</SectionLabel>
            <p className="text-[14px] leading-[1.43] text-muted">
              {requiredBadge
                ? t(d.missions.lockedBody, {
                    badge: requiredBadge.name,
                    rarity: RARITY_LABEL[requiredBadge.rarity] ?? requiredBadge.rarity,
                  })
                : d.missions.lockedBodyGeneric}
            </p>
          </InfoCard>
        )}

        {/* ── 달성 조건 카드 ── */}
        <InfoCard>
          <SectionLabel>{d.missions.conditionTitle}</SectionLabel>
          <div className="flex flex-col gap-2">
            {conditionText ? (
              <ConditionRow tone="primary" breakKeep>{conditionText}</ConditionRow>
            ) : (
              <ConditionRow tone="primary">{goal.label} {goal.target}{goal.unit} 달성</ConditionRow>
            )}
            {condition.activity_type && (
              <ConditionRow tone="primary">
                {t(d.missions.conditionActivityType, { type: ACTIVITY_TYPE_LABELS[condition.activity_type] ?? condition.activity_type })}
              </ConditionRow>
            )}
            <ConditionRow tone="muted">{d.missions.conditionAutoCompleteHint}</ConditionRow>
          </div>
        </InfoCard>

        {/* 밤 조건 미션의 안전 안내 — 닫을 수 없고 늘 보인다(운영 로직 13.2절) */}
        {nightNotice && <InlineNotice>{d.missions.nightNotice}</InlineNotice>}

        {/* ── 진행상황 카드 ── */}
        {(participating || isCompleted) && goal.target > 0 && (
          <InfoCard>
            <SectionLabel>{d.missions.myProgressTitle}</SectionLabel>

            {mission.mission_type === 'engine_condition' ? (
              /* 복합 조건 — 조건은 위 카드가 보여 주므로 상태만 한 문장으로 알린다 (20260927_0119) */
              <p className={`text-[14px] leading-[1.43] ${achieved ? 'text-foreground' : 'text-muted'}`}>
                {achieved ? d.missions.engineConditionAchieved : d.missions.engineConditionNotAchieved}
              </p>
            ) : isAchievementType ? (
              /* 달성형 */
              <div className="flex items-center justify-between">
                <p className="text-[14px] leading-[1.43] text-muted">{goal.label}</p>
                <span className={`text-[14px] font-bold px-3 py-1 rounded-full ${achieved ? 'bg-[var(--accent-content-green)] text-foreground' : 'bg-border text-foreground'}`}>
                  {achieved ? d.missions.achieved : d.missions.notAchieved}
                </span>
              </div>
            ) : isStreakType ? (
              /* streak_days — 프로그레스 바 + 일수 도트 */
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] leading-[1.43] text-muted">
                    {goal.target}일 중 {isCompleted ? goal.target : Math.floor(progressValue)}일
                  </span>
                  <span className="text-[14px] font-bold text-foreground tabular-nums">
                    {isCompleted ? '100' : Math.round(progressPct)}%
                  </span>
                </div>
                <ProgressBar percent={isCompleted ? 100 : progressPct} />
                <div className="flex gap-1.5 pt-1 flex-wrap">
                  {Array.from({ length: goal.target }).map((_, i) => {
                    const done  = i < (isCompleted ? goal.target : Math.floor(progressValue))
                    const today = !done && i === Math.floor(progressValue) && !isCompleted
                    return (
                      <div
                        key={i}
                        // 20260816_012: "오늘" 링만 기능적 하이라이트로 보더 유지, 나머지는 배경톤 채움
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${today ? 'border' : ''}`}
                        style={{
                          background:  done ? 'var(--accent)' : today ? 'transparent' : 'var(--background-secondary)',
                          borderColor: today ? 'var(--link)' : undefined,
                          color:       done  ? 'var(--accent-foreground)' : today ? 'var(--link)' : 'var(--muted)',
                        }}
                      >
                        {i + 1}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* 수치 + 프로그레스 바 */
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[22px] font-bold text-foreground tabular-nums leading-none">
                    {isCompleted ? goal.target : formatMissionProgress(progressValue, mission.mission_type)}{goal.unit}
                    <span className="text-[16px] font-normal text-muted mx-1">/</span>
                    {goal.target}{goal.unit}
                  </span>
                  <span className="text-[14px] font-bold text-foreground tabular-nums">
                    {isCompleted ? '100' : Math.round(progressPct)}%
                  </span>
                </div>
                <ProgressBar percent={isCompleted ? 100 : progressPct} />
              </div>
            )}
          </InfoCard>
        )}

        {/* ── 보상 카드 ── */}
        {(rewardBadges.length > 0 || lockedRewardRarities.length > 0 || mission.reward_points) && (
          <InfoCard>
            <SectionLabel>{d.missions.rewardSectionTitle}</SectionLabel>

            <div className="flex flex-col gap-3">
              {rewardBadges.map((badge) => (
                <Link key={badge.id} href={`/badges/${badge.id}`} className="active:opacity-70 transition-opacity duration-100">
                  {/* 배지 보상 행: 카드형 이미지 + MODULAR RarityBadge + 텍스트 */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                      <SafeImage
                        src={badge.image_url}
                        alt={badge.name}
                        width={52}
                        height={52}
                        className="w-[52px] h-[52px] object-contain"
                        fallback={<span className="text-2xl">🏅</span>}
                      />
                    </div>
                    <div className="flex flex-col items-start gap-1 flex-1 min-w-0">
                      <RarityBadge rarity={badge.rarity} />
                      <p className="text-[16px] font-bold leading-[1.2] text-foreground truncate">{badge.name}</p>
                      <p className="text-[13px] leading-[1.3] text-muted">{d.missions.rewardBadgeCaption}</p>
                    </div>
                  </div>
                </Link>
              ))}

              {/* 잠긴 아이템 배지 보상 행: 이름·그림·링크 없이 잠금 타일 + 등급 칩 (운영 로직 7.3절) */}
              {lockedRewardRarities.map((rarity, index) => (
                <LockedRewardRow key={`locked-${index}`} rarity={rarity} caption={d.missions.rewardBadgeCaption} />
              ))}

              {/* 포인트 보상 행: ListRowCard + 서클 CoinIcon */}
              {mission.reward_points ? (
                <ListRowCard
                  tone="tint"
                  icon={
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--accent)' }}>
                      <CoinIcon className="w-5 h-5" style={{ color: 'var(--accent-foreground)' }} />
                    </div>
                  }
                  title={t(d.missions.rewardPointsLine, { points: mission.reward_points.toLocaleString('ko-KR') })}
                  subtitle={d.missions.rewardPointsCaption}
                />
              ) : null}
            </div>

            {mission.max_completions && (
              <p className="text-xs text-muted">
                {t(d.missions.limitedSlots, { count: mission.max_completions.toLocaleString() })}
              </p>
            )}
          </InfoCard>
        )}

        {/* 미션 상황 보기 — 참가자만 */}
        {(participating || isCompleted) && (
          <Link href={`/missions/${mission.id}/status`}>
            <div className="bg-surface border border-border rounded-2xl p-4 text-center text-base text-muted jam-press">
              {d.missions.statusViewButton}
            </div>
          </Link>
        )}

        {/* ── CTA 버튼 ── */}
        {/* 20260825_028: 잠긴 미션은 참가 CTA를 렌더하지 않는다(해제 조건 안내는 히어로 직후) */}
        {locked ? null : isCompleted ? (
          /* 완료 → 종료 (disabled) */
          <button
            disabled
            className="w-full min-h-[56px] rounded-full text-[16px] font-bold leading-[1.5] cursor-default"
            style={{ background: 'var(--surface)', color: 'var(--muted)' }}
          >
            {d.missions.ctaEnded}
          </button>
        ) : participating ? (
          /* 참가 중 (disabled) */
          <button
            disabled
            className="w-full min-h-[56px] rounded-full text-[16px] font-bold leading-[1.5] cursor-default"
            style={{ background: 'var(--surface)', color: 'var(--muted)' }}
          >
            {d.missions.tagJoined}
          </button>
        ) : isActive ? (
          /* 참가 전 → 참가하기 */
          confirming ? (
            <div
              ref={confirmPanelRef}
              className="t-panel-slide"
              data-open="false"
              style={{ ['--panel-translate-y' as string]: '32px' }}
            >
              <Card>
                <p className="text-base text-muted text-center mb-4">
                  {d.missions.joinConfirmBody}
                </p>
                <div className="flex gap-2">
                  {/* 흰 Card 위 취소는 secondary(--default #e9e7e0), 확인은 primary다. 인라인 색 덮어쓰기는 없다 */}
                  <Button
                    fullWidth
                    variant="secondary"
                    onClick={() => setConfirming(false)}
                    disabled={loading}
                  >
                    {d.drops.cancel}
                  </Button>
                  {/* 20260916_0856: 참가 처리 중에는 joinButtonPending("참가하는 중")으로 라벨 교체 */}
                  <Button fullWidth loading={loading} onClick={handleJoin}>
                    {loading ? d.missions.joinButtonPending : d.missions.joinConfirmButton}
                  </Button>
                </div>
              </Card>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button variant="primary" surface="main" fullWidth size="lg" onClick={() => setConfirming(true)}>
                {d.missions.joinButton}
              </Button>
              <p className="text-xs text-muted text-center">{d.missions.joinNote}</p>
            </div>
          )
        ) : null}

      </div>
    </div>
  )
}
