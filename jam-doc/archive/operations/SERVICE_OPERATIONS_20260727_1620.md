# JAM! 서비스 운영 문서 — 변경분 (2026-07-27 16:20)

> **이 버전의 변경 내용:** 아이템 조합 시스템을 v2로 재설계·구현. 정석 레시피(재료 정확 매칭) 확정 지급 경로는 유지하되, 비매칭 임의 조합에 "세계관 다양성 티어" 기반 확률 경로와 "연속 실패 피티(확률 보정+지연 포인트 보상)" 시스템을 추가. 어드민에 조합 정책 조정 화면 신설, 레시피 관리 화면에 수정 기능 추가(기존엔 등록/삭제만 가능).
> 이전 버전: SERVICE_OPERATIONS_20260727_1544.md

---

## 아이템 조합 v2

**관련 파일:**
- `src/lib/combine/index.ts` — 조합 실행 엔진
- `src/lib/combine/policy.ts` — 정책 로딩/저장 + 티어 판정
- `src/app/api/combine/route.ts` — 유저 조합 실행 API
- `src/app/admin/combine-policy/`, `src/app/api/admin/combine-policy/route.ts` — 정책 어드민
- `src/app/admin/recipes/RecipeList.tsx` — 레시피 CRUD (수정 기능 신규)
- `src/app/(main)/combine/CombineClient.tsx` — 유저 조합 화면 (재료 2~10개로 확장)
- `supabase/migrations/054_combine_v2.sql`
- 레시피 콘텐츠 문서: `PRD/badge/COMBINE_RECIPES.md`

### 조합 결과 두 경로

1. **정석 레시피 매칭** (`combination_recipes` 재료 정확 일치, 순서 무관) → 레시피 지정 결과 배지 확정 지급. 피티 확률 보정이 적용되지 않는 별도 트랙 — 정석 레시피 발견의 가치가 항상 확률형 트랙보다 우월해야 하기 때문.
2. **비매칭 임의 조합** → 재료가 속한 세계관을 제외한 다른 세계관의 최하위(common) 등급 배지 n개를 확률적으로 지급, 또는 실패(재료만 소각). 확률과 n은 재료 "개수"가 아니라 재료가 속한 **서로 다른 세계관 수(다양성)**를 축으로 하는 3단계 티어(`combine_policy` 싱글톤)로 결정 — 다양성 요건 미충족 시 하위 티어로 강등.

### 피티(연속 실패 보정)

- 유저별 전역 연속 실패 카운터(`user_combine_state.consecutive_fail_count`), 성공(경로 무관) 시 리셋.
- 성공 확률 보정: 실패 1회차부터 즉시 미세 상승, 절대 상한 존재(`pity_prob_cap`).
- 포인트 보상: 완전 빈손 대신, 일정 연속 실패 임계치 이후부터만 지급 시작(`pity_points_start_streak`), 계단식 소폭 증가, 별도 상한(`pity_points_cap`). `point_transactions.reason`에 `combine_pity_reward` 신규 사유 추가(마이그레이션 054에서 CHECK 제약 갱신).
- 두 상한(확률 보정 / 포인트 지급)은 서로 독립적으로 관리 — 하나가 커져도 다른 하나에 영향 없음.

### 재료 개수 확장

기존 2~3개 → 2~10개로 확장(`combination_recipes.ingredient_badge_ids` 길이 CHECK 제약도 054에서 갱신). 유저 조합 화면(`CombineClient.tsx`)의 선택 슬롯도 5×2 그리드로 최대 10개까지 대응.

### 콘텐츠 반영 미완료 사항

정책·엔진·어드민 코드는 이번 세션에서 구현 완료. 세계관 융합 컨셉의 정석 레시피 33종(원안 30 + 균형 보정 3)은 `PRD/badge/COMBINE_RECIPES.md`에 문서화만 되어 있고 아직 DB에는 반영되지 않음 — 결과 배지(레전드/미스틱 등급 아이템 배지)가 현재 DB에 하나도 없어(기존 아이템 배지는 전부 common) 어드민에서 배지 생성 후 레시피 등록이 별도로 필요.
