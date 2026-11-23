import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import FeedCard from '@/components/today/feed/FeedCard'
import FeedCollectionCard from '@/components/today/feed/FeedCollectionCard'
import { feedColorVar, type FeedColorKey } from '@/lib/today/feedConstants'
import {
  PREVIEW_AUTO_COUNT,
  PREVIEW_TYPE_LABELS,
  buildAutoAssignment,
  buildBoxMatrix,
  buildMotion,
  buildStateMatrix,
  buildTypeSamples,
  formatChipSummary,
  type PreviewCell,
} from '@/lib/today/feedPreviewData'

/**
 * 샘플 전용 — 홈피드 새 카드 여덟 유형의 개발용 미리보기 (티켓 20261121_0155, 상위 20261120_2026 4회차-4).
 *
 * 옛 7모양 샘플(`../page.tsx`)과 별개 페이지다. 서비스 데이터(DB·세션·`getTodayCards`)를 읽지 않고 가짜 데이터(`lib/today/feedPreviewData.ts`)만으로
 * 실제 해석 함수와 실제 카드 컴포넌트를 그린다. 계측 정보(`tracking`)를 싣지 않아 노출·클릭 기록이 남지 않고 카드 전체 링크도 걸리지 않는다.
 * 링크가 없는 숨은 경로다(메뉴·홈 어디에도 연결하지 않는다). 데이터를 바꾸는 버튼은 그리지 않는다.
 * 구역: 유형 8개 · 박스 모양 5종 · 칩·도장·설명 숨김 상태 · 폭 320 화면 · 자동 배정 120장과 요약 · 컬렉션 모션.
 */

export const metadata: Metadata = {
  title: '홈피드 새 카드 미리보기',
  robots: { index: false, follow: false },
}

const TEXT = 'break-keep wrap-break-word'
const SECTION_TITLE = `text-balance text-xl font-bold text-foreground ${TEXT}`
const NOTE = `text-sm text-muted ${TEXT}`
const CAPTION = `text-sm font-bold text-foreground ${TEXT}`

const SECTIONS = [
  { id: 'types', title: '유형 8개' },
  { id: 'boxes', title: '박스 모양 5종' },
  { id: 'states', title: '칩·도장·설명 숨김' },
  { id: 'narrow', title: '폭 320 화면' },
  { id: 'auto', title: '자동 배정 120장' },
  { id: 'motion', title: '컬렉션 모션' },
] as const

function Card({ cell }: { cell: PreviewCell }) {
  return cell.phase ? <FeedCollectionCard view={cell.view} previewPhase={cell.phase} /> : <FeedCard view={cell.view} />
}

