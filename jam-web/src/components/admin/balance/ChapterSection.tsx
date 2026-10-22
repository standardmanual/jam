/**
 * 밸런스 설정 «챕터» 구역 본문 (티켓 20261022_1133 2회) — 서버 컴포넌트. 챕터 2~10에 오르는 데 필요한 누적 점수(`chapter_definitions`)와
 * 활동 12종의 단위당 점수·주간 상한·상한 넘은 점수 비율(`chapter_score_rules`)을 편집한다. 챕터 더하기는 이 구역에 없다(후속 티켓 20261022_1718).
 * 칸 정의와 읽기·쓰기는 `lib/admin/balance/chapter.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 *
 * 폼 위에 안내 두 문장을 둔다: 이미 오른 유저는 내려가지 않고 낮춘 기준은 다음에 점수를 쌓을 때부터 적용된다는 것(사용자 결정 2),
 * «챕터 점수»는 컬렉션과 믹스 구역의 «포인트»와 다른 설정이라는 것.
 */
import { Alert } from '@/components/admin/ui/alert'
import { COLLECTION_SECTION_ID } from '@/lib/admin/balance/collection'
import { CHAPTER_BINDING } from '@/lib/admin/balance/chapter'
import { BalanceSectionBody } from './BalanceSectionBody'

export const CHAPTER_RISEN_NOTICE =
  '이미 오른 유저의 챕터는 내려가지 않아요. 필요한 점수를 낮추면 그 기준은 유저가 다음에 점수를 쌓을 때부터 적용돼요.'

export const CHAPTER_SCORE_NOTICE_PREFIX = '«챕터 점수»는 «포인트»와 다른 설정이에요. 컬렉션 완성 점수를 바꿔도 '
export const CHAPTER_SCORE_NOTICE_LINK = '컬렉션과 믹스 구역'
export const CHAPTER_SCORE_NOTICE_SUFFIX = '의 완성 포인트는 그대로예요.'

export function ChapterNotice() {
  return (
    <Alert role="note">
      <div className="space-y-1">
        <p className="text-sm text-pretty break-keep wrap-break-word">{CHAPTER_RISEN_NOTICE}</p>
        <p className="text-sm text-pretty break-keep wrap-break-word">
          {CHAPTER_SCORE_NOTICE_PREFIX}
          <a href={`#${COLLECTION_SECTION_ID}`} className="font-medium underline underline-offset-4">
            {CHAPTER_SCORE_NOTICE_LINK}
          </a>
          {CHAPTER_SCORE_NOTICE_SUFFIX}
        </p>
      </div>
    </Alert>
  )
}

export function ChapterSection() {
  return (
    <div className="space-y-6">
      <ChapterNotice />
      <BalanceSectionBody binding={CHAPTER_BINDING} />
    </div>
  )
}
