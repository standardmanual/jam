'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@ds/components/cards/Card'
import Button from '@/components/ui/Button'
import { AlertTriangleIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import type { HomeCapsuleBlockedBannerView } from '@/lib/capsule/receive-block-contract'

/**
 * 홈 상단 캡슐 막힘 배너 (티켓 20261105_0104 T4, 채원 사전 판정 2026-11-05, 윈터 제3안. 문구는 R3 티켓 20261105_1439에서 «얻었고 k칸을 비운다» 맥락으로 바뀜)
 *
 * 캡슐이 가득 차고 인벤토리 빈칸이 필요 칸수보다 적어 잼 모으기가 멈춘 유저의 홈에만 그린다. 막히지 않았으면 홈이 이 컴포넌트를
 * 부르지 않아 DOM에 없다(자리도 비우지 않는다). 이용 정지와 겹치면 홈이 정지 배너만 그린다(상시 배너 최대 1개).
 * 서버(홈 page.tsx)가 `loadHomeCapsuleBlockedBanner`로 읽은 대기 개수(`pending`)와 부족분(`shortfall`)을 원시값으로 내려 준다.
 *
 * 새 컴포넌트·새 토큰 없이 기존 부품만 조합한다(`SuspensionBanner`와 같은 문법): Card(inverse 톤), AlertTriangleIcon, Button(secondary xs, 홈 상단 «동기화» 버튼과 같은 크기).
 * 면·테두리를 붉게 칠하지 않고 붉은 포인트는 `--danger` 아이콘 하나다. 어두운 반전 면이라 글자는 snow, 본문은 snow 80%다.
 * 본문에 text-balance를 쓰지 않는다: 균형 맞춤이 줄을 일찍 꺾어 두세 줄로 좁아 보였다(2026-11-05 사용자 지적).
 * 닫기 버튼·칩·애니메이션이 없다. 아이콘은 장식이라 스크린리더에서 숨기고 의미는 제목과 본문이 전한다.
 *
 * 클라이언트·서버 경계: `receive-block.ts`·`home-blocked-banner.ts`·`@/lib/supabase/server`를 가져오지 않고 계약 파일의 타입만 쓴다.
 */
export default function CapsuleBlockedBanner({ pending, shortfall }: HomeCapsuleBlockedBannerView) {
  const router = useRouter()
  const copy = d.capsule.blockedBanner
  const titleId = 'capsule-blocked-banner-title'

  return (
    <section aria-labelledby={titleId}>
      <Card tone="inverse" className="flex flex-col items-start gap-2 text-left">
        <div className="flex items-start gap-2">
          <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          <h2 id={titleId} className="text-base font-bold text-snow break-keep wrap-break-word">
            {t(copy.title, { n: Math.max(1, pending) })}
          </h2>
        </div>
        <p className="text-base text-snow/80 break-keep wrap-break-word">{t(copy.body, { k: Math.max(1, shortfall) })}</p>
        <Button variant="secondary" size="xs" onClick={() => router.push('/inventory')}>
          {copy.cta}
        </Button>
      </Card>
    </section>
  )
}
