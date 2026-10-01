import Link from 'next/link'
import type { ReactNode } from 'react'
import TodayCardTracker from '@/app/(main)/TodayCardTracker'
import type { CardView } from '@/lib/today/cardView'

/**
 * 투데이 카드 틀 — 접근·계측 겹 (티켓 20261001_1458, 상위 20260930_1453 확정 설계 4·8절).
 *
 * 모양은 모른다. 표시 데이터의 계측 정보(`tracking`)와 이동 대상(`href`)만 읽어 안쪽 모양(`children`)을 감싼다.
 * - `tracking`이 있으면 `TodayCardTracker`로 감싸 노출·클릭을 기록한다.
 * - `tracking`과 `href`가 모두 있으면 그 안에 `Link`를 둔다. 눌림은 이 `Link` 하나에만 붙는다(안쪽 면에도 붙이면 두 번 줄어든다).
 * - `tracking`이 없으면(운영툴 미리보기) 트래커·링크·눌림이 모두 없다 — 링크 없는 카드에는 `.jam-press`를 붙이지 않는다.
 *
 * `Link`에 `aria-label`을 달지 않는다. 안쪽 글자(제목)가 곧 접근 가능한 이름이다.
 * `Link`의 둥근 모서리(`--radius-cards`)는 키보드 포커스 윤곽선이 둥근 카드 밖에서 직각으로 그려지지 않게 하려는 것이고,
 * 윤곽선 값(2px·오프셋 2px·`--color-primary`)은 `design-system/styles.css`의 전역 `*:focus-visible`과 같다 — 서비스는 그 파일을
 * import하지 않아 같은 규칙을 클래스로 다시 적는다. Tailwind `outline-primary`는 홈에서 `--primary`가 비어 색이 비므로
 * DS 토큰을 직접 가리킨다. 부모에 `overflow-hidden`이 생기면 카드 밖으로 나가는 윤곽선이 잘린다.
 */
const LINK_CLASS =
  'block rounded-[var(--radius-cards)] jam-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)]'

export default function CardFrame({ view, children }: { view: CardView; children: ReactNode }) {
  const { tracking, href } = view
  if (!tracking) return <>{children}</>

  return (
    <TodayCardTracker
      cardId={tracking.cardId}
      contentTypeId={tracking.contentTypeId}
      templateType={tracking.templateType}
      shape={tracking.shape}
    >
      {href ? (
        <Link href={href} className={LINK_CLASS}>
          {children}
        </Link>
      ) : (
        children
      )}
    </TodayCardTracker>
  )
}
