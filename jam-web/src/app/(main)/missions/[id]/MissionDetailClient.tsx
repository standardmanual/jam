'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import SafeImage from '@/components/SafeImage'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import TopNav from '@/components/ui/TopNav'
import { LockIcon, CoinIcon } from '@/components/ui/icons'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import ListRowCard from '@/components/ui/ListRowCard'
import type { MissionRow, MissionCondition, BadgeRarity } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { RARITY_LABEL } from '@/lib/rarity'
import { useRevealOnMount } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'
import { formatMissionProgress } from '@/lib/missions/format'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'

export interface RewardBadgeInfo {
  id: string
  name: string
  image_url: string | null
  rarity: BadgeRarity
}

interface Props {
  mission: MissionRow
  isParticipating: boolean
  isCompleted: boolean
  progressValue: number
  rewardBadges: RewardBadgeInfo[]
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
    <p className="text-[15px] font-bold text-text">
      {children}
    </p>
  )
}

/* ── 다크 인포 카드 (20260816_012: 보더 제거, 페이지 캔버스보다 밝은 엘리베이션 배경으로 구분) ── */
function InfoCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface-elevated rounded-[var(--radius-cards)] p-6 flex flex-col gap-4 ${className}`}>
      {children}
    </div>
  )
}

/* ── 미션 상태 칩 ── */
function StatusChip({ isCompleted, participating, locked }: { isCompleted: boolean; participating: boolean; locked: boolean }) {
  // 20260825_028: 잠긴 미션은 오늘카드·딥링크로만 도달하는데, 칩이 없으면 스크롤 최하단에
  // 가서야 상태를 알게 된다. 목록 잠금 카드와 같은 자물쇠 글리프를 첫 화면에 노출한다.
  if (locked) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold leading-none"
        style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-secondary)' }}>
        {/* 12px 렌더라 기본 strokeWidth 1.5(=24px 전제)로는 실효 0.75px로 뭉개진다 — 호출부 보정 */}
        <LockIcon className="w-3 h-3 shrink-0" strokeWidth={2.2} />
        {d.missions.tagLocked}
      </span>
    )
  }
  if (isCompleted) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold leading-none"
        style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-secondary)' }}>
        {d.missions.tagDone}
      </span>
    )
  }
  if (participating) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-bold leading-none"
        style={{ background: 'rgba(232,70,31,0.15)', color: 'var(--color-primary)' }}>
        {d.missions.tagJoined}
      </span>
    )
  }
  return null
}


export default function MissionDetailClient({
  mission,
  isParticipating,
  isCompleted,
  progressValue,
  rewardBadges,
  locked = false,
  requiredBadge = null,
}: Props) {
  const [participating, setParticipating] = useState(isParticipating)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const condition = mission.condition_json as MissionCondition
  const goal = missionGoalText(mission.mission_type, condition)
  const progressPct = goal.target > 0 ? Math.min(100, (progressValue / goal.target) * 100) : 0
  const isActive = new Date(mission.starts_at) <= new Date() && (mission.ends_at === null || new Date(mission.ends_at) > new Date())
  const isAchievementType = mission.mission_type === 'checkin' || mission.mission_type === 'item_collect'
  const isStreakType = mission.mission_type === 'streak_days'
  const achieved = isCompleted || progressValue >= 1

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
      router.refresh()
    } catch {
      toast(d.missions.joinNetworkError, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.missions.backToDetail} backHref="/missions" headerStyle={{ background: 'var(--color-surface)' }} />

      <div className="flex flex-col px-6 pt-0 pb-10 gap-6">

        {/* 대표 이미지 — 1:1 정사각형.
            image_url은 어드민 자유 입력이 가능했던 필드라 SafeImage로 렌더한다. next/image에
            직접 넘기면 미등록 호스트 하나로 미션 상세 화면 전체가 500이 된다 (20260824_005).
            폴백은 이미지가 아예 없을 때와 동일한 자리표시 문구 — 카드 배경(bg-surface-elevated)이
            남아 레이아웃이 무너지지 않는다. */}
        {/* 20260825_028: 잠김이면 목록 잠금 카드와 같은 grayscale — 목록↔상세 시각 언어를 맞춘다.
            필터는 컨테이너가 아니라 **이미지에만** 건다(BadgeHeroSection.tsx:46과 동일한 하우스 패턴).
            컨테이너에 걸면 카드 표면(bg-surface-elevated)까지 흐려져 캔버스와의 경계가 사라지고,
            SafeImage의 폴백 문구도 함께 딤돼 대비가 8.2:1 → 3.3:1로 떨어진다. */}
        <div className="relative w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden bg-surface-elevated flex items-center justify-center">
          <SafeImage
            src={mission.image_url}
            alt={`${mission.title} 썸네일`}
            className={locked ? 'object-cover grayscale opacity-50' : 'object-cover'}
            sizes="(max-width: 640px) 100vw, 640px"
            priority
            fallback={<span className="text-[length:var(--text-body-sm)] text-text-secondary">이미지 영역</span>}
          />
        </div>

        {/* 히어로 섹션 */}
        <div className="flex flex-col items-center gap-4">
          {/* 미션 상태 칩 */}
          <StatusChip isCompleted={isCompleted} participating={participating} locked={locked} />

          {/* 제목 + 설명 */}
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] text-text text-balance">
              {mission.title}
            </h1>
            {mission.description && (
              <p className="text-[15px] leading-[1.47] text-text-secondary">{mission.description}</p>
            )}
          </div>

          {/* 기간 표시 — 참가 전에만. 잠김이면 숨긴다(참가가 불가한데 참가를 재촉하는 잘못된 유도) */}
          {!locked && !isCompleted && !participating && (
            <span className="text-[length:var(--text-caption)] text-text-secondary">
              {timeLeft(mission.ends_at)}
            </span>
          )}
        </div>

        {/* ── 잠금 안내 — 히어로 직후. 왜 참가할 수 없는지를 먼저 읽히게 한다 (20260825_028) ── */}
        {locked && (
          <InfoCard>
            <SectionLabel>{d.missions.lockedTitle}</SectionLabel>
            <p className="text-[14px] leading-[1.43] text-text-secondary">
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
            <div className="flex items-start gap-2 text-[14px] leading-[1.43] text-text">
              <span className="text-[var(--color-primary)] text-base leading-[1.2] flex-shrink-0 mt-px">•</span>
              <span>{goal.label} {goal.target}{goal.unit} 달성</span>
            </div>
            {condition.activity_type && (
              <div className="flex items-start gap-2 text-[14px] leading-[1.43] text-text">
                <span className="text-[var(--color-primary)] text-base leading-[1.2] flex-shrink-0 mt-px">•</span>
                <span>활동 종류: {ACTIVITY_TYPE_LABELS[condition.activity_type] ?? condition.activity_type}</span>
              </div>
            )}
            <div className="flex items-start gap-2 text-[14px] leading-[1.43] text-text-secondary">
              <span className="text-base leading-[1.2] flex-shrink-0 mt-px opacity-50">•</span>
              <span>미션 참가 후 언제든지 조건을 충족하면 자동 완료</span>
            </div>
          </div>
        </InfoCard>

        {/* ── 진행상황 카드 ── */}
        {(participating || isCompleted) && goal.target > 0 && (
          <InfoCard>
            <SectionLabel>{d.missions.myProgressTitle}</SectionLabel>

            {isAchievementType ? (
              /* 달성형 */
              <div className="flex items-center justify-between">
                <p className="text-[14px] leading-[1.43] text-text-secondary">{goal.label}</p>
                <span className={`text-[14px] font-bold px-3 py-1 rounded-[var(--radius-pill)] ${achieved ? 'bg-white/10 text-text' : 'bg-border text-text-secondary'}`}>
                  {achieved ? d.missions.achieved : d.missions.notAchieved}
                </span>
              </div>
            ) : isStreakType ? (
              /* streak_days — 프로그레스 바 + 일수 도트 */
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] leading-[1.43] text-text-secondary">
                    {goal.target}일 중 {isCompleted ? goal.target : Math.floor(progressValue)}일
                  </span>
                  <span className="text-[14px] font-bold text-text tabular-nums">
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
                          background:  done ? 'var(--color-primary)' : today ? 'transparent' : 'var(--color-border)',
                          borderColor: today ? 'var(--color-primary)' : undefined,
                          color:       done  ? '#fff' : today ? 'var(--color-primary)' : 'var(--color-text-secondary)',
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
                  <span className="text-[22px] font-bold text-text tabular-nums leading-none">
                    {isCompleted ? goal.target : formatMissionProgress(progressValue, mission.mission_type)}{goal.unit}
                    <span className="text-[16px] font-normal text-text-secondary mx-1">/</span>
                    {goal.target}{goal.unit}
                  </span>
                  <span className="text-[14px] font-bold text-text tabular-nums">
                    {isCompleted ? '100' : Math.round(progressPct)}%
                  </span>
                </div>
                <ProgressBar percent={isCompleted ? 100 : progressPct} />
              </div>
            )}
          </InfoCard>
        )}

        {/* ── 보상 카드 ── */}
        {(rewardBadges.length > 0 || mission.reward_points) && (
          <InfoCard>
            <SectionLabel>{d.missions.rewardSectionTitle}</SectionLabel>

            <div className="flex flex-col gap-3">
              {rewardBadges.map((badge) => (
                <Link key={badge.id} href={`/badges/${badge.id}`} className="active:opacity-70 transition-opacity duration-100">
                  {/* 배지 보상 행: 카드형 이미지 + MODULAR RarityBadge + 텍스트 */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-[var(--radius-cards)] bg-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {badge.image_url ? (
                        <Image src={badge.image_url} alt={badge.name} width={52} height={52} className="w-[52px] h-[52px] object-contain" />
                      ) : (
                        <span className="text-2xl">🏅</span>
                      )}
                    </div>
                    <div className="flex flex-col items-start gap-1 flex-1 min-w-0">
                      <RarityBadge rarity={badge.rarity} />
                      <p className="text-[16px] font-bold leading-[1.2] text-text truncate">{badge.name}</p>
                      <p className="text-[13px] leading-[1.3] text-text-secondary">미션 완료 시 획득</p>
                    </div>
                  </div>
                </Link>
              ))}

              {/* 포인트 보상 행: ListRowCard + 서클 CoinIcon */}
              {mission.reward_points ? (
                <ListRowCard
                  icon={
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--color-primary)' }}>
                      <CoinIcon className="w-5 h-5" style={{ color: '#fff' }} />
                    </div>
                  }
                  title={t(d.missions.rewardPointsLine, { points: mission.reward_points.toLocaleString('ko-KR') })}
                  subtitle="미션 완료 즉시 지급"
                />
              ) : null}
            </div>

            {mission.max_completions && (
              <p className="text-[length:var(--text-caption)] text-text-secondary">
                {t(d.missions.limitedSlots, { count: mission.max_completions.toLocaleString() })}
              </p>
            )}
          </InfoCard>
        )}

        {/* 미션 상황 보기 — 참가자만 */}
        {(participating || isCompleted) && (
          <Link href={`/missions/${mission.id}/status`}>
            <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-4 text-center text-[length:var(--text-body-sm)] text-text-secondary active:scale-[0.98] transition-transform duration-100">
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
            className="w-full min-h-[56px] rounded-[var(--radius-pill)] text-[16px] font-bold leading-[1.5] cursor-default"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)' }}
          >
            종료
          </button>
        ) : participating ? (
          /* 참가 중 (disabled) */
          <button
            disabled
            className="w-full min-h-[56px] rounded-[var(--radius-pill)] text-[16px] font-bold leading-[1.5] cursor-default"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)' }}
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
              <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6">
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-secondary text-center mb-4">
                  {d.missions.joinConfirmBody}
                </p>
                <div className="flex gap-2">
                  {/* 20260816_012: 부모가 이미 bg-surface-elevated라 outline 기본 채움과 겹침 — 살짝 더 밝은 톤으로 오버라이드 */}
                  <Button
                    fullWidth
                    variant="outline"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                    onClick={() => setConfirming(false)}
                    disabled={loading}
                  >
                    {d.drops.cancel}
                  </Button>
                  <Button fullWidth loading={loading} onClick={handleJoin}>
                    {d.missions.joinConfirmButton}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setConfirming(true)}
                className="w-full min-h-[56px] rounded-[var(--radius-pill)] text-[16px] font-bold leading-[1.5] cursor-pointer active:scale-95 transition-transform duration-100"
                style={{ background: '#fff', color: '#000' }}
              >
                참가하기
              </button>
              <p className="text-[length:var(--text-caption)] text-text-secondary text-center">{d.missions.joinNote}</p>
            </div>
          )
        ) : null}

      </div>
    </div>
  )
}
