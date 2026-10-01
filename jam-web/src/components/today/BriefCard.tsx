import type { ComponentType, SVGProps } from 'react'
import { Card } from '@ds/components/cards/Card'
import { LabelChip } from '@ds/components/cards/LabelChip'
import { RarityBadge, type Rarity } from '@ds/components/cards/RarityBadge'
import SafeImage from '@/components/SafeImage'
import {
  BookIcon,
  FlaskIcon,
  HourglassIcon,
  MedalIcon,
  NewspaperIcon,
  PackageIcon,
  PinIcon,
  RankingIcon,
  TargetIcon,
} from '@/components/ui/icons'
import type { BriefCardView, CardResource } from '@/lib/today/cardView'

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
 * 자원 → 아이콘. 색이 아니라 아이콘 모양으로만 구분한다(제3의 컬러 도입 금지).
 * `Record<CardResource, …>`라 자원이 늘면 컴파일이 잡는다. b3~b5가 같은 매핑이 필요해지면 `today/resourceIcon.ts`로 뺀다.
 */
const RESOURCE_ICON: Record<CardResource, ComponentType<SVGProps<SVGSVGElement>>> = {
  mission: TargetIcon,
  drop: PackageIcon,
  recipe: FlaskIcon,
  badge: MedalIcon,
  article: NewspaperIcon,
  ranking: RankingIcon,
  collection: BookIcon,
  auto: HourglassIcon,
}

/**
 * 64px 칸. 배지 썸네일(`thumbnailUrl`)이 있으면 그리고, 없거나 로드에 실패하면 같은 칸에 자원 아이콘을 그려 카드 높이가 변하지 않는다.
 * `BadgeGalleryCard`의 64px 타일과 같은 값이라 b5 `list` 타일이 이어 쓴다(둘째 소비자가 생기는 b5에서 공용으로 뺄지 정한다).
 *
 * `alt`가 비어 있는 이유: 배지 이름이 필수 정보 줄로 글자 표시된다(확정 설계 3절의 alt 규칙).
 * 흑백은 미보유 배지(`thumbnailDimmed`)에만 건다 — 색 외에 글자 단서가 없는 기존 규칙이다(티켓 20260905_0038 B).
 */
function BriefSlot({ view }: { view: BriefCardView }) {
  // `auto`는 진행 알림(`progress_nudge`)과 지역 트렌드(`location_trend`)를 한 값으로 묶어서 템플릿을 구분할 수 없다. 그래서 지역 값이
  // 있으면 핀, 없으면 모래시계로 가른다(옛 렌더러의 구분을 그대로 지키는 임시 판별 — 템플릿 구분이 따로 필요해지면 b7에서 표시 데이터에
  // 구분 값을 더한다).
  const Icon = view.resource === 'auto' && view.regionLabel ? PinIcon : RESOURCE_ICON[view.resource]
  const icon = <Icon className="w-6 h-6 text-text-inverse/60" />
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
  // 드랍은 필수 정보 「지역 ○○」 줄이 같은 지역 값을 이미 내므로 칩 줄에서는 뺀다(한 카드에 같은 값이 두 번 보이지 않게)
  const showRegionPin = Boolean(view.regionLabel) && view.resource !== 'drop'
  const facts = view.facts ?? []

  return (
    <Card
      tone="inverse"
      className="min-h-[88px] flex items-center gap-[var(--spacing-12)]"
      style={{ padding: 'var(--spacing-12) var(--spacing-16)' }}
    >
      <BriefSlot view={view} />

      <div className="flex-1 min-w-0">
        {/* 칩 줄 — 좁아지면 줄어드는 것은 지역 핀뿐이다(라벨·희귀도 칩은 shrink-0) */}
        <div className="flex items-center gap-[var(--spacing-8)] mb-[var(--spacing-8)]">
          <LabelChip className="shrink-0">{view.label}</LabelChip>
          {showRegionPin && (
            <span className="inline-flex items-center gap-1 min-w-0 text-[length:var(--text-caption)] text-text-inverse/60">
              <PinIcon className="w-3 h-3 shrink-0" />
              <span className="truncate">{view.regionLabel}</span>
            </span>
          )}
          {/* Common·등급 없음(null)·미지 값은 컴포넌트가 스스로 아무것도 그리지 않는다. 희귀도는 배지 자체의 정보라 흑백으로 만들지 않는다 */}
          <RarityBadge rarity={view.rarity as Rarity | null | undefined} size="md" className="shrink-0" />
        </div>

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
