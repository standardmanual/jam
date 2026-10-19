/**
 * 드랍 확인 단계의 «사라질 양» 문구 — 클라이언트에서 쓰는 순수 함수 (티켓 20261018_1817)
 *
 * `t()`는 `{n}` 같은 단어 슬롯만 바꾸고 `{은/는}` 조사 마커는 모른다. 소식 문구가 쓰는 `tokenizeMessage`가 마커를 바로 앞 글자의 받침으로 치환하므로
 * 같은 규칙을 재사용한다(숫자는 마지막 자리의 음독 받침으로 본다: 1·3·6·7·8·0은 «은», 나머지는 «는»).
 * 양 자체는 서버가 `GET /api/inventory/items/[itemId]/drop-loss`로 알려 준 값이며(`drop-loss-contract.ts`), 이 함수는 계산하지 않고 글로만 옮긴다.
 */
import { d } from '@/lib/i18n'
import { tokenizeMessage } from '@/lib/notifications/message'

/** «채운 잼 {n}{은/는} 사라져요. 돌려받을 수 없어요.» — `lostFill`은 1 이상의 정수여야 하며 호출부가 0을 걸러 낸다 */
export function dropLossText(lostFill: number): string {
  return tokenizeMessage(d.drops.dropLossBody, { n: String(lostFill) })
    .map((token) => token.text)
    .join('')
}
