import Link from 'next/link'
import type { ReactNode } from 'react'
import TodayCardTracker from './TodayCardTracker'
import type { CardView } from '@/lib/today/cardView'

/**
 * 투데이 카드 틀 — 접근·계측 겹 (티켓 20261001_1458, 상위 20260930_1453 확정 설계 4·8절).
 *
 * 모양은 모른다. 표시 데이터의 계측 정보(`tracking`)와 이동 대상(`href`)만 읽어 안쪽 모양(`children`)을 감싼다.
 * - `tracking`이 있으면 `TodayCardTracker`로 감싸 노출·클릭을 기록한다.
 * - `tracking`과 `href`가 모두 있으면 그 안에 `Link`를 둔다. 눌림은 이 `Link` 하나에만 붙는다(안쪽 면에도 붙이면 두 번 줄어든다).
 * - `tracking`이 없으면(운영툴 미리보기) 트래커·링크·눌림이 모두 없다 — 링크 없는 카드에는 `.jam-press`를 붙이지 않는다.
 * - `link={false}`(티켓 20261001_2104, 랭킹 행형 `list`)면 `tracking`이 있어도 `Link`와 `.jam-press`를 걸지 않고 트래커만 `trackClick={false}`로 감싼다(노출만 기록한다).
 *   행형은 순위 행마다 자기 프로필 링크가 있어 카드 전체를 링크로 감싸면 앵커 안에 앵커가 생기고, 카드 단위 클릭은 의미가 없다. 트래커·GA 값 연결이 두 곳으로
 *   갈라지지 않게 틀을 따로 만들지 않고 이 옵션 하나로 갈랐다. 모양은 계속 모른다 — 어느 모양이 `link={false}`인지는 호출부(`TodayCard`)가 정한다.
 *
 * `Link`에 `aria-label`을 달지 않는다. 안쪽 글자(제목)가 곧 접근 가능한 이름이다.
 * `Link`의 둥근 모서리(`--radius-cards`)는 키보드 포커스 윤곽선이 둥근 카드 밖에서 직각으로 그려지지 않게 하려는 것이고,
 * 윤곽선 값(2px·오프셋 2px·`--color-primary`)은 `design-system/styles.css`의 전역 `*:focus-visible`과 같다 — 서비스는 그 파일을
 * import하지 않아 같은 규칙을 클래스로 다시 적는다. Tailwind `outline-primary`는 홈에서 `--primary`가 비어 색이 비므로
 * DS 토큰을 직접 가리킨다. 부모에 `overflow-hidden`이 생기면 카드 밖으로 나가는 윤곽선이 잘린다.
 *
 * 이 클래스 상수는 `CardLink`로만 내보낸다 — 행형 제목 링크가 같은 윤곽선·눌림을 쓰되 값을 두 곳에 적지 않는다.
 */
const LINK_CLASS =
  'block rounded-[var(--radius-cards)] jam-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)]'

/** 틀과 같은 링크(둥근 윤곽·눌림·포커스 윤곽선). 틀 안쪽에서 일부 영역만 링크로 감쌀 때(행형 제목 영역) 쓴다. */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={LINK_CLASS}>
      {children}
    </Link>
  )
}

export default function CardFrame({
  view,
  link = true,
  children,
}: {
  view: CardView
  /** false면 카드 전체 링크와 눌림을 걸지 않고, 클릭 기록도 하지 않는다(노출만). 기본 true. */
  link?: boolean
  children: ReactNode
}) {
  const { tracking, href } = view
  if (!tracking) return <>{children}</>

  return (
    <TodayCardTracker
      cardId={tracking.cardId}
      contentTypeId={tracking.contentTypeId}
      templateType={tracking.templateType}
      shape={tracking.shape}
      trackClick={link}
    >
      {link && href ? <CardLink href={href}>{children}</CardLink> : children}
    </TodayCardTracker>
  )
}
