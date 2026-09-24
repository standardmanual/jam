import Link from 'next/link'
import { IconCalendarOff, IconFlagOff } from '@tabler/icons-react'
import { cardGapMessage, missionGapMessages, type ContentGaps } from '@/lib/admin/contentGaps'

/**
 * 「이상 신호」 영역 안의 컨텐츠 공백 경고 카드 두 장(티켓 20260924_0912).
 *
 * 판정은 `lib/admin/contentGaps.ts`가 하고 이 컴포넌트는 그리기만 한다. 세 상태:
 * - 정상: 회색 "공백 없음"
 * - 문제: 빨간 카드에 내용과 바로가기 링크
 * - 조회 실패: 그 카드만 오류 카드(다른 카드는 그대로)
 */

const MISSIONS_HREF = '/admin/missions'

function ErrorCard({ label, error }: { label: string; error: string | null }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
      <p className="font-semibold text-sm text-red-600 mb-1">{label}</p>
      <p className="text-red-500 text-xs">불러오지 못했어요 — {error ?? '알 수 없는 오류'}</p>
    </div>
  )
}

function GapCard({
  label,
  href,
  messages,
  icon: Icon,
}: {
  label: string
  href: string
  /** 비어 있으면 정상("공백 없음") */
  messages: string[]
  icon: typeof IconFlagOff
}) {
  const hasGap = messages.length > 0
  return (
    <Link
      href={href}
      className={`border rounded-2xl p-5 transition-colors ${
        hasGap ? 'bg-red-50 border-red-200 hover:border-red-300' : 'bg-white border-border hover:border-foreground/30'
      }`}
    >
      <Icon className={`mb-2 h-8 w-8 ${hasGap ? 'text-red-500' : 'text-muted-foreground'}`} />
      <p className={`text-sm font-semibold ${hasGap ? 'text-red-600' : 'text-muted-foreground'}`}>{label}</p>
      {hasGap ? (
        <ul className="mt-1 space-y-0.5">
          {messages.map((message) => (
            <li key={message} className="text-xs text-red-500">
              {message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground mt-1">공백 없음</p>
      )}
    </Link>
  )
}

export default function ContentGapCards({ gaps }: { gaps: ContentGaps }) {
  const { missions, cards } = gaps
  const cardResult = cards.result
  const cardMessage = cardResult ? cardGapMessage(cardResult) : null
  const earliestUnprogrammed = cardResult?.unprogrammedDates[0]

  return (
    <div className="grid grid-cols-2 gap-4 mt-4">
      {missions.result ? (
        <GapCard label="미션 공백" href={MISSIONS_HREF} messages={missionGapMessages(missions.result)} icon={IconFlagOff} />
      ) : (
        <Link href={MISSIONS_HREF}>
          <ErrorCard label="미션 공백" error={missions.error} />
        </Link>
      )}
      {cardResult ? (
        <GapCard
          label="카드 편성 공백"
          href={earliestUnprogrammed ? `/admin/today?date=${earliestUnprogrammed}` : '/admin/today'}
          messages={cardMessage ? [cardMessage] : []}
          icon={IconCalendarOff}
        />
      ) : (
        <Link href="/admin/today">
          <ErrorCard label="카드 편성 공백" error={cards.error} />
        </Link>
      )}
    </div>
  )
}
