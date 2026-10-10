# JAM! 서비스 운영 문서 — 변경분 (2026-07-27 16:50)

> **이 버전의 변경 내용:** 아이템북에 "등급 정책"(등급무관/동일한 등급) 옵션 신설, 기존 세력에 귀속된 레전드/미스틱 아이템 배지가 하나도 없던 문제를 해결하기 위해 기존 common 아이템 배지 전부에 세력별 접두어 템플릿으로 rare/legendary/mythic 짝을 일괄 생성.
> 이전 버전: SERVICE_OPERATIONS_20260727_1620.md

---

## 아이템북 등급 정책 (rarity_mode)

**관련 파일:**
- `src/app/admin/itembooks/ItemBookForm.tsx` — 등급 정책 라디오(등급무관/동일한 등급) + uniform_rarity 선택
- `src/app/api/admin/itembooks/route.ts`, `src/app/api/admin/itembooks/[id]/route.ts`
- `src/app/admin/badges/BadgeForm.tsx` — 소속 아이템북이 '동일한 등급'이면 희귀도 select 자동 고정+비활성화
- `supabase/migrations/055_item_rarity_tiers.sql`

- `item_books.rarity_mode`: `'mixed'`(등급무관, 기본값) — 책 내 아이템이 자유롭게 여러 등급을 가짐. `'uniform'` — `uniform_rarity` 하나로 고정.
- 기존에 생성된 모든 아이템북은 마이그레이션 시 기본값 `mixed`로 유지.
- 배지 생성/수정 화면에서 소속 아이템북을 `uniform` 정책인 책으로 선택하면, 희귀도 select가 그 책의 `uniform_rarity`로 자동 고정되고 수정 불가 상태가 됨(신규로 추가되는 아이템이 책 등급과 어긋나지 않도록 강제).

## 기존 아이템 배지 rare/legendary/mythic 티어 일괄 생성

**배경**: 019_seed_worldview.sql로 시딩된 900개 아이템 배지가 전부 `common`뿐이었음. 세력에 귀속된 상위 등급 아이템 배지가 서비스에 한 번도 존재한 적이 없었음(과거 012_item_badges_100.sql의 레전드/미스틱 배지는 `item_book_id`가 없는 고아 배지라 027에서 이미 삭제됨).

**처리**: `type='item' AND rarity='common'`인 모든 배지에 대해, 소속 세력(faction_id)별로 미리 정의한 접두어 템플릿(예: 낭만미식가 rare="곱빼기 ", legendary="명물 ", mythic="전설의 맛집 ")을 이름 앞에 붙이고, 등급별 공통 설명 접미어를 덧붙여 rare/legendary/mythic 3종을 각각 생성. 원본과 동일한 `item_book_id`/`faction_id`/`activity_types`/`drop_weight`를 물려받음 — 즉 기존 아이템북 각각이 이제 common 9개 + rare 9개 + legendary 9개 + mythic 9개, 총 36개 아이템 배지를 보유하게 됨(세력 10개 × 아이템북 10개 기준).

세력이 매핑 안 되는 예외 케이스는 "레어/레전드/미스틱" 범용 접두어로 폴백 처리(COALESCE) — 데이터 유실 없이 전량 커버.
