import Link from 'next/link'
import type { ComponentType, SVGProps } from 'react'
import type { TodayCardWithHref } from '@/lib/today/cards'
import type { TodayCardTemplateType } from '@/types/database'
import { Card } from '@ds/components/cards/Card'
import { LabelChip } from '@ds/components/cards/LabelChip'
import SafeImage from '@/components/SafeImage'
import RankingListRow from '@/components/ranking/RankingListRow'
import TodayCardTracker from './TodayCardTracker'
import TodayCard, { isRenderedShape } from '@/components/today/TodayCard'
import { formatRankingMetricValue } from '@/lib/ranking/format'
import { toCardView } from '@/lib/today/cardView'
import { drawnShape } from '@/lib/today/shape'
import { d } from '@/lib/i18n'
import {
  MedalIcon,
  HourglassIcon,
  TargetIcon,
  BookIcon,
  PinIcon,
  PackageIcon,
  NewspaperIcon,
  RankingIcon,
} from '@/components/ui/icons'

const templateLabel: Record<TodayCardTemplateType, string> = {
  badge_spotlight: d.todayCard.badgeSpotlight,
  progress_nudge: d.todayCard.progressNudge,
  mission_spotlight: d.todayCard.missionSpotlight,
  itembook_milestone: d.todayCard.itembookMilestone,
  location_trend: d.todayCard.locationTrend,
  drop_alert: d.todayCard.dropAlert,
  editorial_article: d.todayCard.editorialArticle,
  ranking_board: d.todayCard.rankingBoard,
}

/** 콘텐츠 유형 식별은 색상이 아닌 아이콘 모양으로만 구분한다(바이너리 컬러 원칙 — 제3의 컬러 도입 금지) */
const TemplateIcon: Record<TodayCardTemplateType, ComponentType<SVGProps<SVGSVGElement>>> = {
  badge_spotlight: MedalIcon,
  progress_nudge: HourglassIcon,
  mission_spotlight: TargetIcon,
  itembook_milestone: BookIcon,
  location_trend: PinIcon,
  drop_alert: PackageIcon,
  editorial_article: NewspaperIcon,
  ranking_board: RankingIcon,
}

/**
 * 커버 이미지 결정 — `cover_image_url`이 없으면 첫 배지 이미지를 승격한다.
 *
 * 승격된 이미지가 **아직 못 받은 배지**면 색을 빼서(grayscale) 보유하지 않았음을 말한다
 * (티켓 20260905_0038 B / 2026-09-06 확정 규칙 — 실루엣으로 감추지 않는다).
 * 어드민이 직접 올린 `cover_image_url`은 배지 아트가 아니므로 손대지 않는다.
 */
function resolveCover(card: TodayCardWithHref): { src: string | null; dimmed: boolean } {
  if (card.cover_image_url) return { src: card.cover_image_url, dimmed: false }
  const first = card.resolved_badges[0]
  if (!first?.image_url) return { src: null, dimmed: false }
  return { src: first.image_url, dimmed: !first.earned }
}

/**
 * 게재용 설명문(티켓 20260929_1335) — 부제 아래 14px 한 덩어리 문단, 2줄까지 보이고 넘치면 말줄임.
 * 값이 없거나 공백뿐이면 null이라 아무것도 그리지 않는다(이전과 DOM 동일). shortcut 레이아웃은
 * truncate 한 줄 구조라 이 값을 쓰지 않는다. 간격은 부제가 있으면 mt-2, 없으면 제목 바로 아래 mt-1.
 */
function getDescription(card: TodayCardWithHref): string | null {
  const text = card.description?.trim()
  return text ? text : null
}

function descriptionMargin(card: TodayCardWithHref): string {
  return card.subtitle ? 'mt-2' : 'mt-1'
}

const DESCRIPTION_TEXT = 'text-[length:var(--text-small)] leading-[var(--leading-small)] line-clamp-2 break-words'

