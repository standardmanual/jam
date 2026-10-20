import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { d, t } from '@/lib/i18n'

/**
 * 프로필의 챕터 줄 (티켓 20261019_1317 1회, 채원 사전 판정 A·B)
 *
 * 한 컴포넌트가 내 프로필(`mine`)과 다른 유저 프로필(`public`) 두 모양을 맡는다.
 * - mine: «챕터 3 · 단골» 줄 오른쪽에 «다음 챕터까지», 아래에 MODULAR `ProgressBar` 기본형(높이 8, 숫자 없음). 이름이 없으면 «챕터 3»만.
 *   마지막 챕터(`nextChapterNo`가 null)는 줄 오른쪽 라벨과 게이지를 함께 빼고 «마지막» 같은 문구도 두지 않는다(챕터가 늘 수 있다).
 * - public: «트라이브 · 챕터 3 · 단골» 한 줄. 게이지 없음. 없는 조각은 빼고 모두 없으면 아무것도 그리지 않는다.
 *
 * 점수 숫자는 어디에도 그리지 않는다(운영 로직 12.3절). 게이지는 비율만 받고 숫자 라벨을 켜지 않는다.
 * 서버가 읽은 값을 그대로 그린다 — 퀘스트 전과 읽지 못함은 호출부가 `null`을 넘겨 줄 자체를 두지 않는다(사용자 결정 4).
 * 긴 이름은 줄여서(truncate) 320px에서 넘치지 않게 한다.
 */

/** 내 프로필용 — `getMyChapter`가 `ok: true`이고 챕터가 있을 때의 값 */
export interface MyChapterLineData {
  chapterNo: number
  /** 지금 트라이브의 챕터 이름. 없으면 null */
  name: string | null
  /** 다음 챕터 번호. 마지막 챕터면 null */
  nextChapterNo: number | null
  /** 다음 챕터까지의 비율(0~1). 마지막 챕터면 null */
  progress: number | null
}

/** 다른 유저 프로필용 — 진행은 담지 않는다 */
export interface PublicChapterLineData {
  /** 지금 트라이브 이름. 트라이브를 고르지 않았으면 null */
  tribeName: string | null
  /** 챕터가 없으면(퀘스트 전) null */
  chapterNo: number | null
  name: string | null
}

type Props =
  | { variant: 'mine'; chapter: MyChapterLineData }
  | { variant: 'public'; chapter: PublicChapterLineData }

const TEXT_BASE = 'break-keep wrap-break-word'

function joinPieces(pieces: Array<string | null | undefined>): string {
  return pieces.filter((piece): piece is string => typeof piece === 'string' && piece.length > 0).join(d.chapter.line.separator)
}

/** 다른 유저 줄에 보일 글. 보일 조각이 하나도 없으면 빈 문자열 */
export function publicChapterText(chapter: PublicChapterLineData): string {
  const hasChapter = chapter.chapterNo !== null
  return joinPieces([
    chapter.tribeName,
    hasChapter ? t(d.chapter.line.chapter, { chapterNo: chapter.chapterNo as number }) : null,
    hasChapter ? chapter.name : null,
  ])
}

export default function ChapterLine(props: Props) {
  if (props.variant === 'public') {
    const text = publicChapterText(props.chapter)
    if (text === '') return null
    return (
      <p data-chapter-line="public" className={`m-0 min-w-0 truncate text-sm text-muted ${TEXT_BASE}`}>
        {text}
      </p>
    )
  }

  const { chapterNo, name, nextChapterNo, progress } = props.chapter
  const label = joinPieces([t(d.chapter.line.chapter, { chapterNo }), name])
  const hasNext = nextChapterNo !== null && progress !== null

  return (
    <div data-chapter-line="mine" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className={`m-0 min-w-0 truncate text-base font-bold text-foreground ${TEXT_BASE}`}>{label}</p>
        {hasNext && (
          <span className={`shrink-0 whitespace-nowrap text-sm text-muted ${TEXT_BASE}`}>{d.chapter.line.untilNext}</span>
        )}
      </div>
      {hasNext && (
        // 게이지는 비율만 보인다. 숫자가 없어 보조기술에는 앞의 «다음 챕터까지» 글이 전부라 장식으로 둔다.
        <div data-chapter-gauge aria-hidden="true">
          <ProgressBar percent={Math.round(progress * 100)} />
        </div>
      )}
    </div>
  )
}
