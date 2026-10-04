/**
 * 예약 등록의 핸들러 레지스트리 (티켓 20261002_1255, 상위 20260930_1500 ④-a). 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8이다.
 *
 * 종류 → 핸들러. 지금 연결된 것은 홈피드 카드(④)·미션(⑥, 티켓 20261002_1944)·JAM! 배지(⑨-a, 티켓 20261004_1756)·컬렉션(⑩-a, 티켓 20261004_2039)·레시피(⑧-a, 티켓 20261002_2221)·드랍 예약(⑧-b, 티켓 20261002_2306)이다.
 * 예약 등록 대상 6종이 모두 붙었다. 레지스트리에 없는 종류는 사전 점검(`precheck.ts`)이 「아직 연결하지 않은 종류예요」로 막는다(분기는 가짜 레지스트리 테스트와 앞으로의 종류를 위해 남긴다).
 * `handlers.ts`가 아니라 이 파일에 둔 것은 핸들러가 `handlers.ts`의 타입을 가져와 서로 물리지 않게 하기 위해서다.
 * 순수 모듈 계약: `node:`·Supabase·서버 모듈을 값으로 가져오지 않는다.
 */
import { COLLECTION_LAUNCH_HANDLER } from './collectionLaunch'
import { DROP_SCHEDULE_HANDLER } from './dropSchedule'
import { HOME_FEED_CARD_HANDLER } from './homeFeedCard'
import { JAM_BADGE_HANDLER } from './jamBadge'
import { MISSION_HANDLER } from './mission'
import { RECIPE_HANDLER } from './recipe'
import type { ExecuteHandlerRegistry } from './handlers'

export const EXECUTE_HANDLERS: ExecuteHandlerRegistry = {
  home_feed_card: HOME_FEED_CARD_HANDLER,
  mission: MISSION_HANDLER,
  jam_badge: JAM_BADGE_HANDLER,
  collection_launch: COLLECTION_LAUNCH_HANDLER,
  recipe: RECIPE_HANDLER,
  drop_schedule: DROP_SCHEDULE_HANDLER,
}
