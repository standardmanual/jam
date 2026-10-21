import type { ReactNode } from 'react'
import LegalTopNav from '../LegalTopNav'
import InlineNotice from '@/components/ui/InlineNotice'
import {
  loadProbabilityDisclosure,
  type AmbientDisclosure,
  type DisclosureResult,
  type DisclosureRow,
  type PolicyDisclosure,
} from '@/lib/probability/disclosure'

/**
 * 확률 안내 페이지 (티켓 20261021_1250 1회, 운영 로직 18.3·18.4절, 채원 사전 판정 2026-10-21).
 *
 * 확률이 들어간 보상(동기화로 받는 아이템 배지, 캡슐, 시스템 드랍)의 확률을 표로 모두 보이고 보정 장치도 접지 않고 적는다.
 * 로그인하지 않은 방문자도 열 수 있다(`proxy.ts` 공개 경로, `(legal)` 레이아웃은 인증 호출이 없다).
 *
 * 값은 `capsule_policy`·`jam_policy`·`ambient_drop_config`를 서버에서 읽어 만든다(`lib/probability/disclosure.ts`). 설정을 바꾸면 페이지도 바뀌어야
 * 하므로 `force-dynamic`이다. 읽지 못하면 코드 상수 사본으로 대신하지 않고 해당 섹션을 «지금 불러오지 못했어요»로 바꾼다(틀린 확률을 보이지 않는다).
 * 정책 두 표(동기화·캡슐·보정 장치 세 섹션)와 시스템 드랍은 따로 실패한다. 값이 없는 문장(확률이 없는 것, 변경 이력 머리 문장, 등급을 낮춰 고르는 규칙)은
 * 읽기가 실패해도 그대로 둔다.
 *
 * 서식은 `privacy/page.tsx`(티켓 20260901_2217)의 Section·P·Note·H3를 따라 이 페이지가 쓰는 것만 복사했다. 법 페이지의 공용 보조 컴포넌트를 뽑는 티켓
 * 20261021_1428이 끝나면 따라 옮긴다. 표 `ProbabilityTable`은 DS에 Table이 없고 DefCard(라벨 위·값 아래)는 등급 숫자를 나란히 비교하지 못해
 * 이 페이지 안에 둔 두 칸짜리 의미 있는 `<table>`이다(쓰는 곳 1곳이라 MODULAR 승격 대상이 아니다).
 *
 * 열기를 부추기지 않는다(운영 로직 5.2절): 개인별 남은 횟수, 계산기, 진입 애니메이션, 숫자 카운트업, 등급 색, 막대 그래프를 두지 않는다.
 * 법 페이지처럼 metadata는 두지 않는다(티켓 20261021_1448 소관).
 */
export const dynamic = 'force-dynamic'

const PAGE_TITLE = '확률 안내'

const UNAVAILABLE = '지금 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.'

/**
 * 바뀐 날짜 — 앱 상수, 최신이 위. `capsule_policy.updated_at`은 갱신 트리거가 없어 날짜로 쓸 수 없다.
 * 첫 줄(2026년 10월 21일)은 임시값이다. 시행일은 출시 전에 사용자가 확정한다(티켓 20261021_1250).
 * 확률을 바꾸는 티켓은 같은 변경에서 이 목록 맨 위에 한 줄을 더한다.
 */
const CHANGE_LOG: DisclosureRow[] = [{ label: '2026년 10월 21일', value: '확률 안내를 처음 열었어요' }]

/** 동기화와 캡슐이 같이 쓰는 문장 — 두 곳의 말이 갈리지 않게 상수 하나를 쓴다 */
const LOWERING_NOTE =
  '이 확률은 처음 뽑는 등급이에요. 그 등급에 받을 수 있는 아이템 배지가 없으면 한 등급씩 낮춰서 무작위로 골라요.'

const TRIBE_NOTE = '다른 트라이브의 것이 나올 때는 받을 수 있는 아이템 배지가 있는 다른 트라이브 가운데 무작위로 골라요.'

