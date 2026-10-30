/**
 * 밸런스 설정 «챕터» 구역 본문 (티켓 20261022_1133 2회) — 서버 컴포넌트. 챕터 2~10에 오르는 데 필요한 누적 점수(`chapter_definitions`)를 편집한다.
 * 챕터 더하기는 이 구역에 없다(후속 티켓 20261022_1718). 활동별 점수 규칙(`chapter_score_rules`) 편집 칸은 걷었다(티켓 20261028_1742 2회).
 * 칸 정의와 읽기·쓰기는 `lib/admin/balance/chapter.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 *
 * 폼 위에 안내 한 문장을 둔다: 이미 오른 유저는 내려가지 않고, 챕터는 캡슐 100% 횟수로 오르며 이 칸은 프로필 «다음 챕터까지» 게이지에만 쓰인다는 것(사용자 결정 2, 티켓 20261031_0458).
 */
import { Alert } from '@/components/admin/ui/alert'
import { CHAPTER_BINDING } from '@/lib/admin/balance/chapter'
import { BalanceSectionBody } from './BalanceSectionBody'

export const CHAPTER_RISEN_NOTICE =
  '이미 오른 유저의 챕터는 내려가지 않아요. 챕터는 캡슐이 100%에 닿은 횟수로 오르고, 이 칸의 값은 프로필의 «다음 챕터까지» 게이지에만 쓰여요.'

export function ChapterNotice() {
  return (
    <Alert role="note">
      <p className="text-sm text-pretty break-keep wrap-break-word">{CHAPTER_RISEN_NOTICE}</p>
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
