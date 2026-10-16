import { Card } from '@ds/components/cards/Card'
import type { BriefCardView } from '@/lib/today/cardView'
import CardChipRow from './CardChipRow'
import CardThumb from './CardThumb'

/**
 * 짧은 소식(`brief`) 모양 — 면(표면) 겹 (티켓 20261001_1458, 상위 20260930_1453 확정 설계 1·3·4절).
 *
 * 링크·계측·눌림·포커스 윤곽선은 모르고(`CardFrame`이 맡는다) 표시 데이터(`BriefCardView`) 값만 읽어 그린다.
 * 왼쪽 64px 칸(배지 썸네일 또는 자원 아이콘, `CardThumb`) · 글자 열(칩 줄 → 제목 → 필수 정보) · 끝 `›`다.
 * 64px 칸의 그림·흑백·자원 아이콘 대체 규칙은 `CardThumb.tsx`에 있다(`list` 타일과 공용, 티켓 20261001_2104).
 *
 * - 안쪽 여백은 `Card`가 인라인 `style`(`padding: var(--layout-card-padding)` = 24px)로 주기 때문에 클래스(`p-*`)로는 덮이지 않는다.
 *   그래서 같은 인라인 `style`로 덮는다. 칸 64 + 위아래 12×2 = 최소 높이 88px와 맞아떨어진다.
 * - `--text-base`은 서비스에서 14px이 아니라 16px이다. 필수 정보 14px은 `--text-sm`이다.
 * - 옅은 글자는 `text-muted` 한 단계로 통일한다(흰 면 위 5.74:1). 불투명도로 글자색을 만들지 않는다(티켓 20261015_2133).
 */

export default function BriefCard({ view }: { view: BriefCardView }) {
  const facts = view.facts ?? []

  return (
    <Card
      className="min-h-[88px] flex items-center gap-3"
      style={{ padding: 'var(--spacing-12) var(--spacing-16)' }}
    >
      <CardThumb view={view} src={view.thumbnailUrl} dimmed={view.thumbnailDimmed} />

      <div className="flex-1 min-w-0">
        {/* 칩 줄은 `hero`와 공용이다(`CardChipRow`: 좁아지면 줄어드는 것은 지역 핀뿐, 드랍은 핀 생략). brief에는 게재일 칸이 없어 `publishedAt`을 넘기지 않는다 */}
        <CardChipRow
          view={{ resource: view.resource, label: view.label, regionLabel: view.regionLabel, rarity: view.rarity }}
          className="mb-2"
        />

        <h3 className="text-base text-foreground line-clamp-2 break-keep break-words">
          {view.title}
        </h3>

        {/* 필수 정보 — 아이콘 없이 글자로, 한 줄에 하나씩. 자르지 않고 줄바꿈한다(말줄임 없음). 값이 없으면 줄이 없다 */}
        {facts.length > 0 && (
          <div className="mt-1">
            {facts.map((line, index) => (
              <p
                key={index}
                className="text-sm text-muted break-keep break-words"
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* 이동한다는 암시 — 링크가 없는 카드(`href` 없음)에는 그리지 않는다. 미리보기도 링크만 없을 뿐 `href`가 있으면 보인다 */}
      {view.href && (
        <span className="shrink-0 text-muted" aria-hidden="true">
          &rsaquo;
        </span>
      )}
    </Card>
  )
}
