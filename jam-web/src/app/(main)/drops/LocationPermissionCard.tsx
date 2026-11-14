import { Card } from '@ds/components/cards/Card'
import Button from '@/components/ui/Button'
import { PinIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

/**
 * 위치를 쓸 수 없을 때 /drops에 보이는 안내 카드(티켓 20261114_1507).
 *
 * - `denied`: 사용자가 위치를 거부했다. 허용하는 방법 3단계와 «허용했어요, 다시 시도» 버튼을 둔다.
 * - `unsupported`: 브라우저가 위치를 지원하지 않는다. 안내만 보이고 구획·버튼은 없다.
 *
 * 위치 조회·거부 처리(watchPosition·오류 콜백)는 DropsClient에 그대로 있고 이 파일은 그리기만 한다.
 * 카드 뒤 지도 윤곽은 장식용 정적 SVG다. 위치를 받기 전에는 좌표가 없고 지도를 보여 주는 것도
 * 약속과 어긋나므로 실제 MapView를 쓰지 않는다. 반투명 면은 backdrop-filter 없이 --card-bg-translucent로 낸다.
 */
interface LocationPermissionCardProps {
  kind: 'denied' | 'unsupported'
  /** 거부 상태의 버튼을 눌렀을 때. unsupported에서는 쓰지 않는다. */
  onRetry: () => void
}

/** 장식 지도 윤곽 — 한 가지 색(--border)·한 가지 굵기의 길 몇 줄과 블록 세 개. 채움·그라데이션 없음. */
function MapOutline() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 358 520"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="var(--border)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M-10 120 C 80 100, 160 150, 370 110" />
      <path d="M-10 330 C 90 360, 200 300, 370 350" />
      <path d="M90 -10 C 110 120, 70 300, 100 530" />
      <path d="M250 -10 C 230 140, 280 330, 260 530" />
      <rect x="120" y="150" width="100" height="60" rx="8" />
      <rect x="20" y="370" width="90" height="70" rx="8" />
      <rect x="280" y="190" width="60" height="90" rx="8" />
    </svg>
  )
}

export default function LocationPermissionCard({ kind, onRetry }: LocationPermissionCardProps) {
  const denied = kind === 'denied'

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <MapOutline />
      <Card
        className="relative flex flex-col gap-4 text-left"
        style={{ background: 'var(--card-bg-translucent)', padding: 'var(--layout-card-padding)' }}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-background-inverse text-snow">
          <PinIcon />
        </span>

        <h2 className="text-2xl font-medium break-keep wrap-break-word text-balance">
          {denied ? d.drops.permissionDeniedTitle : d.drops.permissionUnsupportedTitle}
        </h2>
        <p className="text-base text-muted break-keep wrap-break-word text-balance">
          {denied ? d.drops.permissionDeniedDescription : d.drops.permissionUnsupportedDescription}
        </p>

        {denied && (
          <>
            <Card tone="tint" className="flex flex-col gap-3">
              <p className="text-sm font-medium break-keep wrap-break-word">{d.drops.permissionGuideTitle}</p>
              <ol className="m-0 flex list-none flex-col gap-3 p-0">
                {d.drops.permissionGuideSteps.map((step, i) => (
                  <li key={step} className="flex items-start gap-3 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background-inverse text-xs text-snow">
                      {i + 1}
                    </span>
                    <span className="break-keep wrap-break-word">{step}</span>
                  </li>
                ))}
              </ol>
            </Card>
            <Button variant="primary" size="md" fullWidth onClick={onRetry}>
              {d.drops.permissionRetry}
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
