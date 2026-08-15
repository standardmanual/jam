'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import TopNav from '@/components/ui/TopNav'
import type { MissionRow, MissionCondition, BadgeRarity } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { useRevealOnMount } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'

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
}

const RARITY_META: Record<BadgeRarity, { bg: string; text: string; label: string }> = {
  common: { bg: 'var(--color-rarity-common)', text: '#fff',  label: 'COMMON' },
  rare:   { bg: 'var(--color-rarity-rare)',   text: '#000',  label: 'RARE' },
  legend: { bg: 'var(--color-rarity-legend)', text: '#000',  label: 'LEGEND' },
  mythic: { bg: 'var(--color-rarity-mythic)', text: '#fff',  label: 'MYTHIC' },
}

function missionGoalText(type: string, condition: MissionCondition): { label: string; unit: string; target: number } {
  switch (type) {
    case 'distance':          return { label: d.missions.goalDistance,        unit: 'km', target: condition.distance_km ?? 0 }
    case 'activity_count':    return { label: d.missions.goalActivityCount,    unit: '회', target: condition.count ?? 0 }
    case 'poi_visit':         return { label: d.missions.goalPoiVisit,         unit: '곳', target: 1 }
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

/* ── 섹션 레이블 (11px uppercase) ── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-text-secondary leading-none">
      {children}
    </p>
  )
}

/* ── 다크 인포 카드 ── */
function InfoCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-[var(--radius-cards)] p-6 flex flex-col gap-4 ${className}`}>
      {children}
    </div>
  )
}

/* ── 미션 상태 칩 ── */
function StatusChip({ isCompleted, participating }: { isCompleted: boolean; participating: boolean }) {
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

/* ── 희귀도 칩 ── */
function RarityChip({ rarity }: { rarity: BadgeRarity }) {
  const meta = RARITY_META[rarity]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-[var(--radius-pill)] text-[11px] font-bold tracking-[0.04em] uppercase leading-none"
      style={{ background: meta.bg, color: meta.text }}
    >
      {meta.label}
    </span>
  )
}

export default function MissionDetailClient({ mission, isParticipating, isCompleted, progressValue, rewardBadges }: Props) {
  const [participating, setParticipating] = useState(isParticipating)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const condition = mission.condition_json as MissionCondition
  const goal = missionGoalText(mission.mission_type, condition)
  const progressPct = goal.target > 0 ? Math.min(100, (progressValue / goal.target) * 100) : 0
  const isActive = new Date(mission.starts_at) <= new Date() && (mission.ends_at === null || new Date(mission.ends_at) > new Date())
  const isAchievementType = mission.mission_type === 'poi_visit' || mission.mission_type === 'item_collect'
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
    <div className="min-h-full bg-[var(--color-bg)] text-text">
      <TopNav title={d.missions.backToDetail} backHref="/missions" />

      <div className="flex flex-col px-6 pt-8 pb-10 gap-6">

        {/* 히어로 이미지 — 1:1 정사각형 */}
        <div className="relative w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden bg-surface border border-border flex items-center justify-center">
          {mission.image_url ? (
            <Image
              src={mission.image_url}
              alt={`${mission.title} 썸네일`}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 640px"
              priority
            />
          ) : (
            <span className="text-[length:var(--text-body-sm)] text-text-secondary">이미지 영역</span>
          )}
        </div>

        {/* 히어로 섹션 */}
        <div className="flex flex-col items-center gap-4">
          {/* 미션 상태 칩 */}
          <StatusChip isCompleted={isCompleted} participating={participating} />

          {/* 제목 + 설명 */}
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] text-text text-balance">
              {mission.title}
            </h1>
            {mission.description && (
              <p className="text-[15px] leading-[1.47] text-text-secondary">{mission.description}</p>
            )}
          </div>

          {/* 기간 표시 — 참가 전에만 */}
          {!isCompleted && !participating && (
            <span className="text-[length:var(--text-caption)] text-text-secondary">
              {timeLeft(mission.ends_at)}
            </span>
          )}
        </div>

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
                <span className={`text-[14px] font-bold px-3 py-1 rounded-[var(--radius-pill)] border border-border ${achieved ? 'text-text' : 'text-text-secondary'}`}>
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
                <div className="h-2 rounded-[var(--radius-pill)] overflow-hidden bg-border">
                  <div
                    className="h-full rounded-[var(--radius-pill)] transition-all duration-[400ms]"
                    style={{ width: `${isCompleted ? 100 : progressPct}%`, background: 'var(--color-primary)' }}
                  />
                </div>
                <div className="flex gap-1.5 pt-1 flex-wrap">
                  {Array.from({ length: goal.target }).map((_, i) => {
                    const done  = i < (isCompleted ? goal.target : Math.floor(progressValue))
                    const today = !done && i === Math.floor(progressValue) && !isCompleted
                    return (
                      <div
                        key={i}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 border"
                        style={{
                          background:  done  ? 'var(--color-primary)' : 'transparent',
                          borderColor: done  ? 'var(--color-primary)' : today ? 'var(--color-primary)' : 'var(--color-border)',
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
                  <span className="text-[14px] leading-[1.43] text-text-secondary">
                    {isCompleted ? goal.target : (mission.mission_type === 'distance' ? progressValue.toFixed(1) : Math.floor(progressValue))}{goal.unit} / {goal.target}{goal.unit}
                  </span>
                  <span className="text-[14px] font-bold text-text tabular-nums">
                    {isCompleted ? '100' : Math.round(progressPct)}%
                  </span>
                </div>
                <div className="h-2 rounded-[var(--radius-pill)] overflow-hidden bg-border">
                  <div
                    className="h-full rounded-[var(--radius-pill)] transition-all duration-[400ms]"
                    style={{ width: `${isCompleted ? 100 : progressPct}%`, background: 'var(--color-primary)' }}
                  />
                </div>
              </div>
            )}
          </InfoCard>
        )}

        {/* ── 보상 카드 ── */}
        {(rewardBadges.length > 0 || mission.reward_points) && (
          <InfoCard>
            <SectionLabel>{d.missions.rewardSectionTitle}</SectionLabel>

            <div className="flex flex-col">
              {rewardBadges.map((badge, idx) => (
                <div key={badge.id}>
                  {idx > 0 && <div className="h-px bg-border my-4" />}
                  {/* 배지 보상 행: BadgeFrame(circle) + RarityBadge + 텍스트 */}
                  <div className="flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      {badge.image_url ? (
                        <Image src={badge.image_url} alt={badge.name} width={40} height={40} className="w-8 h-8 object-contain" />
                      ) : (
                        <span className="text-2xl">🏅</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <RarityChip rarity={badge.rarity} />
                      <p className="text-[16px] font-bold leading-[1.2] text-text truncate">{badge.name}</p>
                      <p className="text-[13px] leading-[1.3] text-text-secondary">미션 완료 시 획득</p>
                    </div>
                  </div>
                </div>
              ))}

              {/* 포인트 보상 행: 이미지 없음 — 텍스트만 */}
              {mission.reward_points ? (
                <div>
                  {rewardBadges.length > 0 && <div className="h-px bg-border my-4" />}
                  <div className="flex flex-col gap-1">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-[var(--radius-pill)] text-[11px] font-bold tracking-[0.04em] uppercase leading-none w-fit"
                      style={{ background: 'rgba(255,255,255,0.10)', color: 'var(--color-text-secondary)' }}
                    >
                      POINT
                    </span>
                    <p className="text-[16px] font-bold leading-[1.2] text-text">
                      {t(d.missions.rewardPointsLine, { points: mission.reward_points })}
                    </p>
                    <p className="text-[13px] leading-[1.3] text-text-secondary">미션 완료 즉시 지급</p>
                  </div>
                </div>
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
            <div className="bg-surface border border-border rounded-[var(--radius-cards)] p-4 text-center text-[length:var(--text-body-sm)] text-text-secondary active:scale-[0.98] transition-transform duration-100">
              {d.missions.statusViewButton}
            </div>
          </Link>
        )}

        {/* ── CTA 버튼 ── */}
        {isCompleted ? (
          /* 완료 → 종료 (disabled) */
          <button
            disabled
            className="w-full min-h-[56px] rounded-[var(--radius-pill)] text-[16px] font-bold leading-[1.5] cursor-default"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
          >
            종료
          </button>
        ) : participating ? (
          /* 참가 중 (disabled) */
          <button
            disabled
            className="w-full min-h-[56px] rounded-[var(--radius-pill)] text-[16px] font-bold leading-[1.5] cursor-default"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
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
              <div className="bg-surface border border-border rounded-[var(--radius-cards)] p-6">
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-secondary text-center mb-4">
                  {d.missions.joinConfirmBody}
                </p>
                <div className="flex gap-2">
                  <Button fullWidth variant="outline" onClick={() => setConfirming(false)} disabled={loading}>
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
