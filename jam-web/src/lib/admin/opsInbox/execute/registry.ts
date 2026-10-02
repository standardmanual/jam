/**
 * 예약 등록의 핸들러 레지스트리 (티켓 20261002_1255, 상위 20260930_1500 ④-a). 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8이다.
 *
 * 종류 → 핸들러. 지금 연결된 것은 홈피드 카드(④)·미션(⑥, 티켓 20261002_1944)·레시피(⑧-a, 티켓 20261002_2221)다. 나머지 종류(⑧-b 드랍·⑨ 배지·⑩ 컬렉션)는 뒤 조각이 여기에 붙인다.
 * 레지스트리에 없는 종류는 사전 점검(`precheck.ts`)이 「아직 연결하지 않은 종류예요」로 막는다.
 * `handlers.ts`가 아니라 이 파일에 둔 것은 핸들러가 `handlers.ts`의 타입을 가져와 서로 물리지 않게 하기 위해서다.
 * 순수 모듈 계약: `node:`·Supabase·서버 모듈을 값으로 가져오지 않는다.
 */
import { HOME_FEED_CARD_HANDLER } from './homeFeedCard'
import { MISSION_HANDLER } from './mission'
import { RECIPE_HANDLER } from './recipe'
import type { ExecuteHandlerRegistry } from './handlers'

export const EXECUTE_HANDLERS: ExecuteHandlerRegistry = {
  home_feed_card: HOME_FEED_CARD_HANDLER,
  mission: MISSION_HANDLER,
  recipe: RECIPE_HANDLER,
}
