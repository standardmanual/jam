'use client'

import { useRouter } from 'next/navigation'
import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import { UnlockConditionSheetContent } from '@ds/components/patterns/UnlockConditionSheetContent'
import { d } from '@/lib/i18n'
import type { BadgeTreeLock } from '@/lib/badgeTree'
import type { BadgeRarity } from '@/types/database'

export interface BadgeUnlockSheetData {
  badgeName: string
  rarity: BadgeRarity
  imageUrl: string | null
  conditionMet: boolean
  requirements: BadgeTreeLock[]
}

export interface BadgeUnlockSheetProps {
  open: boolean
  onClose: () => void
  data: BadgeUnlockSheetData | null
}

/**
 * 잠금 해제 조건 시트 — 티켓 20260903_2329. `UnlockConditionSheetContent`(DS)를
 * **서비스 `src/components/ui/BottomSheet.tsx`** 위에 얹는다(§1.6 병존 구현 규칙 —
 * 실제 화면은 DS BottomSheet가 아니라 서비스 쪽을 쓴다).
 *
 * 미션 게이트일 때만 하단에 CTA 버튼("미션 하러 가기")을 sticky footer로 붙인다 —
 * 선행 배지 게이트는 각 요구사항 행 자체가 링크라 별도 CTA가 필요 없다(§04 "여는 지점은
 * 자물쇠 그 자체" — 한 화면에 자물쇠 버튼이 두 개가 되지 않게 한다).
 */
export default function BadgeUnlockSheet({ open, onClose, data }: BadgeUnlockSheetProps) {
  const router = useRouter()
  const missionRequirement = data?.requirements.length === 1 && data.requirements[0].kind === 'mission'
    ? data.requirements[0]
    : null

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
          imageUrl={data.imageUrl}
          conditionMet={data.conditionMet}
          requirements={data.requirements.map((req) => ({
            kind: req.kind,
            name: req.name,
            href: req.href,
            imageUrl: req.imageUrl,
          }))}
        />
      )}
    </BottomSheet>
  )
}