/** 이름표가 붙은 카드 한 칸. 카드 폭은 한 열 폭에서 좌우 여백을 뺀 값(폭 390 화면이면 358)이다. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className={CAPTION}>{label}</figcaption>
      {children}
    </figure>
  )
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-4 flex-col gap-4">
      <div className="flex flex-col gap-1 border-b border-foreground pb-2">
        <h2 id={`${id}-title`} className={SECTION_TITLE}>
          {title}
        </h2>
        {note && <p className={NOTE}>{note}</p>}
      </div>
      {children}
    </section>
  )
}

function ColorDot({ colorKey }: { colorKey: FeedColorKey }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden="true"
        className="inline-block size-4 shrink-0 rounded-full border border-foreground"
        style={{ backgroundColor: feedColorVar(colorKey) }}
      />
      <span>{colorKey}</span>
    </span>
  )
}

function ColorPair({ pair }: { pair: readonly [string, string] }) {
  const [a, b] = pair as readonly [FeedColorKey, FeedColorKey]
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <ColorDot colorKey={a} />
      <span aria-hidden="true">×</span>
      <ColorDot colorKey={b} />
    </span>
  )
}

export default function HomeFeedNewCardsPreviewPage() {
  const samples = buildTypeSamples()
  const boxRows = buildBoxMatrix()
  const stateRows = buildStateMatrix()
  const auto = buildAutoAssignment()
  const motion = buildMotion()
  const { summary } = auto

  return (
    <div className="min-h-full text-foreground">
      <div className="mx-auto flex w-full max-w-[390px] flex-col gap-6 px-4 pt-4 pb-6">
        <header className="flex flex-col gap-2">
          <h1 className={`text-balance text-2xl font-black text-foreground ${TEXT}`}>홈피드 새 카드 미리보기</h1>
          <p className={NOTE}>
            가짜 데이터로 그린 개발용 화면이에요. 서비스 데이터를 읽지 않고 노출·클릭도 기록하지 않아요. 폭 390 화면 기준 한 열이에요.
          </p>
          <nav aria-label="구역 바로가기" className="flex flex-wrap gap-2">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`} className={`rounded-full bg-surface px-3 py-1 text-sm text-foreground ${TEXT}`}>
                {section.title}
              </a>
            ))}
          </nav>
        </header>

        <Section id="types" title="유형 8개" note="유형마다 샘플 구성 하나씩이에요. 전체 배경 이미지는 서비스에서 꺼져 있어 이 페이지에서만 직접 그려요.">
          {samples.map((sample) => (
            <Cell key={sample.feedType} label={`${sample.name}: ${sample.note}`}>
              <Card cell={sample.cell} />
            </Cell>
          ))}
        </Section>

        <Section id="boxes" title="박스 모양 5종" note="박스가 있는 유형마다 둥근 모서리·티켓·우표·물결·돌출을 한 장씩 보여요.">
          {boxRows.map((row) => (
            <div key={row.name} className="flex flex-col gap-4">
              <h3 className={`text-lg font-bold text-foreground ${TEXT}`}>{row.name}</h3>
              {row.cells.map((cell) => (
                <Cell key={cell.label} label={cell.label}>
                  <Card cell={cell} />
                </Cell>
              ))}
            </div>
          ))}
        </Section>

        <Section
          id="states"
          title="칩·도장·설명 숨김"
          note="유형마다 칩 0·1·2개, 제목 속 칩, 도장, 설명 숨김 상태예요. 칩 한도가 모자라는 유형은 이름표에 한도를 적었어요."
        >
          {stateRows.map((row) => (
            <div key={row.feedType} className="flex flex-col gap-4">
              <h3 className={`text-lg font-bold text-foreground ${TEXT}`}>{row.name}</h3>
              {row.cells.map((cell) => (
                <Cell key={cell.label} label={cell.label}>
                  <Card cell={cell} />
                </Cell>
              ))}
            </div>
          ))}
        </Section>

        <Section id="narrow" title="폭 320 화면" note="화면 폭 320에서 카드 폭은 288이에요. 칩이 점선 화면 가장자리 안쪽에 있어야 해요.">
          <div className="flex flex-col gap-4">
            {samples.map((sample) => (
              <Cell key={sample.feedType} label={sample.name}>
                {/* 폭 320 화면을 흉내 내는 고정 틀: 안쪽 여백 16 + 카드 288 + 여백 16 */}
                <div className="border border-dashed border-foreground p-4" style={{ width: 320 }}>
                  <Card cell={sample.cell} />
                </div>
              </Cell>
            ))}
          </div>
        </Section>

        <Section
          id="auto"
          title={`자동 배정 ${PREVIEW_AUTO_COUNT}장`}
          note="시드가 서로 다른 카드를 유형 8개에 돌려 가며 색과 칩을 자동으로 정했어요. 칩 배치는 120장을 한 배열로 계산한 값이고, 위쪽 유형별 샘플은 앞 카드가 없는 기준이에요."
        >
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">자동 배정 요약</caption>
            <tbody>
              {[
                { name: '카드 수', value: summary.cardCount },
                { name: '규칙 위반', value: summary.ruleViolationCount },
                { name: '제외 조합과 겹침', value: summary.excludedOverlapCount },
                { name: '되돌림 기본 조합', value: summary.fallbackCount },
              ].map((row) => (
                <tr key={row.name} className="border-b border-foreground">
                  <th scope="row" className={`py-2 text-left font-bold ${TEXT}`}>
                    {row.name}
                  </th>
                  <td className="py-2 text-right font-black tabular-nums" data-summary={row.name}>
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={NOTE} data-summary="칩 배치">
            {formatChipSummary(summary.chips)}
          </p>
          <div className="flex flex-col gap-1">
            <p className={CAPTION}>제외 조합 예시(검수표에서 제외한 값으로 넣었어요)</p>
            <ul className="flex flex-col gap-1 text-sm">
              {summary.excludedPairs.map((pair) => (
                <li key={`${pair[0]}-${pair[1]}`}>
                  <ColorPair pair={pair} />
                </li>
              ))}
            </ul>
          </div>
          {auto.cards.map((card) => (
            <figure key={card.number} className="flex flex-col gap-2">
              <figcaption className="flex flex-col gap-1 text-sm">
                <span className={`font-bold text-foreground ${TEXT}`}>
                  {`${String(card.number).padStart(3, '0')} · ${PREVIEW_TYPE_LABELS[card.feedType]} · 시드 ${card.seed}`}
                  {card.violatedRules.length > 0 ? ` · 규칙 위반 ${card.violatedRules.join('·')}` : ''}
                  {card.overlapsExcluded ? ' · 제외 조합과 겹침' : ''}
                  {card.usedFallback ? ' · 되돌림' : ''}
                </span>
                <span className="flex flex-wrap gap-2 text-muted">
                  <ColorDot colorKey={card.view.look.colors.bg} />
                  <ColorDot colorKey={card.view.look.colors.chip} />
                  <ColorDot colorKey={card.view.look.colors.box} />
                </span>
              </figcaption>
              <FeedCard view={card.view} />
            </figure>
          ))}
        </Section>

        <Section id="motion" title="컬렉션 모션" note="모인 상태와 퍼진 상태를 고정해 보여요. 마지막 카드는 스크롤하면 실제로 재생돼요. 동작 줄이기를 켜면 퍼진 상태로 있어요.">
          {[motion.collected, motion.spread, motion.fewBadges, motion.scrolling].map((cell) => (
            <Cell key={cell.label} label={cell.label}>
              <Card cell={cell} />
            </Cell>
          ))}
        </Section>
      </div>
    </div>
  )
}
