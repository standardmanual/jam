'use client'

import { useId } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ds/components/buttons/Button'
import { Card } from '@ds/components/cards/Card'
import { CAPSULE_GAUGE_HEIGHT_PX } from '@/components/capsule/CapsuleGauge'
import { d } from '@/lib/i18n'

/** 카드를 게이지 높이의 절반만큼 위로 올려 윗부분을 게이지 뒤에 깐다 — 게이지와 카드가 한 덩어리로 붙어 보인다(시안) */
const TUCK_PX = CAPSULE_GAUGE_HEIGHT_PX / 2
/** 카드 가장자리·게이지 아래에서 안내 내용까지의 간격(px) — 좁게 잡은 안쪽 여백(2026-11-05 사용자 지정) */
const CONTENT_GAP_PX = 14

/**
 * 홈 캡슐 막힘 카드 — 가득 찬 게이지 바로 아래에 놓이는 안내 카드 (티켓 20261105_1912, 채원 사전 판정 2026-11-05)
 *
 * 게이지와 같은 폭으로 게이지 바로 아래에 붙는 알림 카드다(2026-11-05 사용자 결정: 게이지는 카드 밖에서 원래 가로 폭을 지키고, 시안처럼 카드 윗부분이 게이지 뒤에 깔려 한 덩어리로 보인다). 게이지는 위치 지정(relative) 요소라 z-index 없이 카드 위에 그려진다. 카드 안은 `[두 줄 안내 | «인벤토리 가기» 버튼]` 한 줄이다.
 * 버튼은 항상 문구 오른쪽에 둔다(2026-11-05 사용자 결정, 시안과 같다). 좁은 폭에서는 버튼을 내리지 않고 안내 문구가 버튼 옆에서 줄을 꺾는다. 새 시각 부품이 아니라 기존 부품(Card inverse, Button secondary 소형)의 조합이다.
 * 홈 막힘 안내 한 곳에서만 쓰므로 MODULAR로 올리지 않는다. 제목·경고 아이콘·숫자(n개·k칸)·닫기·애니메이션이 없다.
 * 카드 안 글자는 반전 면 위라 snow, 둘째 줄은 snow 80%다. 안내에 text-balance를 쓰지 않는다(줄이 일찍 꺾인다는 2026-11-05 지적).
 * 시각 제목이 없어 section의 aria-labelledby를 안내 문단에 건다. 이 컴포넌트를 감싸는 곳은 z-index를 주지 않는다.
 *
 * 클라이언트·서버 경계: 서버 전용 모듈을 가져오지 않는다.
 */
export default function CapsuleBlockedCard() {
  const router = useRouter()
  const copy = d.capsule.blockedBanner
  const noteId = useId()

  return (
    <section aria-labelledby={noteId}>
      <Card
        tone="inverse"
        className="text-left"
        style={{
          marginTop: -TUCK_PX,
          // 안쪽 여백: 좌우는 카드 가장자리에서 14px(테두리 1px 포함), 위쪽은 게이지 아래에서 14px를 띄운다(2026-11-05 사용자가 시안 위에 선으로 지정). 아래쪽은 카드 기본 여백 그대로다
          paddingTop: `calc(${TUCK_PX}px + ${CONTENT_GAP_PX - 1}px)`,
          paddingLeft: CONTENT_GAP_PX - 1,
          paddingRight: CONTENT_GAP_PX - 1,
          // 위 두 모서리는 각지게 한다: 둥글면 게이지의 둥근 아래쪽 곡선과 카드 사이에 움푹 들어간 틈이 보인다(2026-11-05 사용자 지적)
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
        }}
      >
        <div className="flex flex-row items-center justify-between gap-3">
          <p id={noteId} className="m-0 min-w-0 flex-1 text-base text-snow break-keep wrap-break-word">
            <span className="block">{copy.line1}</span>
            <span className="block text-snow/80">{copy.line2}</span>
          </p>
          <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => router.push('/inventory')}>
            {copy.cta}
          </Button>
        </div>
      </Card>
    </section>
  )
}
