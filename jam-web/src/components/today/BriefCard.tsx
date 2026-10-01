import { Card } from '@ds/components/cards/Card'
import SafeImage from '@/components/SafeImage'
import type { BriefCardView } from '@/lib/today/cardView'
import CardChipRow from './CardChipRow'
import { resourceIconOf } from './resourceIcon'

/**
 * 짧은 소식(`brief`) 모양 — 면(표면) 겹 (티켓 20261001_1458, 상위 20260930_1453 확정 설계 1·3·4절).
 *
 * 링크·계측·눌림·포커스 윤곽선은 모르고(`CardFrame`이 맡는다) 표시 데이터(`BriefCardView`) 값만 읽어 그린다.
 * 왼쪽 64px 칸(배지 썸네일 또는 자원 아이콘) · 글자 열(칩 줄 → 제목 → 필수 정보) · 끝 `›`다.
 *
 * - 안쪽 여백은 `Card`가 인라인 `style`(`padding: var(--layout-card-padding)` = 24px)로 주기 때문에 클래스(`p-*`)로는 덮이지 않는다.
 *   그래서 같은 인라인 `style`로 덮는다. 칸 64 + 위아래 12×2 = 최소 높이 88px와 맞아떨어진다.
 * - `--text-body-sm`은 서비스에서 14px이 아니라 16px이다. 필수 정보 14px은 `--text-small`이다.
 * - 옅은 글자는 `text-text-inverse/60` 한 단계로 통일한다(흰 면 위 AA 이상). `/30`·`/40`은 쓰지 않는다.
 */

/**
 * 64px 칸. 배지 썸네일(`thumbnailUrl`)이 있으면 그리고, 없거나 로드에 실패하면 같은 칸에 자원 아이콘을 그려 카드 높이가 변하지 않는다.
 * `BadgeGalleryCard`의 64px 타일과 같은 값이라 b5 `list` 타일이 이어 쓴다(둘째 소비자가 생기는 b5에서 공용으로 뺄지 정한다).
 *
 * `alt`가 비어 있는 이유: 배지 이름이 필수 정보 줄로 글자 표시된다(확정 설계 3절의 alt 규칙).
 * 흑백은 미보유 배지(`thumbnailDimmed`)에만 건다 — 색 외에 글자 단서가 없는 기존 규칙이다(티켓 20260905_0038 B).
 */
function BriefSlot({ view }: { view: BriefCardView }) {
  // 자원 → 아이콘 선택은 `HeroCard`의 이미지 없음 자리 표시와 같은 규칙이라 `resourceIcon.ts` 한 곳에 있다
  const icon = resourceIconOf(view, { className: 'w-6 h-6 text-text-inverse/60' })
  return (
    <div className="w-16 h-16 shrink-0 rounded-[var(--radius-cards)] bg-black/[0.04] overflow-hidden flex items-center justify-center">
      {view.thumbnailUrl ? (
        <SafeImage
          src={view.thumbnailUrl}
          alt=""
          width={64}
          height={64}
          className={view.thumbnailDimmed ? 'w-full h-full object-cover grayscale' : 'w-full h-full object-cover'}
          fallback={icon}
        />
      ) : (
        icon
      )}
    </div>
  )
}

export default function BriefCard({ view }: { view: BriefCardView }) {
  const facts = view.facts ?? []

  return (
    <Card
      tone="inverse"
      className="min-h-[88px] flex items-center gap-[var(--spacing-12)]"
      style={{ padding: 'var(--spacing-12) var(--spacing-16)' }}
    >
      <BriefSlot view={view} />

      <div className="flex-1 min-w-0">
        {/* 칩 줄은 `hero`와 공용이다(`CardChipRow`: 좁아지면 줄어드는 것은 지역 핀뿐, 드랍은 핀 생략). brief에는 게재일 칸이 없어 `publishedAt`을 넘기지 않는다 */}
        <CardChipRow
          view={{ resource: view.resource, label: view.label, regionLabel: view.regionLabel, rarity: view.rarity }}
          className="mb-[var(--spacing-8)]"
        />

        <h3 className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text-inverse line-clamp-2 break-keep break-words">
          {view.title}
        </h3>

        {/* 필수 정보 — 아이콘 없이 글자로, 한 줄에 하나씩. 자르지 않고 줄바꿈한다(말줄임 없음). 값이 없으면 줄이 없다 */}
        {facts.length > 0 && (
          <div className="mt-[var(--spacing-4)]">
            {facts.map((line, index) => (
              <p
                key={index}
                className="text-[length:var(--text-small)] leading-[var(--leading-small)] text-text-inverse/60 break-keep break-words"
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* 이동한다는 암시 — 링크가 없는 카드(`href` 없음)에는 그리지 않는다. 미리보기도 링크만 없을 뿐 `href`가 있으면 보인다 */}
      {view.href && (
        <span className="shrink-0 text-text-inverse/60" aria-hidden="true">
          &rsaquo;
        </span>
      )}
    </Card>
  )
}
