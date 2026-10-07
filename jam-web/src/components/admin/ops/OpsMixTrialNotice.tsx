/**
 * 레시피 시험 믹스 안내 (티켓 20261007_1401, 상위 20261006_1805 ⑤-b).
 *
 * 공개 전 레시피는 운영자 계정에게만 믹스 화면에 보인다(티켓 20261001_1159 시험 믹스). 그 사실을 레시피 항목의 미리보기 아래에 알린다.
 * - 예약 전(검토중·승인됨): 아직 레시피가 없어 시험할 수 없다 → 예약 등록하면 시험할 수 있다는 안내
 * - 예약 이후(준비중·예약됨): 믹스 화면 링크와 함께 공개 전에도 시험할 수 있다는 안내
 * 그 밖의 상태·다른 종류에는 아무것도 그리지 않는다. 새 믹스 기능은 없고 안내와 링크뿐이다.
 * 「시험 믹스」는 운영자 전용 표현이라 UX 용어표에 올리지 않는다(티켓 20261001_1159).
 */
import Link from 'next/link'

export const MIX_TRIAL_BEFORE_TEXT = '예약 등록하면 믹스 화면에서 미리 시험해 볼 수 있어요'
export const MIX_TRIAL_AFTER_TEXT = '공개 전에도 믹스 화면에서 시험해 볼 수 있어요'
export const MIX_TRIAL_LINK_LABEL = '믹스 화면 열기'
export const MIX_TRIAL_HREF = '/combine'

const BEFORE_STATUSES: readonly string[] = ['reviewing', 'approved']
const AFTER_STATUSES: readonly string[] = ['preparing', 'scheduled']

export function OpsMixTrialNotice({ item }: { item: { kind: string | null; status: string } }) {
  if (item.kind !== 'recipe') return null
  if (BEFORE_STATUSES.includes(item.status)) {
    return <p className="m-0 text-sm text-muted-foreground">{MIX_TRIAL_BEFORE_TEXT}</p>
  }
  if (AFTER_STATUSES.includes(item.status)) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-sm text-muted-foreground">{MIX_TRIAL_AFTER_TEXT}</p>
        <Link href={MIX_TRIAL_HREF} className="text-sm underline underline-offset-4">
          {MIX_TRIAL_LINK_LABEL}
        </Link>
      </div>
    )
  }
  return null
}
