/**
 * 카드 자원(`resource`) 대응과 설명·제목 판정 (옛 카드 모양 7개의 상수·판정은 티켓 20261122_1328에서 지웠다 — git 이력 참고).
 *
 * 서버 모듈을 불러오지 않는 순수 파일이다. 계측(`events.ts`)이 화면 모듈(`cardView.ts`, 한국어 사전을 가져온다)을 값으로 가져오지 않도록,
 * 두 쪽이 함께 쓰는 순수 판정(자원 대응 `resourceOfTemplate`·`CARD_RESOURCES`)은 이 파일에 둔다(티켓 20261001_2244).
 * `cardView.ts`가 같은 이름으로 다시 내보낸다. 이 파일은 사전·서버 모듈을 값으로 가져오지 않는다 — 그래야 이벤트 API 번들에 사전이 실리지 않는다
 * (`__tests__/eventsImports.test.ts`가 import 그래프로 고정한다).
 */
import type { TodayCardTemplateType } from '@/types/database'

/**
 * 옛 기준의 설명 문단 템플릿 목록(티켓 20261109_1458). 홈이 템플릿으로 설명을 그리던 때는 배지 소개와 컨텐츠 소개만 설명 문단을 그렸다.
 * 지금 홈은 카드 유형으로 그린다. DB 칸과 운영 입력 칸은 그대로다.
 * 홈과 어드민 폼·조회 화면은 이 목록을 읽지 않는다(홈은 `feedLook.ts`의 `DESCRIPTION_DEFAULT`, 티켓 20261122_1101. 어드민은 `feedTypeShowsDescription`, 티켓 20261124_1119).
 * 남은 사용처는 카드 유형 칸이 없는 CLI 등록 묶음의 옛 거절 규칙(`registerChecks/homeFeedFields.ts`의 `validateCard`)과 그 시험이다.
 */
export const DESCRIPTION_TEMPLATES = ['badge_spotlight', 'content_intro'] as const satisfies readonly TodayCardTemplateType[]

/** 옛 템플릿 규칙에서 이 템플릿이 설명문을 받는지. 카드 유형 칸이 없는 CLI 등록 묶음의 검사만 쓴다(티켓 20261124_1119). */
export function showsDescription(template: TodayCardTemplateType): boolean {
  return (DESCRIPTION_TEMPLATES as readonly string[]).includes(template)
}

// ─── 화면·계측이 함께 쓰는 순수 판정 (티켓 20261001_2244) ───────────────────────────────────

/** 카드가 소개하는 자원. `recipe`는 레시피 공개 카드(`recipe_reveal`)가 소개한다(티켓 20261006_1217). */
export const CARD_RESOURCES = ['mission', 'drop', 'recipe', 'badge', 'article', 'ranking', 'collection', 'auto'] as const

export type CardResource = (typeof CARD_RESOURCES)[number]

/** 템플릿 → 자원 대응(확정 설계 2절). `location_trend`는 표에 없어 자동 카드와 같은 짧은 소식으로 본다. */
const RESOURCE_BY_TEMPLATE: Record<TodayCardTemplateType, CardResource> = {
  mission_spotlight: 'mission',
  drop_alert: 'drop',
  badge_spotlight: 'badge',
  editorial_article: 'article',
  ranking_board: 'ranking',
  itembook_milestone: 'collection',
  progress_nudge: 'auto',
  location_trend: 'auto',
  recipe_reveal: 'recipe',
  // 자원 줄이 없는 유형이라 `auto`로 둔다 — 새 자원 값·아이콘 자산을 더하지 않는다. `mission_id` 칸이 없어 기간 줄도 나오지 않는다.
  // 아이콘은 `resourceIconOf`가 템플릿 값으로 갈라 정보 아이콘을 그린다(티켓 20261101_2054).
  content_intro: 'auto',
}

/**
 * 템플릿 → 자원. 타입은 닫힌 유니온이지만 DB의 템플릿 값은 런타임에 열려 있다 — 이 코드가 모르는 값이 먼저 들어오면 `undefined`가 돌아온다
 * (티켓 20261006_1217 안전망). 그 카드는 자원 줄(필수 정보)·자원 아이콘 없이 그려지고 홈은 오류 화면이 되지 않는다. 이 값을 읽는 쪽은 `undefined`를 견뎌야 한다
 * (`resourceIconOf`는 아이콘을 그리지 않고, 그 밖의 읽기는 자원끼리 비교만 하므로 어느 자원도 아니다).
 */
export function resourceOfTemplate(templateType: TodayCardTemplateType): CardResource {
  return RESOURCE_BY_TEMPLATE[templateType]
}

/**
 * 이미지가 제목을 말하는 카드인지(1453 결정 6·12). 저장된 `title_in_image`가 `true`/`false`면 그 값이다.
 * `NULL`(옛 카드)이면 항상 `false` — 제목을 글자로 그린다(티켓 20261121_1726). 예전에는 미션 소개 카드가 미션 대표 이미지를
 * 커버로 쓰면 `true`였지만, 7회차에 미션 이미지에서 글자를 빼므로 이미지가 제목을 말한다고 볼 수 없다.
 */
export function resolveTitleInImage(card: { title_in_image?: boolean | null }): boolean {
  return typeof card.title_in_image === 'boolean' ? card.title_in_image : false
}
