/**
 * condition_json 데이터 계약 — 허용 필드 단일 소스 (티켓 20260825_031)
 *
 * `badges.condition_json`에 들어올 수 있는 필드를 정의한다. DB CHECK 제약
 * (`supabase/migrations/131_condition_keys_v5.sql`), 어드민 API 검증
 * (`src/lib/admin/badge-validation.ts`), badge-engine의 「평가 가능한 조건 없음」 게이트가
 * 모두 이 목록을 참조/동기화한다.
 *
 * 배경: 마이그레이션 `084_badge_condition_cleanup.sql`이 배지 상세화면 표시용으로 넣은
 * `{"mission_reward": true}`가 badge-engine의 `evaluateConditionDetailed`에서 "알려진 조건
 * 필드 없음 → 검사 스킵 → pass:true"로 처리되어 미션 완료 없이 미션보상배지가 발급되는
 * 사고로 이어졌다(레벨업 게이팅 12일 무력화, 티켓 20260825_028). 증상은 3중 방어로
 * 막았지만 근본 원인인 "condition_json에 런타임 데이터 계약이 없다"는 남아 있었다 —
 * 이 파일이 그 계약이었다.
 *
 * ⚠️ **2026-09-05(티켓 20260905_0028)부터 실제 선언은 `conditionRegistry.ts`에 있다.**
 * 키 목록만이 아니라 라벨·단위·입력 타입·짝 필드·방향성·평가 구현 여부까지 한 곳에 모아,
 * 조건 필드 1개 추가에 6곳을 고쳐야 하던 구조를 없앴다. 이 파일은 기존 소비처가 계속
 * 동작하도록 그 파생 목록을 그대로 다시 내보내는 얇은 층으로만 남는다 —
 * **새 필드는 이 파일이 아니라 `conditionRegistry.ts`에 추가한다.**
 */
export {
  ALL_CONDITION_KEYS,
  CONDITION_FIELD_KEYS,
  CONDITION_META_KEYS,
  FILTER_ONLY_CONDITION_KEYS,
  MEASURABLE_CONDITION_KEYS,
  type AssertAllConditionKeysCovered,
} from './conditionRegistry'
