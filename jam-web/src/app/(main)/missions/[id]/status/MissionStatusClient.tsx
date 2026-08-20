'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import TopNav from '@/components/ui/TopNav'
import { Card } from '@ds/components/cards/Card'
import { UserIcon, UsersIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { EmptyState } from '@ds/components/feedback/EmptyState'

interface RankingEntry {
  userId: string
  username: string
  avatarUrl: string | null
  progressValue: number
  isCompleted: boolean
  completedAt: string | null
  rank: number
}

interface AchievementEntry {
  userId: string
  username: string
  avatarUrl: string | null
  achieved: boolean
  achievedAt: string | null
}

interface IndividualStatus {
  progressValue: number
  achieved: boolean
  achievedAt: string | null
}

type StatusResponse =
  | { type: 'ranking'; entries: RankingEntry[]; me: RankingEntry | null; totalParticipants: number }
  | { type: 'achievement'; entries: AchievementEntry[]; me: AchievementEntry | null; totalParticipants: number }
  | { type: 'individual'; me: IndividualStatus }

interface Props {
  missionId: string
  missionTitle: string
  displayType: string
  goalLabel?: string
}

// ────────────────────────────────────────────────────────────────
// 포디엄 설정값 (1위, 2위, 3위) — Figma 스펙 06_미션 상황 기준
// ────────────────────────────────────────────────────────────────
const PODIUM_CONFIG = [
  {
    rank: 1,
    barHeight: 130,
    barBg: '#0D3320',
    barBorder: '#56C985',
    avatarSize: 60,
    avatarBg: '#0D2A1A',
    avatarBorder: '#56C985',
    rankColor: '#56C985',
    rankFontSize: 22,
    valueColor: '#56C985',
    barNumFontSize: 26,
    barNumColor: '#FFF',
    usernameFontSize: 12,
    usernameBold: true,
    progressFontSize: 10,
  },
  {
    rank: 2,
    barHeight: 90,
    barBg: '#1A3A2A',
    barBorder: '#4CAF7D',
    avatarSize: 48,
    avatarBg: '#2A3A2A',
    avatarBorder: '#4CAF7D',
    rankColor: '#4CAF7D',
    rankFontSize: 18,
    valueColor: '#4CAF7D',
    barNumFontSize: 20,
    barNumColor: '#A8E6C3',
    usernameFontSize: 11,
    usernameBold: false,
    progressFontSize: 10,
  },
  {
    rank: 3,
    barHeight: 60,
    barBg: '#1E2E1E',
    barBorder: '#5A7A5A',
    avatarSize: 48,
    avatarBg: '#2A2E2A',
    avatarBorder: '#5A7A5A',
    rankColor: '#8AAA8A',
    rankFontSize: 18,
    valueColor: '#8AAA8A',
    barNumFontSize: 20,
    barNumColor: '#8AAA8A',
    usernameFontSize: 11,
    usernameBold: false,
    progressFontSize: 10,
  },
] as const

type PodiumConfig = typeof PODIUM_CONFIG[number]

// ────────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────────
function formatProgress(value: number) {
  return value.toFixed(value % 1 === 0 ? 0 : 1)
}

/** 순위 기반 프로그레스 바 그라디언트 — 상위일수록 밝은 그린, 최소 15% 밝기 유지 */
function getRankGradient(rank: number): string {
  // factor 최솟값 0.15 → 참가자가 많아도 시각 구분 유지
  const factor = Math.max(0.15, 1 - (rank - 4) * 0.05)
  const fromG = Math.round(0x59 + factor * (0xB2 - 0x59))
  const toG = Math.round(0x73 + factor * (0xD9 - 0x73))
  return `linear-gradient(90deg, rgb(0,${fromG},0), rgb(26,${toG},0))`
}

// ────────────────────────────────────────────────────────────────
// 서브 컴포넌트
// ────────────────────────────────────────────────────────────────

/** 포디엄 아바타 원 */
function PodiumAvatar({
  url,
  size,
  bg,
  border,
}: {
  url: string | null
  size: number
  bg: string
  border: string
}) {
  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: bg,
    border: `2px solid ${border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  }
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ ...baseStyle, objectFit: 'cover' }} />
  }
  const iconSize = Math.round(size * 0.4)
  return (
    <div style={baseStyle}>
      <UserIcon className="text-[#666]" style={{ width: iconSize, height: iconSize }} />
    </div>
  )
}

/** 포디엄 단일 열 (2위-1위-3위 순으로 렌더) */
function PodiumColumn({
  entry,
  cfg,
}: {
  entry: RankingEntry | undefined
  cfg: PodiumConfig
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 4 }}>
      {/* 포디엄 바 상단: 순위 번호 */}
      <span style={{
        fontSize: cfg.rankFontSize,
        fontWeight: 'bold',
        color: cfg.rankColor,
        lineHeight: 1,
      }}>
        {cfg.rank}
      </span>

      {/* 아바타 (원형) */}
      <PodiumAvatar
        url={entry?.avatarUrl ?? null}
        size={cfg.avatarSize}
        bg={cfg.avatarBg}
        border={cfg.avatarBorder}
      />

      {/* 유저명 */}
      <span style={{
        fontSize: cfg.usernameFontSize,
        fontWeight: cfg.usernameBold ? 'bold' : 'normal',
        color: '#FFF',
        textAlign: 'center',
        maxWidth: 80,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {entry ? entry.username : '—'}
      </span>

      {/* 진행값 텍스트 */}
      <span style={{
        fontSize: cfg.progressFontSize,
        fontWeight: 'bold',
        color: cfg.valueColor,
      }}>
        {entry ? formatProgress(entry.progressValue) : ''}
      </span>

      {/* 포디엄 바 */}
      <div style={{
        width: '100%',
        height: cfg.barHeight,
        backgroundColor: cfg.barBg,
        border: `1px solid ${cfg.barBorder}`,
        borderRadius: '10px 10px 0 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {entry && (
          <span style={{
            fontSize: cfg.barNumFontSize,
            fontWeight: 'bold',
            color: cfg.barNumColor,
          }}>
            {cfg.rank}
          </span>
        )}
      </div>
    </div>
  )
}

/** 4위~ 순위 행 */
function RankingListRow({
  entry,
  maxProgress,
  isMe,
}: {
  entry: RankingEntry
  maxProgress: number
  isMe: boolean
}) {
  const fillRatio = maxProgress > 0 ? Math.min(1, entry.progressValue / maxProgress) : 0
  const gradient = getRankGradient(entry.rank)

  return (
    <div>
      {/* 행 본문 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
        {/* 순위 번호: 14px bold, #B2B2B2, 20px 고정폭 */}
        <span style={{
          fontSize: 14,
          fontWeight: 'bold',
          color: isMe ? '#56C985' : '#B2B2B2',
          width: 20,
          textAlign: 'center',
          flexShrink: 0,
        }}>
          {entry.rank}
        </span>

        {/* 20260816_012: 아바타 보더 제거 — bg는 --color-border 토큰(#2a2a2a와 동일값) 재사용 */}
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          backgroundColor: 'var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {entry.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <UserIcon className="w-[18px] h-[18px] text-[#666]" />
          )}
        </div>

        {/* 유저명: 14px, #FFF, flex-grow */}
        <span style={{
          flex: 1,
          fontSize: 14,
          fontWeight: isMe ? 'bold' : 'normal',
          color: '#FFF',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {entry.username}
        </span>

        {/* 진행값: 14px bold, #FFF */}
        <span style={{
          fontSize: 14,
          fontWeight: 'bold',
          color: isMe ? '#56C985' : '#FFF',
          flexShrink: 0,
        }}>
          {formatProgress(entry.progressValue)}
        </span>
      </div>

      {/* 행 하단: 6px 프로그레스 바, padding-left 32px, 배경 --color-surface-elevated, border-radius 3px */}
      {/* [20260820_006] scaleX 인라인 마크업 → ProgressBar(radius override)로 전환 */}
      <div style={{ paddingLeft: 32, paddingRight: 16, paddingBottom: 8 }}>
        <ProgressBar
          percent={fillRatio * 100}
          labelType="none"
          height={6}
          color={gradient}
          trackColor="var(--color-surface-elevated)"
          radius="3px"
        />
      </div>
      {/* 20260816_012: hr 대체용 행 구분선 제거 — 행 간 padding만으로 구분 */}
    </div>
  )
}

/** 나의 순위 카드 (항상 하단 고정) — Figma 스펙: 목록 내 포함 여부 무관 중복 노출 */
function MyRankCard({
  me,
  maxProgress,
}: {
  me: RankingEntry
  maxProgress: number
}) {
  const fillRatio = maxProgress > 0 ? Math.min(1, me.progressValue / maxProgress) : 0

  return (
    // 20260816_012: 보더 제거 — "내 순위" 강조는 그린 틴트 배경만으로 충분히 구분됨
    <div style={{
      margin: '0 16px',
      backgroundColor: '#0D2A1A',
      borderRadius: 12,
      padding: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* 순위: 14px bold, #56C985 */}
        <span style={{
          fontSize: 14,
          fontWeight: 'bold',
          color: '#56C985',
          width: 20,
          textAlign: 'center',
          flexShrink: 0,
        }}>
          {me.rank}
        </span>

        {/* 아바타: 36px, bg #1A3A2A */}
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          backgroundColor: '#1A3A2A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <UserIcon className="w-[18px] h-[18px] text-[#56C985]" />
          )}
        </div>

        {/* 유저명 + 서브텍스트 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 유저명: 14px bold, #FFF */}
          <div style={{
            fontSize: 14,
            fontWeight: 'bold',
            color: '#FFF',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {me.username}
          </div>
          {/* 서브텍스트: "[진행값] 달성", 11px, #B2B2B2 */}
          <div style={{ fontSize: 11, color: '#B2B2B2', marginTop: 1 }}>
            {formatProgress(me.progressValue)} {d.missions.achieved}
          </div>
        </div>

        {/* 진행값: 14px bold, #56C985 */}
        <span style={{
          fontSize: 14,
          fontWeight: 'bold',
          color: '#56C985',
          flexShrink: 0,
        }}>
          {formatProgress(me.progressValue)}
        </span>
      </div>

      {/* 프로그레스 바: bg #1A3A2A, fill linear-gradient(90deg, #00CC66, #33E580) */}
      {/* [20260820_006] scaleX 인라인 마크업 → ProgressBar(radius override)로 전환 */}
      <div style={{ paddingLeft: 28, paddingTop: 6 }}>
        <ProgressBar
          percent={fillRatio * 100}
          labelType="none"
          height={6}
          color="linear-gradient(90deg, #00CC66, #33E580)"
          trackColor="#1A3A2A"
          radius="3px"
        />
      </div>
    </div>
  )
}

/** 달성형 행 */
function AchievementRow({ e, highlight }: { e: AchievementEntry; highlight: boolean }) {
  return (
    <Card tone="inverse" className={highlight ? '' : 'opacity-90'}>
      <div className="flex items-center gap-[var(--spacing-16)]">
        <SimpleAvatar url={e.avatarUrl} />
        <span className="flex-1 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">
          {e.username}{highlight ? d.missions.statusMeSuffix : ''}
        </span>
        {e.achieved ? (
          <span className="text-[10px] leading-none px-2 py-1 rounded-[var(--radius-tags)] bg-black/[0.06] shrink-0">
            {d.missions.achieved}
          </span>
        ) : (
          <span className="text-[10px] leading-none text-text-inverse/40 px-2 py-1 rounded-[var(--radius-tags)] bg-black/[0.04] shrink-0">
            {d.missions.notAchieved}
          </span>
        )}
      </div>
    </Card>
  )
}

/** 기존 소형 아바타 (달성형·개인형용) */
function SimpleAvatar({ url }: { url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
  }
  return (
    <div className="w-8 h-8 rounded-full bg-black/[0.04] flex items-center justify-center shrink-0">
      <UserIcon className="w-4 h-4 text-text-inverse/50" />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────────────────────
export default function MissionStatusClient({
  missionId,
  missionTitle: _missionTitle,
  displayType: _displayType,
  goalLabel,
}: Props) {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/missions/${missionId}/status`)
        const json = await res.json()
        if (!alive) return
        if (!res.ok) { setError(json.error ?? d.missions.statusLoadError); return }
        setData(json as StatusResponse)
      } catch {
        if (alive) setError(d.missions.statusLoadError)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [missionId])

  const isMeInEntries = (userId: string) =>
    data?.type !== 'individual' && data?.me?.userId === userId

  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.missions.backToDetail} />

      {/* 로딩 / 오류 */}
      {loading && (
        <p className="px-4 pt-0 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/50">
          {d.missions.statusLoading}
        </p>
      )}
      {error && (
        <p className="px-4 pt-0 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60">
          {error}
        </p>
      )}

      {/* ── 랭킹 타입 ── */}
      {data?.type === 'ranking' && (() => {
        const entries = data.entries
        const me = data.me
        const maxProgress = entries[0]?.progressValue ?? me?.progressValue ?? 1
        // 포디엄 배열: 2위(좌) - 1위(중앙, 최장바) - 3위(우)
        const top3 = [
          { cfg: PODIUM_CONFIG[1], entry: entries.find(e => e.rank === 2) },
          { cfg: PODIUM_CONFIG[0], entry: entries.find(e => e.rank === 1) },
          { cfg: PODIUM_CONFIG[2], entry: entries.find(e => e.rank === 3) },
        ]
        const rest = entries.filter(e => e.rank >= 4)

        return (
          <div>
            {/* 헤더 정보 바: 좌="랭킹 · 참가자 N명", 우="미션: [목표값]" */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0px 16px 8px',
            }}>
              <span style={{ fontSize: 13, color: '#B2B2B2' }}>
                {d.missions.statusRankingLabel} · {t(d.missions.statusParticipants, { count: data.totalParticipants })}
              </span>
              {goalLabel && (
                <span style={{ fontSize: 13, color: '#B2B2B2' }}>
                  {t(d.missions.statusMissionGoal, { goal: goalLabel })}
                </span>
              )}
            </div>

            {/* TOP 3 포디엄 — 3명 미만이면 빈 슬롯 "—" 처리 */}
            {entries.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                padding: '16px 16px 0',
                gap: 8,
              }}>
                {top3.map(({ cfg, entry }) => (
                  <PodiumColumn key={cfg.rank} cfg={cfg} entry={entry} />
                ))}
              </div>
            )}

            {/* 전체 순위 목록 (4위~) */}
            {rest.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {/* 섹션 헤더: "전체 순위" 13px #B2B2B2 (20260816_012: hr 대체용 구분선 제거 — 다른 섹션 라벨과 통일) */}
                <div style={{ padding: '0 16px 8px' }}>
                  <span style={{ fontSize: 13, color: '#B2B2B2' }}>{d.missions.statusAllRanks}</span>
                </div>

                <div style={{ paddingBottom: 8 }}>
                  {rest.map(entry => (
                    <RankingListRow
                      key={entry.userId}
                      entry={entry}
                      maxProgress={maxProgress}
                      isMe={isMeInEntries(entry.userId)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 나의 순위 카드 — 항상 하단 고정 */}
            {me && (
              <div style={{ padding: '16px 0 40px' }}>
                <MyRankCard me={me} maxProgress={maxProgress} />
              </div>
            )}

            {/* 빈 상태: entries.length === 0 && me === null */}
            {entries.length === 0 && !me && (
              <EmptyState
                icon={<UsersIcon className="w-8 h-8" />}
                title={d.missions.statusNoParticipants}
                description={d.missions.statusNoParticipantsBody}
              />
            )}
          </div>
        )
      })()}

      {/* ── 달성형 타입 ── */}
      {data?.type === 'achievement' && (
        <div className="px-[var(--spacing-16)] pt-0 pb-[var(--spacing-32)] flex flex-col gap-2">
          <p className="text-[11px] text-text/50 mb-2">
            {d.missions.statusAchievementLabel}
            {` · ${t(d.missions.statusParticipants, { count: data.totalParticipants })}`}
          </p>
          {data.entries.map(e => (
            <AchievementRow key={e.userId} e={e} highlight={isMeInEntries(e.userId)} />
          ))}
          {data.me && !data.entries.some(e => e.userId === data.me!.userId) && (
            <>
              <p className="text-[10px] text-text/40 text-center my-1">{d.missions.statusMeAchievement}</p>
              <AchievementRow e={data.me} highlight />
            </>
          )}
          {data.entries.length === 0 && !data.me && (
            <EmptyState
              icon={<UsersIcon className="w-8 h-8" />}
              title={d.missions.statusNoParticipants}
              description={d.missions.statusNoParticipantsBody}
            />
          )}
        </div>
      )}

      {/* ── 개인형 타입 ── */}
      {data?.type === 'individual' && (
        <div className="px-[var(--spacing-16)] pt-0 pb-[var(--spacing-32)]">
          <p className="text-[11px] text-text/50 mb-[var(--spacing-16)]">{d.missions.statusIndividualLabel}</p>
          <Card tone="inverse">
            <div className="flex items-center justify-between">
              <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">
                {d.missions.myProgressTitle}
              </span>
              {data.me.achieved ? (
                <span className="text-[10px] leading-none px-2 py-1 rounded-[var(--radius-tags)] bg-black/[0.06] shrink-0">
                  {d.missions.achieved}
                </span>
              ) : (
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/70 shrink-0">
                  {data.me.progressValue.toFixed(data.me.progressValue % 1 === 0 ? 0 : 1)}
                </span>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