/** 큰 썸네일형 — 커버 이미지(없으면 첫 배지 이미지) 크게 + 제목/부제 */
function LargeThumbnailCard({ card }: { card: TodayCardWithHref }) {
  const { src: cover, dimmed } = resolveCover(card)
  return (
    <Card
      tone="inverse"
      className="overflow-hidden jam-press"
      style={{ padding: 0 }}
    >
      {/* 20260824_004: cover_image_url은 어드민 자유 입력이라 호스트를 알 수 없다.
          next/image에 그대로 넘기면 미등록 호스트에서 홈 화면 전체가 죽는다 → SafeImage 경유 */}
      <SafeImage
        src={cover}
        alt={card.title}
        containerClassName="relative w-full aspect-[16/9] overflow-hidden"
        className={dimmed ? 'object-cover grayscale' : 'object-cover'}
      />
      <div className="p-[var(--spacing-24)]">
        <div className="flex items-center gap-2 mb-2">
          <LabelChip>{templateLabel[card.template_type]}</LabelChip>
          {card.template_type === 'location_trend' && card.region_label && (
            <span className="inline-flex items-center gap-1 text-[length:var(--text-caption)] text-text-inverse/60">
              <PinIcon className="w-3 h-3" />{card.region_label}
            </span>
          )}
        </div>
        <h3 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)]">{card.title}</h3>
        {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-1">{card.subtitle}</p>}
        {getDescription(card) && (
          <p className={`${DESCRIPTION_TEXT} text-text-inverse/60 ${descriptionMargin(card)}`}>{getDescription(card)}</p>
        )}
        <p className="text-[length:var(--text-caption)] text-text-inverse/40 mt-3">
          {card.template_type === 'editorial_article' ? d.today.cardReadArticle : d.today.cardReadMore} &rarr;
        </p>
      </div>
    </Card>
  )
}

