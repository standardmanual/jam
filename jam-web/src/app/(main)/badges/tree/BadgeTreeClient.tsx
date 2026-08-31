'use client'

import { useMemo, useState } from 'react'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import TopNav from '@/components/ui/TopNav'
import BadgeTreeCard from '@/components/badges/BadgeTreeCard'
import { MedalIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { d } from '@/lib/i18n'
import type { ActivityType } from '@/types/database'
import type { BadgeActivityTree } from '@/lib/badgeTree'

/**
 * 탭 바 전용 축약 라벨. `ACTIVITY_TYPE_LABELS`의 "트레일러닝"(5자)이 5탭 균등분할
 * (`SlidingTabs` block 모드) 폭에서 다른 2~3자 라벨들과 나란히 놓이면 좁은 화면에서
 * 넘친다(티켓 20260831_2208 후속 — 모바일 실기기 확인 결과). 다른 화면(select 옵션 등)의
 * 정식 명칭은 그대로 두고, 탭 표시에서만 축약한다.
 */
const TREE_TAB_LABELS: Partial<Record<ActivityType, string>> = {
  trail_running: '트레일',
}

/**
 * 배지 트리(/badges/tree) — 종목별 배지를 등급(획득 단계) 순으로 한 줄에 늘어놓는다.
 * 티켓 20260831_2208, 20260901 UI 수정(가족 단위 묶음·단계 라벨·구분선 제거, 등급 우선 정렬).
 *
 * 요구사항 8(횡스크롤 지양): 종목 전환 탭 1줄 외에는 전부 세로로만 쌓는다.
 * 데이터는 `page.tsx`(서버 컴포넌트)가 요청마다 Supabase에서 직접 조회해 넘긴다 —
 * 정적 스냅샷이 아니라 매 요청 최신 DB 상태를 반영한다.
 */
export interface BadgeTreeClientProps {
  trees: BadgeActivityTree[]
  /** 이 유저가 획득한 배지 id 집합(page.tsx가 user_activity_badges로 조회) — 티켓 20260831_2250 */
  earnedBadgeIds: string[]
}

export default function BadgeTreeClient({ trees, earnedBadgeIds }: BadgeTreeClientProps) {
  const [activeActivity, setActiveActivity] = useState<ActivityType>(
    trees[0]?.activityType ?? 'walking'
  )

  const earnedBadgeIdSet = useMemo(() => new Set(earnedBadgeIds), [earnedBadgeIds])

  const tabs: SlidingTabItem<ActivityType>[] = trees.map((tree) => ({
    key: tree.activityType,
    label: TREE_TAB_LABELS[tree.activityType] ?? ACTIVITY_TYPE_LABELS[tree.activityType] ?? tree.activityType,
    ariaLabel: ACTIVITY_TYPE_LABELS[tree.activityType] ?? tree.activityType,
  }))

  const activeTree = trees.find((tree) => tree.activityType === activeActivity) ?? trees[0]

  return (
    <div className="min-h-full bg-surface text-text">
      {/* TopNav title은 "어디로 돌아가는가"를 뜻하는 back-label (UX_WRITING_GUIDELINE.md §6) —
          /badges/tree는 /badges 타이틀 버튼으로만 진입하므로 목록 화면명("배지")을 쓴다. */}
      <TopNav
        title={d.badges.title}
        backHref="/badges"
        headerStyle={{ background: 'var(--color-surface)' }}
      />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)]">
        <h1 className="text-[length:var(--text-heading)] leading-[var(--leading-heading)]">
          {d.badges.treeButton}
        </h1>
      </div>

      {trees.length === 0 || !activeTree ? (
        <div className="px-[var(--spacing-16)] pt-[var(--spacing-32)]">
          <EmptyState
            icon={<MedalIcon className="w-8 h-8" />}
            title={d.badges.emptyActivityTitle}
            description={d.badges.emptyActivityBody}
          />
        </div>
      ) : (
        <>
          <div className="px-[var(--spacing-16)] py-[var(--spacing-16)]">
            <SlidingTabs
              items={tabs}
              value={activeActivity}
              onChange={setActiveActivity}
              outlined={false}
              aria-label={d.badges.treeButton}
            />
          </div>

          <div className="px-[var(--spacing-16)] pb-[var(--spacing-32)] flex flex-col gap-[var(--spacing-12)]">
            {activeTree.cards.map((card) => (
              <BadgeTreeCard key={card.id} card={card} earnedBadgeIds={earnedBadgeIdSet} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