/**
 * 시스템 드랍은 동기화·캡슐과 낮추는 방식이 다르다 — 높은 등급에서 내려가지 않고 Common부터 올라가며 찾는다
 * (`lib/ambient-drop/rarity.ts`의 `fallbackPickBadge`, 정기 배포와 날짜 예약이 같은 함수를 쓴다).
 */
const AMBIENT_LOWERING_NOTE =
  '뽑힌 등급에 놓을 수 있는 아이템 배지가 없으면, Common부터 Rare, Epic, Mystic 순서로 찾아서 아이템 배지가 있는 첫 등급에서 무작위로 골라요.'

const AMBIENT_RANDOM_TEXT = '지금은 놓을 때마다 등급 비율을 무작위로 정해요. 그래서 고정된 확률 표가 없어요.'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-medium break-keep wrap-break-word text-balance">{title}</h2>
      {children}
    </section>
  )
}

function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-base leading-[var(--leading-reading)] text-foreground break-keep wrap-break-word text-pretty">
      {children}
    </p>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-base text-muted break-keep wrap-break-word text-pretty border-l-2 border-border pl-3">
      {children}
    </p>
  )
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="text-xl font-medium text-foreground break-keep wrap-break-word text-balance">{children}</h3>
}

/**
 * 라벨(th) 왼쪽, 값(td) 오른쪽의 두 칸짜리 표. 열이 둘뿐이라 앱 컬럼 320px에서도 가로 스크롤이 생기지 않는다.
 * 등급 이름은 색이 아니라 글자로만 구분한다. `nowrapValue`는 «84%»처럼 짧은 값 칸에만 쓴다(문장 값은 줄바꿈을 허용한다).
 */
