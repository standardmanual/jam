'use client'

import { useRouter } from 'next/navigation'
import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import { UnlockConditionSheetContent } from '@ds/components/patterns/UnlockConditionSheetContent'
import { d } from '@/lib/i18n'
import type { BadgeTreeGateGroup } from '@/lib/badgeTree'
import type { BadgeRarity } from '@/types/database'

export interface BadgeUnlockSheetData {
  badgeName: string
  rarity: BadgeRarity | null
  /** 무한레벨형만 — 등급 칩 대신 Lv.N 칩을 그린다 */
  level: number | null
  imageUrl: string | null
  conditionMet: boolean
  /** 그룹 안은 OR/AND, **그룹 사이는 AND** — 「미션 AND (배지 A OR 배지 B)」 */
  gateGroups: BadgeTreeGateGroup[]
}

export interface BadgeUnlockSheetProps {
  open: boolean
  onClose: () => void
  data: BadgeUnlockSheetData | null
}

/**
 * 잠금 해제 조건 시트 — 티켓 20260903_2329, 20260905_0037(다단계 게이트).
 * `UnlockConditionSheetContent`(DS)를 **서비스 `src/components/ui/BottomSheet.tsx`** 위에
 * 얹는다(§1.6 병존 구현 규칙 — 실제 화면은 DS BottomSheet가 아니라 서비스 쪽을 쓴다).
 *
 * 미션 게이트일 때만 하단에 CTA 버튼("미션 하러 가기")을 sticky footer로 붙인다 —
 * 선행 배지 게이트는 각 요구사항 행 자체가 링크라 별도 CTA가 필요 없다(§04 "여는 지점은
 * 자물쇠 그 자체" — 한 화면에 자물쇠 버튼이 두 개가 되지 않게 한다).
 * v5는 게이트가 여러 단일 수 있으므로 **아직 안 열린 미션 게이트가 정확히 하나일 때만**
 * CTA를 붙인다 — 여러 개면 어디로 보낼지 이 화면이 정할 수 없다.
 */
export default function BadgeUnlockSheet({ open, onClose, data }: BadgeUnlockSheetProps) {
  const router = useRouter()
  const pendingMissionLocks = (data?.gateGroups ?? [])
    .filter((g) => !g.fulfilled)
    .flatMap((g) => g.locks)
    .filter((l) => l.kind === 'mission' && !l.fulfilled)
  const missionRequirement = pendingMissionLocks.length === 1 ? pendingMissionLocks[0] : null

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      footer={
        missionRequirement ? (
          <Button fullWidth surface="main" onClick={() => router.push(missionRequirement.href)}>
            {d.badges.treeUnlockMissionCta}
          </Button>
        ) : undefined
      }
    >
      {data && (
        <UnlockConditionSheetContent
          badgeName={data.badgeName}
          rarity={data.rarity}
          level={data.level}
          imageUrl={data.imageUrl}
          conditionMet={data.conditionMet}
          // 평면 목록은 하위 호환용이라 비워 둔다 — 실제 표시는 groups가 담당한다.
          requirements={[]}
          groups={data.gateGroups.map((group) => ({
            relation: group.relation,
            met: group.fulfilled,
            note: group.note,
            title: group.title,
            requirements: group.locks.map((lock) => ({
              kind: lock.kind,
              name: lock.name,
              href: lock.href,
              imageUrl: lock.imageUrl,
              note: lock.note,
              met: lock.fulfilled,
            })),
          }))}
        />
      )}
    </BottomSheet>
  )
}
