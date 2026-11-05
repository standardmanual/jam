'use client'

import { useId, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ds/components/buttons/Button'
import { Card } from '@ds/components/cards/Card'
import { d } from '@/lib/i18n'

/**
 * 홈 캡슐 막힘 카드 — 가득 찬 게이지와 안내를 한 카드로 묶는 합성 래퍼 (티켓 20261105_1912, 채원 사전 판정 2026-11-05)
 *
 * 위에 게이지(`gauge`, 호출부가 가득+문구로 그려 넘긴다), 아래에 `[두 줄 안내 | «인벤토리 가기» 버튼]`이 한 줄로 놓인다.
 * 좁은 폭에서는 버튼이 아래로 내려가도 안내는 줄1·줄2 단위를 유지한다. 새 시각 부품이 아니라 기존 부품(Card inverse, Button secondary 소형)의 조합이다.
 * 홈 막힘 안내 한 곳에서만 쓰므로 MODULAR로 올리지 않는다. 제목·경고 아이콘·숫자(n개·k칸)·닫기·애니메이션이 없다.
 * 카드 안 글자는 반전 면 위라 snow, 둘째 줄은 snow 80%다. 안내에 text-balance를 쓰지 않는다(줄이 일찍 꺾인다는 2026-11-05 지적).
 * 시각 제목이 없어 section의 aria-labelledby를 안내 문단에 건다. 이 컴포넌트를 감싸는 곳은 z-index를 주지 않는다.
 *
 * 클라이언트·서버 경계: 서버 전용 모듈을 가져오지 않는다.
 */
export default function CapsuleBlockedCard({ gauge }: { gauge: ReactNode }) {
  const router = useRouter()
  const copy = d.capsule.blockedBanner
  const noteId = useId()

  return (
    <section aria-labelledby={noteId}>
      <Card tone="inverse" className="flex flex-col gap-3 text-left">
        {gauge}
        <div className="flex flex-row flex-wrap items-center justify-between gap-3">
          <p id={noteId} className="m-0 text-base text-snow break-keep wrap-break-word">
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
