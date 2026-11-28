/**
 * 밸런스 설정 «챕터» 구역 본문 (티켓 20261022_1133 2회, 티켓 20261127_1739 C9a에서 점수를 잼으로 바꿈) — 서버 컴포넌트.
 * 챕터 1~9에서 다음 챕터로 오르는 데 필요한 잼(`chapter_definitions.required_jam`)을 편집한다. 챕터 10은 마지막이라 필요한 잼이 없고 읽기만 보인다.
 * 챕터 더하기는 이 구역에 없다(후속 티켓 20261022_1718). 챕터 보상 편집은 C9b 소관이다.
 * 칸 정의와 읽기·쓰기는 `lib/admin/balance/chapter.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 *
 * 폼 위에 안내 한 문장 묶음과 챕터 10 읽기 줄을 둔다: 이미 오른 유저는 내려가지 않고, 챕터는 잼을 모아 오르며 넘친 잼은 이월되고,
 * 이 값은 홈·프로필 챕터 게이지 카드의 필요 잼으로 보이며, 챕터 번호는 늘리거나 줄이지 않는다는 것.
 */
import { Alert } from '@/components/admin/ui/alert'
import { CHAPTER_BINDING } from '@/lib/admin/balance/chapter'
import { BalanceSectionBody } from './BalanceSectionBody'

export const CHAPTER_RISEN_NOTICE =
  '이미 오른 유저의 챕터는 내려가지 않아요. 챕터는 잼을 모아 오르고, 넘친 잼은 다음 챕터로 이월돼요. 이 값은 홈과 프로필의 챕터 게이지 카드에 필요한 잼으로 보여요. 챕터 번호는 늘리거나 줄이지 않고 값만 바꿔요.'

/** 마지막 챕터(10)는 필요 잼이 없어 편집 칸이 없고 이 줄로만 보인다. */
export const CHAPTER_LAST_NOTICE = '챕터 10은 필요한 잼이 없어요(마지막 챕터).'

export function ChapterNotice() {
  return (
    <Alert role="note">
      <p className="text-sm text-balance break-keep wrap-break-word">{CHAPTER_RISEN_NOTICE}</p>
    </Alert>
  )
}

export function ChapterLastNotice() {
  return <p className="text-sm text-muted-foreground text-balance break-keep wrap-break-word">{CHAPTER_LAST_NOTICE}</p>
}

export function ChapterSection() {
  return (
    <div className="space-y-6">
      <ChapterNotice />
      <ChapterLastNotice />
      <BalanceSectionBody binding={CHAPTER_BINDING} />
    </div>
  )
}
