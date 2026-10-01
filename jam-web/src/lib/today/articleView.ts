/**
 * 기사 화면 표시 데이터 변환 (티켓 20261001_1737, 상위 20260930_1453 조각 b3 확정 설계 7·8절)
 *
 * 기사 카드 행(서버 조회 결과)을 「기사 표시 데이터」(`ArticleView`)로 바꾼다. 홈 카드의 `toCardView`와 같은 원칙이다 — 카드 ID·활성 여부·노출 기간 없이
 * 만들 수 있는 화면용 값 묶음이라, 기사 화면(`/today/[cardId]`)과 운영툴 미리보기(티켓 20261001_1501)가 같은 함수로 같은 화면을 그린다.
 *
 * 순수 파일이다: 서버 모듈(`cards.ts`)을 불러오지 않는다(클라이언트 컴포넌트도 읽는다). 카드 행은 타입으로만 받는다.
 * 이 함수가 기사 본문 규칙을 한 곳에 둔다 — 문단 나누기, CTA 우선순위(`resolveArticleCtaTarget`)와 라벨(`d.todayCard.ctaView*`).
 */
import type { TodayCardRow } from '@/types/database'
import { d } from '@/lib/i18n'
import { resolveArticleCtaTarget } from './targetHref'

/** 기사 화면 본문 끝 CTA. `href`가 없으면 그리는 쪽이 링크가 아닌 정적 필로 그린다(미리보기). */
export interface ArticleViewCta {
  label: string
  href?: string
}

/** 기사 화면이 그리는 값. 필수 값은 `title`·`label`·`paragraphs`다. */
export interface ArticleView {
  title: string
  /** 칩 라벨(템플릿 이름 「기사」). */
  label: string
  subtitle?: string
  /** 커버 이미지 주소. 공백·빈 값이면 없다(그리는 쪽이 16:9 칸 없이 본문부터 그린다). */
  coverUrl?: string
  /** 게재일(ISO, `starts_at`). 그리는 쪽이 「2026년 10월 5일」로 보인다. */
  publishedAt?: string
  /** 빈 줄 기준으로 나누고 trim·빈 문단 제거를 마친 본문 문단. 빈 배열이면 그리는 쪽이 「본문이 없어요」를 보인다. */
  paragraphs: string[]
  /** 대상(`target_href` → `item_book_id` → `mission_id`)이 하나도 없으면 없다 — CTA 블록 자체를 그리지 않는다. */
  cta?: ArticleViewCta
}

/** `toArticleView`가 읽는 카드 행의 칸. 미리보기 초안처럼 전체 행이 없어도 만들 수 있다. */
export type ArticleViewSource = Pick<
  TodayCardRow,
  'title' | 'subtitle' | 'cover_image_url' | 'starts_at' | 'body_markdown' | 'target_href' | 'item_book_id' | 'mission_id'
>

export interface ToArticleViewOptions {
  /** true면 CTA의 `href`를 싣지 않는다 — 링크 없는 미리보기가 같은 모양의 정적 필로 그리게 한다. CTA 자체(라벨)는 그대로 있다. */
  linkless?: boolean
}

/**
 * 본문을 문단으로 나눈다. 마크다운 파서 없이 빈 줄 기준으로만 나누고(신규 의존성 없음), 문단 안의 단일 줄바꿈은 그대로 둔다
 * (그리는 쪽이 `whitespace-pre-line`으로 보존한다). 앞뒤 공백을 자르고 빈 문단은 버린다.
 */
export function splitParagraphs(body: string | null | undefined): string[] {
  return (body ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

function nonBlank(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const CTA_LABEL = {
  collection: d.todayCard.ctaViewCollection,
  mission: d.todayCard.ctaViewMission,
  direct: d.todayCard.ctaViewDetails,
} as const

/** 기사 카드 행을 기사 화면 표시 데이터로 바꾼다. */
export function toArticleView(row: ArticleViewSource, options: ToArticleViewOptions = {}): ArticleView {
  const view: ArticleView = {
    title: row.title,
    label: d.todayCard.editorialArticle,
    paragraphs: splitParagraphs(row.body_markdown),
  }

  const subtitle = nonBlank(row.subtitle)
  if (subtitle) view.subtitle = subtitle
  const coverUrl = nonBlank(row.cover_image_url)
  if (coverUrl) view.coverUrl = coverUrl
  if (row.starts_at) view.publishedAt = row.starts_at

  const target = resolveArticleCtaTarget(row)
  if (target) {
    view.cta = { label: CTA_LABEL[target.kind] }
    if (!options.linkless) view.cta.href = target.href
  }

  return view
}
