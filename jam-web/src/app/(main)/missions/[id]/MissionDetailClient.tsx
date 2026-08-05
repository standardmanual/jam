'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/ui/toast'
import Card from '@/components/ui/card'
import Button from '@/components/ui/button'
import TopNav from '@/components/ui/topnav'
import type { MissionRow, MissionCondition } from '@/types/database'
import { useTextSwap, useRevealOnMount } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'

export interface RewardBadgeInfo {
  id: string
  name: string
  image_url: string | null
}

interface Props {
  mission: MissionRow
  isParticipating: boolean
  isCompleted: boolean
  progressValue: number
  rewardBadges: RewardBadgeInfo[]
}

function missionGoalText(type: string, condition: MissionCondition): { label: string; unit: string; target: number } {
  switch (type) {
    case 'distance':
      return { label: d.missions.goalDistance, unit: 'km', target: condition.distance_km ?? 0 }
    case 'activity_count':
      return { label: d.missions.goalActivityCount, unit: '회', target: condition.count ?? 0 }
    case 'poi_visit':
      return { label: d.missions.goalPoiVisit, unit: '곳', target: 1 }
    case 'item_collect':
      return { label: d.missions.goalItemCollect, unit: '개', target: 1 }
    default:
      return { label: d.missions.goalDefault, unit: '', target: 0 }
  }
}

