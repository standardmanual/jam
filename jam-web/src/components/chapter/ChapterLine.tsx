import { d, t } from '@/lib/i18n'

/**
 * 다른 유저 프로필의 챕터 줄 (티켓 20261019_1317 1회, 채원 사전 판정 A·B)
 *
 * «트라이브 · 챕터 3» 한 줄. 게이지 없음. 없는 조각은 빼고 모두 없으면 아무것도 그리지 않는다.
 * 내 프로필의 줄(`mine`)은 챕터 게이지 카드와 겹쳐 걷었다(티켓 20261127_1736 C6).
 *
 * 챕터는 숫자로만 표기한다(2026-10-21 결정, 티켓 20261021_1539). 챕터 이름 조각은 없다.
 * 점수 숫자는 어디에도 그리지 않는다(운영 로직 12.3절).
 * 서버가 읽은 값을 그대로 그린다 — 퀘스트 전과 읽지 못함은 호출부가 `null`을 넘겨 줄 자체를 두지 않는다(사용자 결정 4).
 * 긴 트라이브 이름은 줄여서(truncate) 320px에서 넘치지 않게 한다.
 */

/** 다른 유저 프로필용 — 진행은 담지 않는다 */
export interface PublicChapterLineData {
  /** 지금 트라이브 이름. 트라이브를 고르지 않았으면 null */
  tribeName: string | null
  /** 챕터가 없으면(퀘스트 전) null */
  chapterNo: number | null
}

interface Props {
  chapter: PublicChapterLineData
}

const TEXT_BASE = 'break-keep wrap-break-word'

function joinPieces(pieces: Array<string | null | undefined>): string {
  return pieces.filter((piece): piece is string => typeof piece === 'string' && piece.length > 0).join(d.chapter.line.separator)
}

/** 다른 유저 줄에 보일 글. 보일 조각이 하나도 없으면 빈 문자열 */
export function publicChapterText(chapter: PublicChapterLineData): string {
  return joinPieces([chapter.tribeName, chapter.chapterNo !== null ? t(d.chapter.line.chapter, { chapterNo: chapter.chapterNo }) : null])
}

export default function ChapterLine({ chapter }: Props) {
  const text = publicChapterText(chapter)
  if (text === '') return null
  return (
    <p data-chapter-line="public" className={`m-0 min-w-0 truncate text-sm text-muted ${TEXT_BASE}`}>
      {text}
    </p>
  )
}
