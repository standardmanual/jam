'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import TopNav from '@/components/ui/TopNav'
import ListRowCard from '@/components/ui/ListRowCard'
import { UserIcon, UsersIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { WanderingEyesLoader } from '@ds/components/feedback/WanderingEyesLoader'

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
}

// ────────────────────────────────────────────────────────────────
// 포디엄 설정값 (1위, 2위, 3위) — 20260825 리뉴얼: 앱 전역의 유일한 강조색인
// --color-primary(레드) 하나로 통일. 1위만 강조, 2·3위는 중립톤으로 낮춰
// "강조색은 하나만 쓴다"는 다른 화면들의 원칙을 그대로 따른다.
// 폰트 크기는 모듈러 타이포 토큰 스케일(--text-h3:28 / --text-h4:24 /
// --text-caption:12 / --text-micro:11)에 맞춘 값이다.
// ────────────────────────────────────────────────────────────────
const PODIUM_CONFIG = [
  {
    rank: 1,
    barHeight: 130,
    // --color-primary(#e8461f)를 상단, 그 40% 알파 톤을 하단에 둔 세로 그라디언트.
    // 다른 화면의 rgba(232,70,31,…) 틴트 패턴(StatusChip 등)과 동일한 베이스 컬러.
    barGradient: 'linear-gradient(180deg, var(--color-primary), rgba(232,70,31,0.45))',
    avatarSize: 60,
    avatarBg: 'rgba(232,70,31,0.15)',
    avatarBorder: 'var(--color-primary)',
    barNumFontSize: 'var(--text-h3)', // 28px — 가장 가까운 토큰
    usernameFontSize: 'var(--text-caption)', // 12px
    usernameBold: true,
  },
  {
    rank: 2,
    barHeight: 90,
    barGradient: 'linear-gradient(180deg, rgba(232,70,31,0.55), rgba(232,70,31,0.25))',
    avatarSize: 48,
    avatarBg: 'var(--color-border)',
    avatarBorder: null,
    barNumFontSize: 'var(--text-h4)', // 24px
    usernameFontSize: 'var(--text-micro)', // 11px
    usernameBold: false,
  },
  {
    rank: 3,
    barHeight: 60,
    barGradient: 'linear-gradient(180deg, rgba(232,70,31,0.4), rgba(232,70,31,0.18))',
    avatarSize: 48,
    avatarBg: 'var(--color-border)',
    avatarBorder: null,
    barNumFontSize: 'var(--text-h4)',
    usernameFontSize: 'var(--text-micro)',
    usernameBold: false,
  },
] as const

type PodiumConfig = typeof PODIUM_CONFIG[number]

