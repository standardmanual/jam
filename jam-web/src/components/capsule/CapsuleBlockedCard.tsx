'use client'

import { useId } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ds/components/buttons/Button'
import { Card } from '@ds/components/cards/Card'
import { CAPSULE_GAUGE_HEIGHT_PX } from '@/components/capsule/CapsuleGauge'
import { d, t } from '@/lib/i18n'

/** 카드를 게이지 높이의 절반만큼 위로 올려 윗부분을 게이지 뒤에 깐다 — 게이지와 카드가 한 덩어리로 붙어 보인다(시안) */
const TUCK_PX = CAPSULE_GAUGE_HEIGHT_PX / 2
/** 카드 좌우 가장자리에서 안내 내용까지의 간격(px) — 좁게 잡은 안쪽 여백(2026-11-05 사용자 지정) */
const SIDE_GAP_PX = 14
/** 게이지 아래·카드 아래 가장자리에서 안내 내용까지의 간격(px) — 위아래가 넓어 보인다는 지적에 따라 이전(위 14·아래 25)의 절반으로 줄였다(2026-11-05 사용자 지정) */
const TOP_GAP_PX = 7
const BOTTOM_GAP_PX = 12

/**
 * 홈 캡슐 막힘 카드 — 가득 찬 게이지 바로 아래에 놓이는 안내 카드 (티켓 20261105_1912, 채원 사전 판정 2026-11-05)
 *
 * 게이지와 같은 폭으로 게이지 바로 아래에 붙는 알림 카드다(2026-11-05 사용자 결정: 게이지는 카드 밖에서 원래 가로 폭을 지키고, 시안처럼 카드 윗부분이 게이지 뒤에 깔려 한 덩어리로 보인다). 게이지는 위치 지정(relative) 요소라 z-index 없이 카드 위에 그려진다. 카드 안은 `[두 줄 안내 | «인벤토리 가기» 버튼]` 한 줄이다.
 * 버튼은 항상 문구 오른쪽에 둔다(2026-11-05 사용자 결정, 시안과 같다). 좁은 폭에서는 버튼을 내리지 않고 안내 문구가 버튼 옆에서 줄을 꺾는다. 새 시각 부품이 아니라 기존 부품(Card inverse, Button secondary 소형)의 조합이다.
 * 홈 막힘 안내 한 곳에서만 쓰므로 MODULAR로 올리지 않는다. 제목·경고 아이콘·칸수(k칸)·닫기·애니메이션이 없고, 숫자는 둘째 줄의 받지 못한 배지 수 하나뿐이다.
 * 둘째 줄에는 받지 못한 아이템 배지 수(n개)가 들어간다(2026-11-06 사용자 지정). 카드 안 글자는 반전 면 위라 snow, 둘째 줄은 snow 80%다. 안내에 text-balance를 쓰지 않는다(줄이 일찍 꺾인다는 2026-11-05 지적).
 * 시각 제목이 없어 section의 aria-labelledby를 안내 문단에 건다. 이 컴포넌트를 감싸는 곳은 z-index를 주지 않는다.
 *
 * 클라이언트·서버 경계: 서버 전용 모듈을 가져오지 않는다.
 */
export default function CapsuleBlockedCard({ pendingItemCount }: { pendingItemCount: number }) {
  const router = useRouter()
  const copy = d.capsule.blockedBanner
  // 둘째 줄의 n은 받지 못한 아이템 배지 수다. 서버가 정한 값(`capsule.pendingItemCount`)을 그대로 쓰고, 0 이하이면 숫자 없는 문장으로 말한다
  const line2 = pendingItemCount > 0 ? t(copy.line2, { count: pendingItemCount }) : copy.line2NoCount
  const noteId = useId()

  return (
    <section aria-labelledby={noteId}>
      <Card
        tone="inverse"
        className="text-left"
        style={{
          marginTop: -TUCK_PX,
          // 안쪽 여백(테두리 1px 포함): 좌우는 카드 가장자리에서 14px, 위쪽은 게이지 아래에서 7px, 아래쪽은 카드 아래 가장자리에서 12px 띄운다(2026-11-05 사용자 지정)
          paddingTop: `calc(${TUCK_PX}px + ${TOP_GAP_PX - 1}px)`,
          paddingBottom: BOTTOM_GAP_PX - 1,
          paddingLeft: SIDE_GAP_PX - 1,
          paddingRight: SIDE_GAP_PX - 1,
          // 위 두 모서리는 각지게 한다: 둥글면 게이지의 둥근 아래쪽 곡선과 카드 사이에 움푹 들어간 틈이 보인다(2026-11-05 사용자 지적)
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
        }}
      >
        <div className="flex flex-row items-center justify-between gap-3">
          <p id={noteId} className="m-0 min-w-0 flex-1 text-base text-snow break-keep wrap-break-word">
            <span className="block">{copy.line1}</span>
            <span className="block text-snow/80">{line2}</span>
          </p>
          <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => router.push('/inventory')}>
            {copy.cta}
          </Button>
        </div>
      </Card>
    </section>
  )
}
