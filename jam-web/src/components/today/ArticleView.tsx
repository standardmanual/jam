import Link from 'next/link'
import { LabelChip } from '@ds/components/cards/LabelChip'
import LocalDate from '@/components/LocalDate'
import SafeImage from '@/components/SafeImage'
import { d } from '@/lib/i18n'
import type { ArticleView as ArticleViewData } from '@/lib/today/articleView'

/**
 * 기사 화면 본문 — 커버부터 CTA까지 (티켓 20261001_1737, 상위 20260930_1453 조각 b3 확정 설계 7·8절).
 *
 * 표시 데이터(`ArticleView`) 값만 읽어 그린다. 카드 행·`getPublishedArticleCard`·DB 모듈은 모른다(운영툴 미리보기, 티켓 20261001_1501이 같은 화면을 쓴다).
 * 상단 TopNav는 이 컴포넌트 밖(페이지)에 둔다 — TopNav가 `sticky`라 커버 위로 스크롤돼도 읽힌다. 계측은 없다(PRD §8).
 *
 * - 커버가 없으면(`coverUrl` 없음) 16:9 칸을 만들지 않고 TopNav 바로 아래 `pt-24`부터 칩이 시작한다. 커버 주소가 있는데 로드에 실패하면
 *   `SafeImage` 기본 동작대로 칸이 사라진다. 커버 `alt`는 빈 값이다 — 바로 아래 제목(h1)이 글자로 보이기 때문이다.
 * - 옅은 글자(부제·게재일·「본문이 없어요」)는 `text-muted`다(크림 바탕 위 5.47:1, AA). 불투명도로 글자색을 만들지 않는다.
 * - CTA 알약은 어두운 반전 면(`--background-inverse`) 위 `text-snow`다 — 면이 어두운 곳이라 글자가 `--snow`인 것이 맞는 짝이다(티켓 20261015_2133).
 * - CTA는 `cta.href`가 있으면 링크, 없으면 같은 모양의 정적 필(링크·눌림·transition 없음)이다. `cta` 자체가 없으면 블록이 없다 — 둘은 다른 상태다.
 */

// Button.tsx variant="primary" surface="main" 레시피를 그대로 복사 — <a> 안에 <button>을 중첩할 수 없어 Button 컴포넌트 대신 className을 재사용한다(티켓 20260924_0107).
// 정적 필(링크 없음)은 같은 모양에서 눌림(`transition-transform duration-100 active:scale-95`)만 뺀다.
const CTA_HEAD = 'inline-flex items-center justify-center gap-2 min-h-11 w-full font-normal'
const CTA_PRESS = 'transition-transform duration-100 active:scale-95'
const CTA_TAIL =
  'rounded-full px-8 py-[14px] text-base text-snow'
const CTA_STYLE = { backgroundColor: 'var(--background-inverse)' }

export default function ArticleView({ view }: { view: ArticleViewData }) {
  const { cta } = view

  return (
    <div className="text-foreground pb-10">
      {/* 20260824_004: 홈 카드와 같은 cover_image_url(어드민 자유 입력)이라 SafeImage 경유.
          앱 열이 최대 430px이라 `sizes`를 주지 않으면 100vw로 가정해 과대 다운로드한다 */}
      {view.coverUrl && (
        <SafeImage
          src={view.coverUrl}
          alt=""
          priority
          sizes="(min-width: 430px) 430px, 100vw"
          containerClassName="relative w-full aspect-video overflow-hidden"
          className="object-cover"
        />
      )}

      <article className="px-4 pt-6">
        {/* 칩은 inline-flex라 article(block) 안에 바로 두면 줄 상자 여백(실측 1px)이 생겨 flex 칸으로 한 번 감싼다 */}
        <div className="flex">
          <LabelChip tone="inverse">{view.label}</LabelChip>
        </div>

        <h1 className="text-3xl mt-4">{view.title}</h1>
        {view.subtitle && (
          <p className="text-base text-muted mt-2">{view.subtitle}</p>
        )}
        {view.publishedAt && (
          <p className="text-xs text-muted mt-4">
            <LocalDate iso={view.publishedAt} options={{ year: 'numeric', month: 'long', day: 'numeric' }} />
          </p>
        )}

        <div className="mt-6 flex flex-col gap-4">
          {view.paragraphs.length > 0 ? (
            view.paragraphs.map((paragraph, index) => (
              <p key={index} className="text-base text-foreground whitespace-pre-line">
                {paragraph}
              </p>
            ))
          ) : (
            <p className="text-muted">{d.todayCard.noBody}</p>
          )}
        </div>

        {cta && (
          <div className="mt-6">
            {cta.href ? (
              <Link href={cta.href} className={`${CTA_HEAD} ${CTA_PRESS} ${CTA_TAIL}`} style={CTA_STYLE}>
                {cta.label}
              </Link>
            ) : (
              <div className={`${CTA_HEAD} ${CTA_TAIL}`} style={CTA_STYLE}>
                {cta.label}
              </div>
            )}
          </div>
        )}
      </article>
    </div>
  )
}
