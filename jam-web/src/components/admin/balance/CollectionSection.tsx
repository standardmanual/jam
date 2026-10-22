/**
 * 밸런스 설정 «컬렉션과 믹스» 구역 본문 (티켓 20261022_1133 1회) — 서버 컴포넌트. 컬렉션 등급별 기본 완성 포인트 4칸(`item_book_tier_default_rewards`)과
 * 믹스 실패 포인트 한 칸(`combine_policy.fail_reward_points`)을 편집한다. 옛 «믹스 정책» 화면(`/admin/combine-policy`)을 이 구역이 대신한다.
 * 칸 정의와 읽기·쓰기는 `lib/admin/balance/collection.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 *
 * 폼 위에 안내를 둔다(가정 마): 컬렉션마다 따로 정한 값이 먼저이고 이미 받은 보상은 바뀌지 않는다는 것, 믹스 실패 포인트가 언제 나가는지.
 */
import { Alert } from '@/components/admin/ui/alert'
import { COLLECTION_BINDING } from '@/lib/admin/balance/collection'
import { BalanceSectionBody } from './BalanceSectionBody'

export const COLLECTION_REWARD_NOTICE =
  '컬렉션마다 완성 포인트를 따로 정해 둔 등급은 그 값이 먼저 쓰여요. 이미 받은 보상은 바뀌지 않아요. 0이면 포인트를 주지 않아요.'

export const COMBINE_FAIL_NOTICE = '레시피에 맞지 않는 재료로 믹스하면 재료가 사라지고, 믹스 실패 포인트를 줘요.'

export function CollectionNotice() {
  return (
    <Alert role="note">
      <div className="space-y-1">
        <p className="text-sm text-pretty break-keep wrap-break-word">{COLLECTION_REWARD_NOTICE}</p>
        <p className="text-sm text-pretty break-keep wrap-break-word">{COMBINE_FAIL_NOTICE}</p>
      </div>
    </Alert>
  )
}

export function CollectionSection() {
  return (
    <div className="space-y-6">
      <CollectionNotice />
      <BalanceSectionBody binding={COLLECTION_BINDING} />
    </div>
  )
}
