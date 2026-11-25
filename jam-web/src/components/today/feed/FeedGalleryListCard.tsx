import Link from 'next/link'
import type { ReactNode } from 'react'
import SafeImage from '@/components/SafeImage'
import type { FeedCardView, FeedCardViewListItem } from '@/lib/today/cardView'
import { FEED_CARD_MIN_HEIGHT, FEED_GALLERY, feedColorVar, feedTextOnBg } from '@/lib/today/feedConstants'
import { d, t } from '@/lib/i18n'
import { isSafeListHref } from '@/lib/today/listHref'
import FeedChip from '../FeedChip'
import { FeedCardShell, FeedTextBlock } from './FeedCardParts'

/**
 * 목록형(`gallery_list`) — 위에 제목·설명, 아래에 4칸 한 줄 갤러리(항목 최대 3개와 «→» 화살표 칸) (티켓 20261121_0115).
 *
 * 샘플: 카드 최소 높이 260(내용이 늘면 늘어난다), 칸 4개(`grid-cols-4`, 칸 간격 8). 항목 칸은 정사각(`aspect-square`)·모서리 12(`rounded-xl`)·면 색은 박스 색, 안에 그림(없으면 항목 이름 글자),
 * 아래에 이름 12px 굵게 두 줄까지. 마지막 칸은 검정 바탕 정사각 안의 «→»이고 `listMoreHref`로 간다(주소가 없으면 그리지 않는다). 항목이 3개보다 적으면 화살표 칸이 앞으로 당겨진다(빈 칸이 없다).
 * 폭 390 화면(카드 358)에서 칸 하나는 (326 − 칸 간격 24) ÷ 4 ≈ 75px, 폭 320 화면(카드 288)에서도 58px라 터치 영역 44px을 채운다. 칩(`card-top-right`)은 제목 위에 따로 둔 칩 줄의 오른쪽 끝에 앉는다(칩이 있을 때만 줄이 생겨 카드가 그만큼 높아지고, 긴 제목을 가리지 않는다).
 *
 * **링크와 계측**: 카드 전체에는 링크를 걸지 않는다(조립 `FeedCard`가 `CardFrame`에 `link={false}`를 준다). 항목마다 자기 링크가 있고 클릭은 카드 클릭으로 기록된다(`CardFrame`의 `trackLinkClicks`).
 * 주소(`href`·`listMoreHref`)는 내부 경로(`/`로 시작하고 `//`·`/\`로 시작하지 않는 값) 또는 `https://`로 시작하는 값만 링크로 그린다(`isSafeListHref`). 그 밖이면 항목은 링크 없이 그리고 화살표 칸은 그리지 않는다.
 * 계측 정보(`view.tracking`)가 없는 미리보기에서는 항목이 링크가 아니라 글자·그림만 그려 눌러도 이동하지 않는다(다른 유형의 미리보기와 같다).
 * 화살표 칸의 접근성 이름은 «{제목} 전체 보기»이고 항목 칸은 아래 이름 글자가 곧 이름이다(그림은 장식이라 `alt`가 비어 있다).
 */

const CELL_CLASS = 'flex flex-col gap-1'
/** `CardFrame`의 `CardLink`와 같은 눌림·키보드 포커스 윤곽선(`--link`)을 칸 단위로 건다. 윤곽선이 칸 모서리를 따라 둥글게 그려지도록 `rounded-xl`이다. */
const LINK_CLASS =
  'rounded-xl jam-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--link)]'
const NAME_CLASS = 'line-clamp-2 text-center text-xs font-bold break-keep wrap-break-word'
const TILE_CLASS = 'relative flex aspect-square items-center justify-center overflow-hidden rounded-xl'

/** 주소 안전 규칙은 순수 파일(`lib/today/listHref.ts`)로 옮겼다. 기존 가져오기가 깨지지 않게 같은 이름으로 다시 내보낸다(티켓 20261121_1530). */
export { isSafeListHref }

/** 칸 하나: 링크로 그릴 수 있으면(`href`) `Link`, 아니면 같은 모양의 `div`. */
function Cell({ href, label, children }: { href?: string; label?: string; children: ReactNode }) {
  if (!href) return <div className={CELL_CLASS}>{children}</div>
  return (
    <Link href={href} aria-label={label} className={`${CELL_CLASS} ${LINK_CLASS}`}>
      {children}
    </Link>
  )
}

function ItemCell({ view, item }: { view: FeedCardView; item: FeedCardViewListItem }) {
  return (
    <Cell href={view.tracking && isSafeListHref(item.href) ? item.href : undefined}>
      <span className={TILE_CLASS} style={{ backgroundColor: feedColorVar(view.look.colors.box) }}>
        <SafeImage
          src={item.imageUrl}
          alt=""
          sizes="75px"
          className="object-cover"
          fallback={<span aria-hidden="true" className="px-1 text-center text-xs font-bold text-foreground break-keep wrap-break-word">{item.name}</span>}
        />
      </span>
      <span className={NAME_CLASS} style={{ color: feedTextOnBg(view.look.colors.bg) }}>
        {item.name}
      </span>
    </Cell>
  )
}

function MoreCell({ view, href }: { view: FeedCardView; href: string }) {
  const label = t(d.todayCard.feedListViewAll, { title: view.title.replace(/\s+/g, ' ').trim() })
  return (
    <Cell href={view.tracking ? href : undefined} label={view.tracking ? label : undefined}>
      <span className={`${TILE_CLASS} bg-foreground text-snow`}>
        <svg
          viewBox="0 0 24 24"
          width={FEED_GALLERY.arrowIconSize}
          height={FEED_GALLERY.arrowIconSize}
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        {!view.tracking && <span className="sr-only">{label}</span>}
      </span>
    </Cell>
  )
}

/** 칩 줄: `card-top-right` 자리의 칩만 제목 위 줄의 오른쪽 끝에 흐름대로 놓는다(절대 위치가 아니라 제목과 겹치지 않는다). 이 밖의 자리 이름은 이 유형이 그리지 않고, 그릴 칩이 없으면 줄도 없다. */
function ChipRow({ view }: { view: FeedCardView }) {
  const chips = view.look.chips.filter((chip) => chip.slot === 'card-top-right')
  if (chips.length === 0) return null
  return (
    <div className="flex justify-end gap-2">
      {chips.map((chip, index) => (
        <FeedChip key={index} variant="corner" size={chip.size} color={chip.color} tilt={chip.tilt}>
          {chip.text}
        </FeedChip>
      ))}
    </div>
  )
}

export default function FeedGalleryListCard({ view }: { view: FeedCardView }) {
  const items = (view.listItems ?? []).slice(0, FEED_GALLERY.maxItems)
  return (
    <FeedCardShell view={view} minHeight={FEED_CARD_MIN_HEIGHT.gallery_list} className="justify-between gap-4">
      <div className="flex flex-col gap-2">
        <ChipRow view={view} />
        <FeedTextBlock view={view} />
      </div>
      <div className="grid grid-cols-4 items-start gap-2">
        {items.map((item, index) => (
          <ItemCell key={index} view={view} item={item} />
        ))}
        {isSafeListHref(view.listMoreHref) ? <MoreCell view={view} href={view.listMoreHref} /> : null}
      </div>
    </FeedCardShell>
  )
}