function timeLeft(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return d.missions.tagEnded
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간 ${d.missions.timeLeftSuffix}`
  return `${h}시간 ${m}분 ${d.missions.timeLeftSuffix}`
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] leading-none px-2 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border)]">
      {children}
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
  const isActive = new Date(mission.starts_at) <= new Date() && new Date(mission.ends_at) > new Date()
  // 달성형(poi_visit/item_collect) — 진행 바 대신 달성/미달성 배지로 표시
  const isAchievementType = mission.mission_type === 'poi_visit' || mission.mission_type === 'item_collect'
  const achieved = isCompleted || progressValue >= 1

  // 달성/미달성 배지 텍스트 — 즉시 전환 대신 Text states swap (04)
  const achievedLabel = achieved ? d.missions.achieved : d.missions.notAchieved
  const { ref: achievedRef, initialText: initialAchievedLabel } = useTextSwap<HTMLSpanElement>(achievedLabel)
  // 참가 확인 카드 — Panel reveal (07). 마운트 다음 프레임에 data-open을 뒤집는다.
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
      <TopNav title={d.missions.backToList} backHref="/missions" />

      <div className="flex flex-col px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-32)]">
        {/* 상태 태그 */}
        <div className="flex items-center gap-2 mb-[var(--spacing-16)] flex-wrap">
          {isCompleted && <Tag>{d.missions.tagDone}</Tag>}
          {!isCompleted && participating && <Tag>{d.missions.tagJoined}</Tag>}
          {!isActive && !isCompleted && <Tag>{d.missions.tagUpcoming}</Tag>}
          <span className="text-[11px] text-text/50">{timeLeft(mission.ends_at)}</span>
        </div>

        <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] mb-2">{mission.title}</h1>
        {mission.description && (
          <p className="text-text/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] mb-[var(--spacing-24)]">{mission.description}</p>
        )}

        {/* 달성 조건 */}
        <Card className="mb-[var(--spacing-16)]">
          <p className="text-[10px] uppercase text-text-inverse/50 mb-[var(--spacing-16)]">{d.missions.conditionTitle}</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] text-text-inverse/50 mb-0.5">{goal.label}</p>
              <p className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)]">
                {goal.target}{goal.unit}
              </p>
            </div>
            {condition.activity_type && (
              <span className="text-[11px] capitalize px-2 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)]">
                {condition.activity_type}
              </span>
            )}
          </div>
        </Card>

        {/* 진행 상황 */}
        {(participating || isCompleted) && goal.target > 0 && (
          isAchievementType ? (
            <Card className="mb-[var(--spacing-16)]">
              <p className="text-[10px] uppercase text-text-inverse/50 mb-[var(--spacing-16)]">{d.missions.myProgressTitle}</p>
              <div className="flex items-center justify-between">
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{goal.label}</p>
                {/* 달성/미달성은 하나의 배지를 유지한 채 텍스트만 스왑한다(04) */}
                <span
                  className={`text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] px-[var(--spacing-16)] py-1.5 rounded-[var(--radius-nav-buttons)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] transition-colors${achieved ? '' : ' text-text-inverse/40'}`}
                >
                  <span ref={achievedRef} className="t-text-swap">{initialAchievedLabel}</span>
                </span>
              </div>
            </Card>
          ) : (
            <Card className="mb-[var(--spacing-16)]">
              <p className="text-[10px] uppercase text-text-inverse/50 mb-[var(--spacing-16)]">{d.missions.myProgressTitle}</p>
              <div className="flex items-end justify-between mb-2">
                <p className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)]">
                  {isCompleted ? goal.target : progressValue.toFixed(mission.mission_type === 'distance' ? 1 : 0)}
                  <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50 ml-1">{goal.unit}</span>
                </p>
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50">/ {goal.target}{goal.unit}</p>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border-inverse)]">
                <div className="h-full bg-text-inverse rounded-full transition-all" style={{ width: `${isCompleted ? 100 : progressPct}%` }} />
              </div>
              <p className="text-[11px] text-text-inverse/50 mt-1 text-right">
                {isCompleted ? d.missions.progressDone : t(d.missions.progressPct, { pct: Math.round(progressPct) })}
              </p>
            </Card>
          )
        )}

        {/* 보상 */}
        <Card className="mb-[var(--spacing-24)]">
          <p className="text-[10px] uppercase text-text-inverse/50 mb-2">{d.missions.rewardSectionTitle}</p>
          {rewardBadges.length === 0 && !mission.reward_points ? (
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/40">{d.missions.rewardNone}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {rewardBadges.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {rewardBadges.map((b) => (
                    <span key={b.id} className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)]">
                      {b.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.image_url} alt="" className="w-4 h-4 object-contain" />
                      )}
                      {b.name}
                    </span>
                  ))}
                </div>
              )}
              {mission.reward_points ? (
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{t(d.missions.rewardPointsLine, { points: mission.reward_points })}</p>
              ) : null}
            </div>
          )}
          {mission.max_completions && (
            <p className="text-[11px] text-text-inverse/50 mt-1">{t(d.missions.limitedSlots, { count: mission.max_completions.toLocaleString() })}</p>
          )}
        </Card>

        {/* 미션 상황 — 참가자만 노출 */}
        {(participating || isCompleted) && (
          <Link href={`/missions/${mission.id}/status`} className="mb-[var(--spacing-16)]">
            <Card className="text-center active:scale-[0.98] transition-transform duration-100">
              {d.missions.statusViewButton}
            </Card>
          </Link>
        )}

        {/* 참가 버튼 — 참가 취소는 불가(Phase13). 네이티브 confirm() 대신 인앱 확인 UI 사용
            (모바일/PWA에서 연속 confirm() 호출이 브라우저에 의해 조용히 차단되는 문제 회피) */}
        {isActive && !isCompleted && !participating && (
          confirming ? (
            /* 참가 확인 카드 — Panel reveal (07). 카드 높이의 절반 정도만 이동해도
               블러 + 페이드가 함께 걸려 완전한 열림으로 읽힌다. */
            <div
              ref={confirmPanelRef}
              className="t-panel-slide"
              data-open="false"
              style={{ ['--panel-translate-y' as string]: '32px' }}
            >
              <Card>
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center mb-[var(--spacing-16)]">{d.missions.joinConfirmBody}</p>
                <div className="flex gap-2">
                  <Button fullWidth variant="outline" surface="sub" onClick={() => setConfirming(false)} disabled={loading}>
                    {d.drops.cancel}
                  </Button>
                  <Button fullWidth surface="sub" loading={loading} onClick={handleJoin}>
                    {d.missions.joinConfirmButton}
                  </Button>
                </div>
              </Card>
            </div>
          ) : (
            <>
              <Button fullWidth onClick={() => setConfirming(true)}>
                {d.missions.joinButton}
              </Button>
              <p className="text-[11px] text-text/50 text-center mt-2">{d.missions.joinNote}</p>
            </>
          )
        )}

        {isCompleted && (
          <Card className="text-center">
            {d.missions.completedBanner}
          </Card>
        )}
      </div>
    </div>
  )
}
