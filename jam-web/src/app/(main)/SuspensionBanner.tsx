'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@ds/components/cards/Card'
import { LabelChip } from '@ds/components/cards/LabelChip'
import Button from '@/components/ui/Button'
import LocalDate from '@/components/LocalDate'
import { d } from '@/lib/i18n'

/**
 * 홈 상단 이용 정지 배너 (티켓 20261017_1426 2회, 채원 사전 판정 2026-10-17).
 *
 * 정지 중인 유저의 홈에만 그린다. 정지가 아니면 홈이 이 컴포넌트를 부르지 않아 DOM에 없다(자리도 비우지 않는다).
 * 서버(홈 page.tsx)가 `getActiveSuspension`으로 읽은 사유와 정지 시각을 원시값으로 내려 준다.
 *
 * 새 컴포넌트·새 토큰 없이 기존 부품만 조합한다(StravaDisconnectedCard와 같은 문법): Card(기본 톤), LabelChip,
 * Button(primary main). 면을 빨강·노랑으로 칠하지 않고 아이콘·애니메이션도 없다. 심각도는 문구가 전한다.
 * 사유는 운영자가 쓴 자유 글이라 줄이거나 말줄임하지 않고 전문을 보인다(줄바꿈은 살리고 긴 토큰은 깬다).
 *
 * 클라이언트·서버 경계: `suspension.ts`·`suspension-write.ts`·`@/lib/supabase/server`·`next/headers`를 가져오지 않는다.
 * 사유와 시각을 props로 받으므로 이 파일은 정지 모듈을 가져올 필요가 없다.
 */
export default function SuspensionBanner({ reason, suspendedAt }: { reason: string; suspendedAt: string }) {
  const router = useRouter()
  const copy = d.suspension
  const titleId = 'suspension-banner-title'
  const trimmedReason = reason.trim()

  return (
    <section aria-labelledby={titleId}>
      <Card className="flex flex-col gap-2 text-left">
        <LabelChip className="self-start">{copy.bannerChip}</LabelChip>
        <h2 id={titleId} className="text-base font-bold break-keep wrap-break-word text-balance">
          {copy.bannerTitle}
        </h2>
        <dl className="flex flex-col gap-1">
          {trimmedReason && (
            <div className="flex flex-col">
              <dt className="text-sm text-muted break-keep">{copy.bannerReasonLabel}</dt>
              <dd className="text-base text-foreground break-keep wrap-break-word whitespace-pre-line">{trimmedReason}</dd>
            </div>
          )}
          <div className="flex flex-col">
            <dt className="text-sm text-muted break-keep">{copy.bannerSuspendedOnLabel}</dt>
            <dd className="text-base text-foreground break-keep">
              <LocalDate iso={suspendedAt} korean={{ year: true }} />
            </dd>
          </div>
        </dl>
        <p className="text-base text-muted break-keep wrap-break-word text-pretty">{copy.bannerBody}</p>
        <Button variant="primary" surface="main" fullWidth onClick={() => router.push('/voc')}>
          {d.voc.inquireCta}
        </Button>
      </Card>
    </section>
  )
}