/** 배지목록형 — 배지 여러 개를 가로 갤러리로 나열 */
function BadgeGalleryCard({ card }: { card: TodayCardWithHref }) {
  return (
    <Card tone="inverse" className="jam-press">
      <div className="flex items-center gap-2 mb-2">
        <LabelChip>{templateLabel[card.template_type]}</LabelChip>
        {card.region_label && (
          <span className="inline-flex items-center gap-1 text-[length:var(--text-caption)] text-text-inverse/60">
            <PinIcon className="w-3 h-3" />{card.region_label}
          </span>
        )}
      </div>
      <h3 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)]">{card.title}</h3>
      {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-1">{card.subtitle}</p>}
      {getDescription(card) && (
        <p className={`${DESCRIPTION_TEXT} text-text-inverse/60 ${descriptionMargin(card)}`}>{getDescription(card)}</p>
      )}

      {card.resolved_badges.length > 0 && (
        <div className="flex gap-[var(--spacing-16)] mt-[var(--spacing-16)] overflow-x-auto pb-1">
          {card.resolved_badges.map((b) => (
            <div key={b.id} className="flex flex-col items-center gap-1 shrink-0 w-16">
              {/* 20260816_012: 보더 제거 — 흰 카드 위 썸네일이라 4% 블랙 틴트로 구분 */}
              {/* 미획득 배지는 색을 빼서 보유하지 않았음을 말한다(20260905_0038 B) */}
              <div className="w-16 h-16 rounded-[var(--radius-cards)] bg-black/[0.04] overflow-hidden flex items-center justify-center">
                <SafeImage
                  src={b.image_url}
                  alt={b.name}
                  width={64}
                  height={64}
                  className={b.earned ? 'w-full h-full object-cover' : 'w-full h-full object-cover grayscale'}
                  fallback={<MedalIcon className="w-6 h-6 text-text-inverse/40" />}
                />
              </div>
              <span className="text-[length:var(--text-caption)] text-text-inverse/70 text-center leading-tight line-clamp-2">{b.name}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[length:var(--text-caption)] text-text-inverse/40 mt-3">{d.today.cardViewAll} &rarr;</p>
    </Card>
  )
}

/** 바로가기형 — 이미지 없이 짧은 CTA 한 줄 */
function ShortcutCard({ card }: { card: TodayCardWithHref }) {
  const Icon = TemplateIcon[card.template_type]
  return (
    <Card tone="inverse" className="p-[var(--spacing-16)] flex items-center gap-[var(--spacing-16)] jam-press">
      <div className="w-11 h-11 rounded-[var(--radius-cards)] bg-black/[0.04] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-text-inverse/60" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">{card.title}</h3>
        {card.subtitle && <p className="text-[length:var(--text-caption)] text-text-inverse/60 truncate">{card.subtitle}</p>}
      </div>
      <span className="text-text-inverse/30 shrink-0" aria-hidden="true">&rsaquo;</span>
    </Card>
  )
}

/**
 * 배너형 — 4:5 비율 포스터 배너, 이미지 위 텍스트 오버레이(하단 그라디언트).
 * 커버 이미지가 없으면 일반 카드로 대체(스크림은 사진 전제이므로 이미지 없이 쓰면 배경이
 * 무의미하게 어두워짐).
 *
 * 20260824_004: "커버가 없는 경우"와 달리 "커버는 있는데 로드에 실패한 경우"는 서버 렌더
 * 시점에 알 수 없어 OtherCard로 대체할 수 없다(이 컴포넌트는 서버 컴포넌트다). 대신
 * SafeImage의 fallback으로 어두운 플레이트를 깔아 스크림 전제를 유지한다 — 이게 없으면
 * 흰 배경(bg-surface-inverse) 위에 검은 스크림과 흰 텍스트가 남아 부제 대비가 무너진다.
 */
function BannerCard({ card }: { card: TodayCardWithHref }) {
  const { src: cover, dimmed } = resolveCover(card)

  if (!cover) {
    return <OtherCard card={card} />
  }

  return (
    <article className="relative rounded-[var(--radius-cards)] overflow-hidden aspect-[4/5] jam-press bg-surface-inverse">
      <SafeImage
        src={cover}
        alt={card.title}
        containerClassName="absolute inset-0"
        className={dimmed ? 'object-cover grayscale' : 'object-cover'}
        fallback={<div className="absolute inset-0 bg-black" aria-hidden="true" />}
      />
      {/* 흑백 스크림 — 사진 위 텍스트 가독성 확보용 기능적 처리(브랜드 그라데이션 아님, 컬러 도입 없음) */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-[var(--spacing-24)] pt-10 pb-[var(--spacing-24)]">
        <div className="mb-2">
          <LabelChip>{templateLabel[card.template_type]}</LabelChip>
        </div>
        <h3 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-white">{card.title}</h3>
        {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-white/80 mt-1">{card.subtitle}</p>}
        {getDescription(card) && (
          <p className={`${DESCRIPTION_TEXT} text-white/80 ${descriptionMargin(card)}`}>{getDescription(card)}</p>
        )}
      </div>
    </article>
  )
}

/** 기타 — 위 4종에 안 맞는 콘텐츠를 위한 기본형(이미지 없는 담백한 카드) */
function OtherCard({ card }: { card: TodayCardWithHref }) {
  return (
    <Card tone="inverse" className="jam-press">
      <div className="mb-2"><LabelChip>{templateLabel[card.template_type]}</LabelChip></div>
      <h3 className="text-[length:var(--text-body)] leading-[var(--leading-body)]">{card.title}</h3>
      {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-1">{card.subtitle}</p>}
      {getDescription(card) && (
        <p className={`${DESCRIPTION_TEXT} text-text-inverse/60 ${descriptionMargin(card)}`}>{getDescription(card)}</p>
      )}
      <p className="text-[length:var(--text-caption)] text-text-inverse/40 mt-3">{d.today.cardReadMore} &rarr;</p>
    </Card>
  )
}

/**
 * 순위 리스트형 — 랭킹보드 전용(티켓 20260911_1440). 미션 상세 화면의 순위 리스트를 재사용하되
 * 1·2·3위 강조 포디엄 그래프는 뺀다(User Story 12). `resolved_ranking`은 서버(`lib/today/cards.ts`)가
 * 이미 계산해 넘긴 값 — 이 컴포넌트는 그리기만 한다.
 *
 * 다른 레이아웃과 달리 카드 전체를 `<Link>`로 감싸지 않는다 — 순위 행(`RankingListRow`)이 각자
 * 유저 프로필로 이동하는 `<Link>`를 대상 방식과 무관하게 이미 갖고 있어(User Story 11, 미션
 * 상세 화면과 동일 동작), 카드 전체를 감싸면 앵커 안에 앵커가 중첩되는 무효 마크업이 된다.
 *
 * 제목 영역은 대상이 미션 참가자일 때만(`ranking.metricType === 'mission_progress'` — 대상
 * 선정이 미션 참가자일 때만 정렬 지표가 이 값으로 고정된다, `lib/admin/ranking-modes.ts`의
 * `buildRankingModeSavePayload` 참고) 그 미션의 기존 랭킹 화면(`resolved_href`, User Story 10)
 * 으로 링크한다. 유저 직접 지정 랭킹은 탭해도 이동할 "더 자세히 볼" 기존 화면이 없어(Out of
 * Scope — 랭킹모드를 투데이카드 밖에 노출하지 않음) 제목 영역에 아무 링크도 걸지 않는다
 * (2026-09-11 게이트 리뷰 WARN 대응 — 이전에는 `/missions` 목록으로 보냈었다).
 *
 * `preview`면 트래커와 제목 링크를 그리지 않고, 순위 행도 링크 없이 그린다(`TodayCardStack`의
 * `preview` 설명 참고). 순위 행은 `username`이 null이면 링크 없는 행이 된다(탈퇴 유저와 같은 처리).
 */
function RankingListCard({
  card,
  currentUserId,
  preview,
}: {
  card: TodayCardWithHref
  currentUserId?: string
  preview: boolean
}) {
  const ranking = card.resolved_ranking
  const entries = ranking?.entries ?? []
  const maxValue = entries[0]?.value ?? 0
  const formatValue = (v: number) =>
    ranking
      ? formatRankingMetricValue(ranking.metricType, v, {
          missionType: ranking.missionType,
          conditionFieldKey: ranking.conditionFieldKey,
        })
      : String(v)
  const isMissionTarget = ranking?.metricType === 'mission_progress'
  const header = (
    <>
      <div className="mb-2"><LabelChip>{templateLabel[card.template_type]}</LabelChip></div>
      <h3 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)]">{card.title}</h3>
      {card.subtitle && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-1">{card.subtitle}</p>}
      {getDescription(card) && (
        <p className={`${DESCRIPTION_TEXT} text-text-inverse/60 ${descriptionMargin(card)}`}>{getDescription(card)}</p>
      )}
    </>
  )

  return (
    <Card tone="inverse">
      {preview ? (
        <div>{header}</div>
      ) : isMissionTarget ? (
        // ranking_list 카드는 클릭이 행별 링크(유저 프로필)에서 일어나므로 카드 단위
        // 클릭은 세지 않는다(노출만 추적, 티켓 20260924_0004).
        <TodayCardTracker cardId={card.id} trackClick={false}>
          <Link href={card.resolved_href} className="block jam-press">
            {header}
          </Link>
        </TodayCardTracker>
      ) : (
        // 미션 대상이 아닌 랭킹보드 카드도 노출은 집계한다(티켓 20260924_0112). 트래커는 자식을
        // 감싸는 <div> 하나만 렌더하므로 기존 <div>{header}</div>와 DOM 구조가 같다.
        <TodayCardTracker cardId={card.id} trackClick={false}>
          {header}
        </TodayCardTracker>
      )}

      {entries.length > 0 ? (
        <div className="flex flex-col mt-[var(--spacing-16)]">
          {entries.map((entry) => (
            <RankingListRow
              key={entry.userId}
              entry={preview ? { ...entry, username: null } : entry}
              maxValue={maxValue}
              isMe={entry.userId === currentUserId}
              formatValue={formatValue}
            />
          ))}
        </div>
      ) : (
        <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-2">
          {d.todayCard.rankingEmpty}
        </p>
      )}
    </Card>
  )
}

/** `ranking_list`를 뺀 레이아웃 선택 — 홈과 미리보기가 같은 본문을 그린다(감싸는 쪽만 다르다) */
function CardBody({ card }: { card: TodayCardWithHref }) {
  return card.layout_type === 'badge_gallery' ? <BadgeGalleryCard card={card} />
    : card.layout_type === 'shortcut' ? <ShortcutCard card={card} />
    : card.layout_type === 'banner' ? <BannerCard card={card} />
    : card.layout_type === 'other' ? <OtherCard card={card} />
    : <LargeThumbnailCard card={card} />
}

/**
 * 투데이 카드 스택 (홈 화면 최상단). 카드 0개면 아무것도 렌더링하지 않는다.
 * layout_type에 따라 서로 다른 UI로 렌더링(콘텐츠 종류인 template_type과는 별개 축).
 * 카드 클릭 시 resolved_href 로 이동 (editorial_article은 /today/[id]).
 *
 * 모양(`shape`)이 저장된 카드 중 새 틀(`components/today`)이 그리는 모양(지금은 `brief`)은 새 틀로 그린다(티켓 20261001_1458).
 * 그 밖의 카드는 위 옛 렌더러가 그린다 — 조각 b7이 옛 카드까지 새 모양으로 전환하고 옛 렌더러를 지운다.
 */
export default function TodayCardStack({
  cards,
  currentUserId,
  preview = false,
}: {
  cards: TodayCardWithHref[]
  /** 랭킹보드 카드(ranking_list 레이아웃)에서 내 순위 행을 강조하는 데 쓴다(선택 — 없으면 강조 없음) */
  currentUserId?: string
  /**
   * 어드민 미리보기(티켓 20260930_1645). true면 모양만 그리고 노출·클릭 계측(`TodayCardTracker`)과
   * 이동(카드 `<Link>`, 순위 행 링크)을 모두 걸지 않는다 — 어드민이 미리 보는 것이 실제 노출
   * 수치에 섞이지 않게 하고, 눌러도 서비스 화면으로 이동하지 않게 한다. 홈은 기본값(false)이라 그대로다.
   */
  preview?: boolean
}) {
  if (!cards || cards.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-[var(--spacing-16)]">
        <h2 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)]">{d.today.cardStackTitle}</h2>
        <span className="text-[length:var(--text-caption)] text-text-inverse/40">{d.today.cardStackSubtitle}</span>
      </div>

      <div className="flex flex-col gap-[var(--spacing-16)]">
        {cards.map((card) => {
          // 새 틀로 그릴지 한 곳에서 정한다(티켓 20261001_1458). 그려질 모양(`drawnShape`)이 없으면(`shape`가 없는 옛 카드 + 전환 상수가
          // 꺼진 동안) 옛 렌더러다. 있으면 표시 데이터의 모양이 새 틀이 그리는 모양(`RENDERED_SHAPES`)일 때만 새 틀로 간다 — 표시 데이터의
          // 모양을 보는 이유는 기록 모양(`events.ts`)과 같은 규칙(타일 0개 `list` → `brief`)을 적용하려는 것이다('화면 모양 = 기록 모양').
          // 새 틀은 표시 데이터에 계측 정보가 있어야 트래커·링크를 그리므로 미리보기(`preview`)면 싣지 않는다.
          const shape = drawnShape(card)
          const view = shape ? toCardView(card, { tracking: !preview }) : null
          if (view && isRenderedShape(view.shape)) return <TodayCard key={card.id} view={view} />

          // 아래는 옛 렌더러다(조각 b7에서 지운다).
          // ranking_list는 행마다 자체 <Link>(유저 프로필)를 가지므로 공통 카드 래핑
          // <Link>를 건너뛴다 — 중첩 앵커 방지(RankingListCard 주석 참고).
          return card.layout_type === 'ranking_list' ? (
            <RankingListCard key={card.id} card={card} currentUserId={currentUserId} preview={preview} />
          ) : preview ? (
            <div key={card.id} className="block">
              <CardBody card={card} />
            </div>
          ) : (
            <TodayCardTracker
              key={card.id}
              cardId={card.id}
              contentTypeId={card.content_type_id}
              templateType={card.template_type}
              shape={shape}
            >
              <Link href={card.resolved_href} className="block">
                <CardBody card={card} />
              </Link>
            </TodayCardTracker>
          )
        })}
      </div>
    </section>
  )
}
