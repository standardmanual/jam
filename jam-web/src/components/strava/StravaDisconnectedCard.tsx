'use client'

import { Card } from '@ds/components/cards/Card'
import { LabelChip } from '@ds/components/cards/LabelChip'
import Button from '@/components/ui/Button'
import { d } from '@/lib/i18n'

/**
 * 홈 Strava 동기화 끊김 카드 (티켓 20261017_1422 2회, 채원 사전 판정 2026-10-17).
 *
 * 사유가 토큰 갱신 실패·Strava 철회일 때만 홈이 그린다(`showsStravaDisconnectedCard`). 정상 연결과 미연동,
 * 유저가 직접 끊은 경우에는 DOM에 없다.
 *
 * 새 컴포넌트·새 토큰 없이 기존 부품만 조합한다: Card(기본 톤, 흰 면 + 1px 테두리), LabelChip,
 * Button(primary main = 검정 알약). 면을 빨강·노랑으로 칠하지 않고 심각도는 문구가 전달한다.
 * Strava 주황, 아이콘, 맥동·흔들림·입장 애니메이션을 쓰지 않는다(오류 상황에서 시선을 강제하지 않는다).
 * 누르는 중 피드백은 Button의 scale 축소를 그대로 쓴다.
 *
 * 다시 동기화는 OAuth 전체 페이지 이동이라 `OnboardingQuestCard`·`TopNav`와 같은 방식으로 이동한다.
 */
export default function StravaDisconnectedCard() {
  const copy = d.stravaConnection

  return (
    <Card className="flex flex-col gap-2 text-left">
      <LabelChip className="self-start">{copy.chipLabel}</LabelChip>
      <p className="text-base font-bold break-keep wrap-break-word text-balance">{copy.card.title}</p>
      <p className="text-base text-muted break-keep wrap-break-word text-pretty">{copy.card.body}</p>
      <Button
        variant="primary"
        surface="main"
        fullWidth
        onClick={() => {
          window.location.href = '/api/strava/auth'
        }}
      >
        {copy.card.cta}
      </Button>
    </Card>
  )
}