// ────────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────────
function formatProgress(value: number) {
  return value.toFixed(value % 1 === 0 ? 0 : 1)
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
  border: string | null
}) {
  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: bg,
    border: border ? `2px solid ${border}` : undefined,
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

      {/* 포디엄 바 — 순위 번호·진행값을 바 하단에 함께 배치 */}
      <div style={{
        width: '100%',
        height: cfg.barHeight,
        background: cfg.barGradient,
        borderRadius: '10px 10px 0 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 5,
      }}>
        {entry && (
          <>
            <span style={{ fontSize: cfg.barNumFontSize, fontWeight: 'bold', color: '#fff' }}>
              {cfg.rank}
            </span>
            <span style={{ fontSize: 'var(--text-caption)', fontWeight: 'bold', color: '#fff' }}>
              {formatProgress(entry.progressValue)}
            </span>
          </>
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
  // 내 순위 행만 h4 토큰(24px)으로 확대 강조, 그 외에는 small 토큰(14px) 그대로
  const emphasisFontSize = isMe ? 'var(--text-h4)' : 'var(--text-small)'

  return (
    <ListRowCard
      href={`/${entry.username}`}
      icon={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 순위 번호 — 내 순위는 --color-primary(레드)로 강조 */}
          <span style={{
            fontSize: emphasisFontSize,
            fontWeight: 'bold',
            color: isMe ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            width: 20,
            textAlign: 'center',
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
          }}>
            {entry.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entry.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <UserIcon className="w-[18px] h-[18px] text-[#666]" />
            )}
          </div>
        </div>
      }
      trailing={
        <span style={{ fontSize: emphasisFontSize, fontWeight: 'bold', color: isMe ? 'var(--color-primary)' : 'var(--color-text)' }}>
          {formatProgress(entry.progressValue)}
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        <p
          className="m-0 truncate"
          style={{ fontSize: 'var(--text-small)', fontWeight: isMe ? 'bold' : 'normal', color: 'var(--color-text)' }}
        >
          {entry.username}
        </p>
        {/* 강조색은 --color-primary 하나로 통일(랭킹별 그라디언트 제거) */}
        {/* [20260820_006] scaleX 인라인 마크업 → ProgressBar(radius override)로 전환 */}
        <ProgressBar
          percent={fillRatio * 100}
          labelType="none"
          height={6}
          color="var(--color-primary)"
          trackColor="var(--color-border)"
          radius="3px"
        />
      </div>
    </ListRowCard>
  )
}

/**
 * 나의 순위 카드 — 20260825 리뉴얼: 목록에 항상 중복 노출하던 것에서,
 * 내 순위가 공개 목록(visible_rank_count) 밖일 때만 예외적으로 보여주는 방식으로 변경.
 * 목록 안에 있을 때는 RankingListRow의 isMe 강조만으로 충분하다.
 * 색상은 MissionDetailClient의 "참가중" 칩과 동일한 레드 틴트 어휘(rgba(232,70,31,…))를 재사용.
 */
function MyRankCard({
  me,
  maxProgress,
}: {
  me: RankingEntry
  maxProgress: number
}) {
  const fillRatio = maxProgress > 0 ? Math.min(1, me.progressValue / maxProgress) : 0

  return (
    <div style={{
      backgroundColor: 'rgba(232,70,31,0.12)',
      borderRadius: 'var(--radius-card)',
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 'var(--text-h4)',
          fontWeight: 'bold',
          color: 'var(--color-primary)',
          width: 20,
          textAlign: 'center',
          flexShrink: 0,
        }}>
          {me.rank}
        </span>

        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          backgroundColor: 'rgba(232,70,31,0.2)',
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
            <UserIcon className="w-[18px] h-[18px]" style={{ color: 'var(--color-primary)' }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 'var(--text-small)',
            fontWeight: 'bold',
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {me.username}
          </div>
          <div style={{ fontSize: 'var(--text-micro)', color: 'var(--color-text-secondary)', marginTop: 1 }}>
            {formatProgress(me.progressValue)} {d.missions.achieved}
          </div>
        </div>

        <span style={{
          fontSize: 'var(--text-h4)',
          fontWeight: 'bold',
          color: 'var(--color-primary)',
          flexShrink: 0,
        }}>
          {formatProgress(me.progressValue)}
        </span>
      </div>

      <div style={{ paddingLeft: 28, paddingTop: 8 }}>
        <ProgressBar
          percent={fillRatio * 100}
          labelType="none"
          height={6}
          color="var(--color-primary)"
          trackColor="rgba(232,70,31,0.2)"
          radius="3px"
        />
      </div>
    </div>
  )
}

/** 달성형 행 */
/**
 * 달성형 행 — 20260825 리뉴얼: 랭킹형 `RankingListRow`와 같은 어휘(ListRowCard, 다크 아바타,
 * 내 행만 레드 강조)로 통일. 흰 카드(Card tone="inverse")는 더 이상 쓰지 않는다.
 */
function AchievementRow({ e, highlight }: { e: AchievementEntry; highlight: boolean }) {
  return (
    <ListRowCard
      href={`/${e.username}`}
      // 프로그래스바가 없어 한 줄짜리 행이라 기본 p-16(위아래 32px 간격)은 헐렁해 보인다 —
      // 위아래 패딩만 좁혀 목록 간격을 줄인다.
      className="!py-[var(--spacing-8)]"
      icon={<SimpleAvatar url={e.avatarUrl} />}
      trailing={
        e.achieved ? (
          <span className="text-[length:var(--text-micro)] leading-none px-2 py-1 rounded-[var(--radius-tags)] bg-white/10 text-text">
            {d.missions.achieved}
          </span>
        ) : (
          <span className="text-[length:var(--text-micro)] leading-none px-2 py-1 rounded-[var(--radius-tags)] bg-border text-text-secondary">
            {d.missions.notAchieved}
          </span>
        )
      }
    >
      <p
        className="text-[length:var(--text-small)] leading-[var(--leading-body-sm)] truncate"
        style={{ color: highlight ? 'var(--color-primary)' : 'var(--color-text)', fontWeight: highlight ? 'bold' : 'normal' }}
      >
        {e.username}{highlight ? d.missions.statusMeSuffix : ''}
      </p>
    </ListRowCard>
  )
}

/** 소형 아바타 (달성형·개인형용) — 랭킹형 RankingListRow 아바타와 동일한 다크 톤 */
function SimpleAvatar({ url }: { url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
  }
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--color-border)' }}>
      <UserIcon className="w-[18px] h-[18px] text-[#666]" />
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

      {/* 로딩 — 다른 화면(배지 획득 연출·공유 카드 등)과 동일한 눈모양 로더.
          라우트 전환 시 뜨는 전체화면 NavigationLoader(화면 정중앙)와 위치가 어긋나 보이지 않도록,
          TopNav(56px)를 제외한 나머지 영역 정중앙에 배치한다. */}
      {loading && (
        <div className="min-h-[calc(100dvh-56px)] flex items-center justify-center">
          <WanderingEyesLoader />
        </div>
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
        // 내 순위가 공개 목록(entries, visible_rank_count로 잘릴 수 있음) 안에 이미 있으면
        // RankingListRow의 isMe 강조로 충분하다 — 목록 밖일 때만 MyRankCard를 따로 보여준다.
        const meOutsideList = me !== null && !entries.some(e => e.userId === me.userId)

        return (
          <div className="flex flex-col gap-[var(--spacing-16)] px-[var(--spacing-16)] pt-0 pb-[var(--spacing-32)]">
            {/* TOP 3 포디엄 — InfoCard(bg-surface-elevated, radius-cards, p-6)로 다른 화면과 동일하게 카드화.
                3명 미만이면 빈 슬롯 "—" 처리 */}
            {entries.length > 0 && (
              <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6">
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  {top3.map(({ cfg, entry }) => (
                    <PodiumColumn key={cfg.rank} cfg={cfg} entry={entry} />
                  ))}
                </div>
              </div>
            )}

            {/* 전체 순위 목록 (4위~) — InfoCard + 섹션 라벨(다른 화면의 SectionLabel과 동일 톤) */}
            {rest.length > 0 && (
              <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="m-0 text-[15px] font-bold text-text">{d.missions.statusAllRanks}</p>
                  <span className="text-[length:var(--text-caption)] text-text-secondary">
                    {t(d.missions.statusParticipants, { count: data.totalParticipants })}
                  </span>
                </div>

                {rest.map(entry => (
                  <RankingListRow
                    key={entry.userId}
                    entry={entry}
                    maxProgress={maxProgress}
                    isMe={isMeInEntries(entry.userId)}
                  />
                ))}
              </div>
            )}

            {/* 나의 순위 카드 — 목록 밖일 때만 예외적으로 노출 */}
            {meOutsideList && me && (
              <MyRankCard me={me} maxProgress={maxProgress} />
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

      {/* ── 달성형 타입 — 랭킹형과 동일하게 InfoCard(bg-surface-elevated / radius-cards / p-6)로
           섹션을 감싸고, 섹션 라벨 옆에 참가자 수를 병기한다 ── */}
      {data?.type === 'achievement' && (
        <div className="flex flex-col gap-[var(--spacing-16)] px-[var(--spacing-16)] pt-0 pb-[var(--spacing-32)]">
          {data.entries.length > 0 && (
            <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6">
              <div className="flex items-baseline justify-between mb-2">
                <p className="m-0 text-[15px] font-bold text-text">{d.missions.statusAchievementLabel}</p>
                <span className="text-[length:var(--text-caption)] text-text-secondary">
                  {t(d.missions.statusParticipants, { count: data.totalParticipants })}
                </span>
              </div>
              <div>
                {data.entries.map(e => (
                  <AchievementRow key={e.userId} e={e} highlight={isMeInEntries(e.userId)} />
                ))}
                {data.me && !data.entries.some(e => e.userId === data.me!.userId) && (
                  <>
                    <p className="text-[length:var(--text-micro)] text-text-secondary text-center my-1">{d.missions.statusMeAchievement}</p>
                    <AchievementRow e={data.me} highlight />
                  </>
                )}
              </div>
            </div>
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

      {/* ── 개인형 타입 — 동일한 InfoCard 섹션 어휘. 참가자 수가 없어 라벨만 노출 ── */}
      {data?.type === 'individual' && (
        <div className="px-[var(--spacing-16)] pt-0 pb-[var(--spacing-32)]">
          <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6">
            <p className="m-0 mb-[var(--spacing-16)] text-[15px] font-bold text-text">{d.missions.statusIndividualLabel}</p>
            <div className="flex items-center justify-between">
              <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-secondary">
                {d.missions.myProgressTitle}
              </span>
              {data.me.achieved ? (
                <span className="text-[14px] font-bold px-3 py-1 rounded-[var(--radius-pill)] bg-white/10 text-text shrink-0">
                  {d.missions.achieved}
                </span>
              ) : (
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text shrink-0">
                  {data.me.progressValue.toFixed(data.me.progressValue % 1 === 0 ? 0 : 1)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