function ProbabilityTable({ caption, rows, nowrapValue = false }: { caption: string; rows: DisclosureRow[]; nowrapValue?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface border border-border px-4">
      <table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-b-0">
              <th
                scope="row"
                className="py-3 pr-3 text-left align-top text-base font-normal text-foreground break-keep wrap-break-word"
              >
                {row.label}
              </th>
              <td
                className={`py-3 text-right align-top text-base font-medium tabular-nums text-foreground break-keep wrap-break-word${nowrapValue ? ' whitespace-nowrap' : ''}`}
              >
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 소제목 + 표 + (표를 한정하는) 문장. 소제목과 표는 가깝게 묶는다 */
function TableBlock({
  heading,
  caption,
  rows,
  nowrapValue,
  note,
}: {
  heading?: string
  caption: string
  rows: DisclosureRow[]
  nowrapValue?: boolean
  note?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {heading && <H3>{heading}</H3>}
      <ProbabilityTable caption={caption} rows={rows} nowrapValue={nowrapValue} />
      {note && <Note>{note}</Note>}
    </div>
  )
}

function Unavailable() {
  return <InlineNotice>{UNAVAILABLE}</InlineNotice>
}

function SyncSection({ policy }: { policy: DisclosureResult<PolicyDisclosure> }) {
  return (
    <Section title="동기화로 받는 아이템 배지">
      <P>동기화한 활동마다 받는 아이템 배지예요.</P>
      {policy.ok ? (
        <>
          <TableBlock heading="개수와 잠김" caption="동기화로 받는 아이템 배지의 개수와 잠김" rows={policy.data.sync.counts} />
          <TableBlock
            heading="등급"
            caption="동기화로 받는 아이템 배지의 등급 확률"
            rows={policy.data.sync.rarity}
            nowrapValue
            note={LOWERING_NOTE}
          />
        </>
      ) : (
        <>
          <Unavailable />
          <Note>{LOWERING_NOTE}</Note>
        </>
      )}
    </Section>
  )
}

function CapsuleSection({ policy }: { policy: DisclosureResult<PolicyDisclosure> }) {
  return (
    <Section title="캡슐">
      <P>잼을 채워서 여는 캡슐이에요.</P>
      {policy.ok ? (
        <>
          <TableBlock
            heading="개수, 소속, 잠김"
            caption="캡슐의 개수, 소속, 잠김"
            rows={policy.data.capsule.counts}
            note={TRIBE_NOTE}
          />
          <TableBlock
            heading="등급"
            caption="캡슐의 등급 확률"
            rows={policy.data.capsule.rarity}
            nowrapValue
            note={LOWERING_NOTE}
          />
        </>
      ) : (
        <>
          <Unavailable />
          <Note>{TRIBE_NOTE}</Note>
          <Note>{LOWERING_NOTE}</Note>
        </>
      )}
    </Section>
  )
}

function AmbientSection({ ambient }: { ambient: DisclosureResult<AmbientDisclosure> }) {
  return (
    <Section title="시스템 드랍">
      <P>JAM!이 장소에 놓는 아이템 배지의 등급 확률이에요.</P>
      {ambient.ok && ambient.data.mode === 'explicit' && (
        <TableBlock caption="시스템 드랍의 등급 확률" rows={ambient.data.rarity} nowrapValue note={AMBIENT_LOWERING_NOTE} />
      )}
      {ambient.ok && ambient.data.mode === 'random' && (
        <>
          <P>{AMBIENT_RANDOM_TEXT}</P>
          <Note>{AMBIENT_LOWERING_NOTE}</Note>
        </>
      )}
      {!ambient.ok && (
        <>
          <Unavailable />
          <Note>{AMBIENT_LOWERING_NOTE}</Note>
        </>
      )}
    </Section>
  )
}

function PitySection({ policy }: { policy: DisclosureResult<PolicyDisclosure> }) {
  return (
    <Section title="보정 장치">
      {policy.ok ? (
        <ul className="flex flex-col gap-2 list-disc pl-6">
          {policy.data.pity.map((sentence, i) => (
            <li key={i} className="text-base leading-[var(--leading-reading)] text-foreground break-keep wrap-break-word text-pretty">
              {sentence}
            </li>
          ))}
        </ul>
      ) : (
        <Unavailable />
      )}
    </Section>
  )
}

export default async function ProbabilityPage() {
  const { policy, ambient } = await loadProbabilityDisclosure()

  return (
    <div className="min-h-full text-foreground">
      <LegalTopNav title={PAGE_TITLE} />

      <article className="px-4 pt-16 pb-16 flex flex-col gap-12">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-medium break-keep wrap-break-word text-balance">{PAGE_TITLE}</h1>
          <P>
            JAM!에서 확률로 정해지는 것과 그 확률을 모두 적었어요. 표의 값은 지금 서비스가 쓰는 값이고, 보정 장치는 표 아래에 따로 적었어요.
          </P>
          <P>JAM!에는 유료 결제가 없어요. 잼과 포인트는 돈으로 팔지 않아요.</P>
        </div>

        <SyncSection policy={policy} />
        <CapsuleSection policy={policy} />
        <AmbientSection ambient={ambient} />

        <Section title="확률이 없는 것">
          <P>
            믹스, 잠긴 아이템 배지 열기, 액티비티 배지, 체크인 배지, 미션 보상, 유저가 직접 놓은 드랍에는 확률이 없어요. 믹스는 레시피에 정해진 결과가 나오고,
            잠긴 아이템 배지는 받을 때 이미 무엇인지 정해져 있어요. 액티비티 배지와 체크인 배지는 조건을 채우면 받고, 미션 보상은 미션마다 정해져 있어요.
          </P>
        </Section>

        <PitySection policy={policy} />

        <Section title="바뀐 날짜">
          <P>확률을 바꾸면 바뀐 날짜와 내용을 여기에 적어요.</P>
          <ProbabilityTable caption="확률 안내가 바뀐 날짜와 내용" rows={CHANGE_LOG} />
        </Section>
      </article>
    </div>
  )
}
