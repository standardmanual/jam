/**
 * 밸런스 설정 «캡슐» 구역 본문 (티켓 20261022_1132 2회) — 서버 컴포넌트. 캡슐의 개수·확률·등급 확률·Epic 보정·퀘스트 전 값(`capsule_policy`)과 챕터별 값(`capsule_chapter_costs` 10행)을 편집한다.
 * 챕터별 값은 세 묶음이다(티켓 20261028_1733 4회): 동기화 자동 채움의 채울 양(`fill_v2:N`), 100% 횟수(`advance:N`, 챕터 1~9), 옛 수동 채우기의 채울 양(`chapter:N`).
 * 칸 정의와 읽기·쓰기는 `lib/admin/balance/capsule.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 *
 * Common 연속 보정과 잠길 확률은 동기화와 한 값이라 여기서 편집하지 않는다(가정 아). 폼 위에 «동기화와 같은 값이에요» 안내만 두고 동기화 구역으로 이어 준다.
 */
import { Alert } from '@/components/admin/ui/alert'
import { CAPSULE_BINDING } from '@/lib/admin/balance/capsule'
import { SYNC_SECTION_ID } from '@/lib/admin/balance/sync'
import { BalanceSectionBody } from './BalanceSectionBody'

export const SHARED_VALUES_NOTICE_PREFIX = 'Common 연속 보정과 잠긴 채 나올 확률은 동기화와 같은 값이에요. 값을 바꾸려면 '
export const SHARED_VALUES_NOTICE_LINK = '동기화 구역'
export const SHARED_VALUES_NOTICE_SUFFIX = '에서 바꿔 주세요.'

export function SharedValuesNotice() {
  return (
    <Alert role="note">
      <p className="text-sm text-pretty break-keep wrap-break-word">
        {SHARED_VALUES_NOTICE_PREFIX}
        <a href={`#${SYNC_SECTION_ID}`} className="font-medium underline underline-offset-4">
          {SHARED_VALUES_NOTICE_LINK}
        </a>
        {SHARED_VALUES_NOTICE_SUFFIX}
      </p>
    </Alert>
  )
}

export function CapsuleSection() {
  return (
    <div className="space-y-6">
      <SharedValuesNotice />
      <BalanceSectionBody binding={CAPSULE_BINDING} />
    </div>
  )
}
