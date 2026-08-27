# JAM! 서비스 운영 문서 — 변경분 (2026-07-27 17:20)

> **이 버전의 변경 내용:** 조합 레시피에 "필수 액티비티 배지"(소모되지 않는 보유 조건) 필드 추가, 세계관 융합 정석 레시피 33종을 기존 배지 재활용 방식으로 DB에 시딩.
> 이전 버전: SERVICE_OPERATIONS_20260727_1650.md

---

## 조합 레시피 — 필수 액티비티 배지 조건

**관련 파일:**
- `supabase/migrations/056_recipe_activity_requirement.sql` — `combination_recipes.required_activity_badge_id` 컬럼
- `src/lib/combine/index.ts` — 레시피 매칭 시 재료 일치 후보 중 액티비티 요건(보유 여부, 소모 안 함)까지 만족하는 첫 후보를 채택
- `src/app/admin/recipes/RecipeList.tsx` — 필수 액티비티 배지 선택 UI + 목록 컬럼

액티비티 배지는 영구 귀속·양도 불가 원칙상 `inventory_items`에 들어가지 않아 소모형 재료로 쓸 수 없다. `item_books.required_activity_badge_id`와 동일한 패턴으로, "보유는 해야 하지만 소모되지는 않는 조건"을 레시피에도 도입.

## 세계관 융합 정석 레시피 33종 시딩

**관련 파일:** `supabase/migrations/057_seed_combine_recipes.sql`, `PRD/badge/COMBINE_RECIPES.md`

- 055에서 생성된 세력별 legendary/mythic 아이템 배지를 재활용 — 신규 배지 생성 없음.
- 재료·결과 배지는 이름 키워드 ILIKE 매칭으로 자동 연결. 매칭 실패 시 해당 레시피는 조용히 스킵(에러로 전체 마이그레이션을 막지 않음) — 실행 후 `/admin/recipes`에서 실제 삽입 개수 확인 필요.
- 레시피 원안의 액티비티 재료(R5/H5/C2 등)는 실제 시딩된 배지가 아니라 기획 단계 예시 라벨이라 자동 매칭하지 않음 — 필요 시 어드민에서 수동으로 "필수 액티비티 배지" 지정.
