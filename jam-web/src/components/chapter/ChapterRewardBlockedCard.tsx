'use client'

import { useId } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { d, t } from '@/lib/i18n'

/** 카드 모서리 반지름(`--radius-2xl` = 16px)과 같은 겹침량(px). 위로 겹치는 `-mt-4`(16px)와 같은 값이다 */
const OVERLAP_PX = 16
/** 겹친 영역 아래에서 안내까지의 간격(px), 안내 아래 간격(px), 좌우 간격(px) — 2026-11-05 사용자 지정 간격 */
const TOP_GAP_PX = 7
const BOTTOM_GAP_PX = 12
const SIDE_GAP_PX = 14

/**
 * 홈 막힘 안내 카드 — 챕터 게이지 카드 바로 아래에 이어 붙는다 (티켓 20261127_1735 C5b, 채원 사전 판정 2026-11-28, 사용자 결정 2026-11-28)
 *
 * 옛 `capsule/CapsuleBlockedCard`와 같은 구성(`Card inverse`, 두 줄 안내, 소형 `Button secondary`)을 챕터 게이지 카드 아래로 옮긴 것이다.
 * 새 시각 부품이 아니고 색·글자·모서리를 새로 정하지 않는다. 옛 카드는 프로필(C6)이 바뀔 때까지 남기고 D단계에서 지운다.
 *
 * 이어 붙임: 윗모서리는 각지게 하고 카드 모서리 반지름(16px)만큼 `-mt-4`로 위로 겹친다. 정본 카드는 위치 지정(relative)이라 z-index 없이
 * 이 카드 위에 그려지고, 겹친 만큼 윗쪽 안쪽 여백을 늘려 글자가 겹침 영역에 들어가지 않게 한다. 이 카드를 감싸는 곳은 z-index를 주지 않는다.
 * 막힘 카드에는 제목·경고 아이콘·닫기·진행 표시·등장 모션이 없다. 안내는 왼쪽 정렬이고 버튼은 좁은 폭에서도 문구 오른쪽에 둔다(줄은 문구가 꺾는다).
 * 둘째 줄의 n은 받지 못한 아이템 배지 수이고 0 이하이면 숫자 없는 문장이다. 시각 제목이 없어 section의 aria-labelledby를 안내 문단에 건다.
 *
 * 클라이언트·서버 경계: 서버 전용 모듈을 가져오지 않는다.
 */
export default function ChapterRewardBlockedCard({ pendingItemCount }: { pendingItemCount: number }) {
  const router = useRouter()
  const copy = d.capsule.blockedBanner
  const line2 = pendingItemCount > 0 ? t(copy.line2, { count: pendingItemCount }) : copy.line2NoCount
  const noteId = useId()

  return (
    <section aria-labelledby={noteId}>
      <Card
        tone="inverse"
        className="-mt-4 text-left"
        style={{
          paddingTop: OVERLAP_PX + TOP_GAP_PX,
          paddingBottom: BOTTOM_GAP_PX,
          paddingLeft: SIDE_GAP_PX,
          paddingRight: SIDE_GAP_PX,
          // 위 두 모서리는 각지게 한다: 둥글면 카드의 둥근 아래쪽 곡선과 사이에 움푹 들어간 틈이 보인다
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
        }}
      >
        <div className="flex flex-row items-center justify-between gap-3">
          <p id={noteId} className="m-0 min-w-0 flex-1 text-base text-snow break-keep wrap-break-word">
            <span className="block">{copy.line1}</span>
            <span className="block text-muted-on-inverse">{line2}</span>
          </p>
          <Button variant="secondary" size="xs" className="shrink-0 whitespace-nowrap" onClick={() => router.push('/inventory')}>
            {copy.cta}
          </Button>
        </div>
      </Card>
    </section>
  )
}
