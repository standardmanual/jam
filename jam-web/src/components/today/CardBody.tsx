import type { ReactNode } from 'react'

/**
 * 카드 본문 공용 조각(기본 톤 Card의 흰 면 위) — 제목 그룹 · 필수 정보 · 설명문 · 끝 줄 (티켓 20261001_2104, 상위 20260930_1453 조각 b5).
 * `HeroCard`·`SquareCard`가 같은 클래스로 두 벌 갖고 있던 본문(b3·b4 메모 「셋째 소비자가 생기면 공용으로 뺀다」)을 `ListCard`가 셋째 소비자가 되면서 뺐다.
 * 이 조각들로 갈아 끼운 `hero`·`square`의 출력 HTML은 한 글자도 바뀌지 않는다(`__tests__/CardBody.test.tsx`가 세 모양이 같은 마크업을 쓴다는 것을 고정한다).
 *
 * - 그리는 값만 받는다. 어떤 줄을 그릴지(`titleInImage`로 제목 그룹을 뺄지, `href`가 있어야 끝 줄을 그릴지)는 모양마다 다른 규칙이라 호출부가 정한다.
 *   값이 없으면 조각이 스스로 아무것도 그리지 않는다(그 그룹만 사라지고 간격도 같이 사라진다 — `CardBody`가 `flex gap`이다).
 * - 칩 줄은 `CardChipRow`가 따로 공용이라 여기 없다.
 * - `--text-base`은 서비스에서 14px이 아니라 16px이다. 필수 정보·설명문 14px은 `--text-sm`이다.
 * - 옅은 글자는 `text-muted` 한 단계로 통일한다(흰 면 위 5.74:1). 불투명도로 글자색을 만들지 않는다(티켓 20261015_2133).
 * - 본문은 전부 왼쪽 정렬이다.
 * - `brief`의 본문은 이 조각이 아니다: 제목이 16px이고 필수 정보도 보통 굵기 `text-muted`인 작은 카드라서 별개 본문이다.
 */

/** 본문 칸 — 안쪽 여백 24px, 그룹 사이 간격 12px. 카드 면(`Card`)의 안쪽 여백은 인라인 `style`로 0을 주고 이 칸이 가진다. */
export function CardBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 p-6">{children}</div>
}

/** 제목(h3, 24px, 2줄 말줄임) + 요약(16px `text-muted`, 2줄 말줄임, 선택). 요약은 제목 아래 4px이다. */
export function CardTitleGroup({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-2xl text-foreground line-clamp-2 break-keep break-words">
        {title}
      </h3>
      {subtitle && (
        <p className="mt-1 text-base text-muted line-clamp-2 break-keep break-words">
          {subtitle}
        </p>
      )}
    </div>
  )
}

/**
 * 필수 정보 — 아이콘·불릿 없이 글자로, 한 줄에 하나씩. 자르지 않고 줄바꿈한다(말줄임 없음).
 * 기간·보상은 사용자가 가장 먼저 찾는 값이라 옅게 하지 않고 굵게 한다(`hero`·`square`·`list`가 한 규칙이다).
 */
export function CardFacts({ facts }: { facts?: readonly string[] }) {
  if (!facts || facts.length === 0) return null
  return (
    <div>
      {facts.map((line, index) => (
        <p
          key={index}
          className="text-sm font-bold text-foreground break-keep break-words"
        >
          {line}
        </p>
      ))}
    </div>
  )
}

/** 설명문(14px `text-muted`, 2줄 말줄임). 필수 정보를 이기지 않게 `text-muted` + 보통 굵기다. */
export function CardDescription({ description }: { description?: string }) {
  if (!description) return null
  return (
    <p className="text-sm text-muted line-clamp-2 break-keep break-words">
      {description}
    </p>
  )
}

/**
 * 끝 줄(12px `text-muted`) — 「이 카드 전체가 눌린다」는 신호다. 라벨은 호출부가 준다.
 * 링크가 없는 카드(`href` 없음)는 말하지 않으므로 호출부가 `href`가 있을 때만 그린다. 미리보기도 링크만 없을 뿐 `href`가 있으면 보인다.
 */
export function CardEndLine({ label }: { label: string }) {
  return (
    <p className="text-xs text-muted">
      {label} <span aria-hidden="true">&rarr;</span>
    </p>
  )
}
