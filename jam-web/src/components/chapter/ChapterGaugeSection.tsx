'use client'

import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import ChapterGaugeCard, { ChapterGaugeCardError } from '@/components/ui/ChapterGaugeCard'
import { formatGemCount } from '@/components/ui/chapterGaugeCardMath'
import ChapterRewardBlockedCard from '@/components/chapter/ChapterRewardBlockedCard'
import type { MyChapterResult } from '@/lib/chapter/read'
import { d, t } from '@/lib/i18n'

interface Props {
  /** 서버가 읽어 직렬화한 값. 읽지 못했으면 null(오류 블록) */
  chapter: MyChapterResult | null
  /** 대기 보상으로 막혔고 이용 정지 중이 아닐 때만 값이 있다. 아니면 null */
  blocked: { pendingItemCount: number } | null
}

/**
 * 홈 챕터 게이지 섹션 — 정본 `ui/ChapterGaugeCard`와 막힘 안내 카드를 한 덩어리로 놓는다 (티켓 20261127_1735 C5b, 채원 사전 판정 2026-11-28)
 *
 * 값은 서버가 `getMyChapter`로 읽어 내려 주고(서버 렌더 결과에 값이 들어 있다), 동기화 뒤 `router.refresh()`로 새 값이 오면 정본이 현재 값에서 새 값으로 옮겨 간다.
 * 클라이언트 재조회 API는 두지 않는다. 로딩 상태(Skeleton)도 두지 않는다.
 * 상태: 챕터 없음(`chapterNo` null)은 아무것도 그리지 않아 래퍼도 DOM에 없다(홈 컨테이너의 gap 빈 간격이 생기지 않는다). 읽기 실패(null 또는 `ok: false`)는 카드와 같은 높이의 오류 블록과 «다시 시도».
 * 막힘 카드는 카드(또는 오류 블록) 바로 아래에 이어 붙는다. 같은 모서리 반지름(16px)이라 오류 블록 아래에도 같은 기준으로 붙는다.
 * 카드 루트에 `relative`만 주어 z-index 없이 막힘 카드 위에 그려지게 한다. 이 섹션을 감싸는 곳은 z-index를 주지 않는다(시트가 탭바에 가려진 2026-08-25 사고).
 * 색·글자·모서리는 정본이 정한다. 이 파일은 값을 넘기고 배치만 한다.
 */
export default function ChapterGaugeSection({ chapter, blocked }: Props) {
  const router = useRouter()
  const copy = d.chapterGauge

  if (chapter?.ok && chapter.chapterNo === null) return null

  const blockedCard = blocked ? <ChapterRewardBlockedCard pendingItemCount={blocked.pendingItemCount} /> : null

  if (!chapter || !chapter.ok || chapter.chapterNo === null || chapter.chapterJam === null) {
    return (
      <div>
        <ChapterGaugeCardError
          className="relative"
          action={
            <Button variant="secondary" size="xs" className="shrink-0 whitespace-nowrap" onClick={() => router.refresh()}>
              {copy.retry}
            </Button>
          }
        >
          {copy.loadFailed}
        </ChapterGaugeCardError>
        {blockedCard}
      </div>
    )
  }

  const { chapterNo, chapterJam, requiredJam, tribeName } = chapter
  const filledText = formatGemCount(chapterJam)
  const ariaLabel = tribeName ? t(copy.ariaLabel, { chapterNo, tribeName }) : t(copy.ariaLabelNoTribe, { chapterNo })
  const trackAriaLabel =
    requiredJam === null
      ? t(copy.trackAriaLabelLast, { filled: filledText })
      : t(copy.trackAriaLabel, { filled: filledText, required: formatGemCount(requiredJam) })

  return (
    <div>
      <ChapterGaugeCard
        className="relative"
        tribeName={tribeName}
        chapterNo={chapterNo}
        chapterLabel={copy.label}
        filled={chapterJam}
        required={requiredJam}
        ariaLabel={ariaLabel}
        trackAriaLabel={trackAriaLabel}
      />
      {blockedCard}
    </div>
  )
}
