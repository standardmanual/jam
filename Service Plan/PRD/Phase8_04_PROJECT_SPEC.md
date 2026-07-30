# JAM! Phase 8 프로젝트 스펙

> 작성일: 2026-07-14  
> AI 코딩 에이전트 행동 규칙

---

## 절대 하지 마

- `required_item_badge_ids` (JSONB 배열) 컬럼을 새로 사용하거나 참조하지 말 것 — Phase 8에서 삭제됨
- 아이템 배지를 복수의 `item_book_id`에 배정하는 로직을 만들지 말 것 — 1배지:1아이템북 전속
- 슬로팅 시 인벤토리의 슬롯 수(`used_slots`)를 감소시키지 말 것 — 슬롯은 인벤토리 용량 기준, 아이템북은 별도 공간
- 완성 트리거를 매번 발화하지 말 것 — `user_item_book_completions`에 없을 때만 INSERT
- 하위 드랍 조건이 상위보다 더 넓은 조건을 허용하는 로직을 만들지 말 것

---

## 핵심 데이터 흐름

### 슬로팅 (배지 장착)

```
POST /api/itembooks/[id]/slot
body: { inventory_item_id: string }

1. inventory_items 에서 해당 row 조회 — user 소유 확인, slotted_in IS NULL 확인
2. 해당 inventory_item의 badge_id가 item_books[id]의 배지 슬롯에 속하는지 확인
   → badges WHERE id = badge_id AND item_book_id = [id]
3. user_item_book_slots INSERT
4. inventory_items.slotted_in = 새로 생성된 slot.id 로 UPDATE
5. 완성 체크: 해당 item_book의 모든 배지 슬롯이 채워졌는지 확인
   → SELECT COUNT(*) FROM badges WHERE item_book_id = [id]
   → SELECT COUNT(*) FROM user_item_book_slots WHERE item_book_id = [id] AND user_id = [uid]
   → 같으면 완성 트리거
6. 완성 트리거:
   → user_item_book_completions INSERT (ON CONFLICT DO NOTHING)
   → 보상 로직 (있으면)
   → 피드 이벤트 기록
```

### 슬롯 제거 (배지 반환)

```
DELETE /api/itembooks/[id]/slot/[badge_id]

1. user_item_book_slots 에서 해당 row 조회 — user 소유 확인
2. inventory_items.slotted_in = NULL 로 UPDATE
3. user_item_book_slots row 삭제
```

### 드랍 풀 결정

```typescript
// src/lib/drop-engine/condition.ts

function buildDropPool(activity: NormalizedActivity): Promise<BadgeRow[]> {
  // 1. 전체 active 아이템 배지 + faction + item_book JOIN
  // 2. 각 배지에 대해 resolveDropCondition(faction, itemBook, badge) 계산
  // 3. matchesActivity(resolvedCondition, activity) 통과한 배지만 반환
}

function resolveDropCondition(
  faction: DropCondition | null,
  itemBook: DropCondition | null,
  badge: DropCondition | null
): DropCondition {
  // activity_types: 교집합 (각 레벨이 null/빈배열이면 전체 허용으로 취급)
  // min_*: Math.max() — 가장 엄격한 값 적용
}
```

---

## API 엔드포인트 목록 (Phase 8 신규)

| Method | Path | 설명 |
|--------|------|------|
| GET | /api/admin/factions | 세계관 목록 |
| POST | /api/admin/factions | 세계관 생성 |
| GET | /api/admin/factions/[id] | 세계관 상세 |
| PUT | /api/admin/factions/[id] | 세계관 수정 |
| DELETE | /api/admin/factions/[id] | 세계관 삭제 |
| POST | /api/itembooks/[id]/slot | 배지 슬롯 장착 |
| DELETE | /api/itembooks/[id]/slot/[badge_id] | 배지 슬롯 제거 |
| GET | /api/itembooks/discovered | 유저가 발견한 아이템북 목록 |

---

## RLS 정책

```sql
-- factions: 전체 읽기 (어드민만 쓰기)
CREATE POLICY "factions: 전체 읽기" ON public.factions
  FOR SELECT TO authenticated USING (TRUE);

-- user_item_book_slots: 본인만 읽기/쓰기
CREATE POLICY "slots: 본인만 읽기" ON public.user_item_book_slots
  FOR SELECT USING (auth.uid() = user_id);

-- user_item_book_completions: 본인만 읽기
CREATE POLICY "completions: 본인만 읽기" ON public.user_item_book_completions
  FOR SELECT USING (auth.uid() = user_id);

-- 슬롯 INSERT/DELETE는 service_role (서버 사이드 API에서만)
```

---

## 어드민 UI 컴포넌트 패턴

### 드랍 조건 설정 컴포넌트 (`DropConditionEditor`)

재사용: 세계관/아이템북/배지 편집 폼 모두 동일 컴포넌트.

```tsx
<DropConditionEditor
  value={dropCondition}
  onChange={setDropCondition}
  inheritedFrom={parentCondition}  // 상위 조건 표시용
/>
```

Props:
- `value`: 현재 설정값
- `onChange`: 변경 핸들러
- `inheritedFrom`: 상위(세계관/아이템북)에서 상속된 조건 (읽기 전용 표시)

### 배지 슬롯 관리 컴포넌트 (`ItemBookBadgeSlots`)

아이템북 편집 폼에서 사용.

동작:
- 현재 `badges WHERE item_book_id = [id]` 목록 표시
- "배지 추가" → 배지 검색/선택 모달 (item_book_id IS NULL 인 배지만 검색 가능)
- "제거" → `badges.item_book_id = NULL` 업데이트 확인 모달

---

## [NEEDS CLARIFICATION]

- 아이템북 완성 보상으로 지급되는 배지/포인트 종류 — 어드민에서 설정 가능하게 할지, 하드코딩할지
- 유저 화면에서 미보유 배지 슬롯의 힌트 수준 — 배지 이름 공개 vs 조건만 공개 vs 완전 블라인드
- 세계관 리더보드 (세계관별 완성 순위) 필요 여부 — Phase 8에서 제외 여부 결정 필요
- Public 세계관의 아이템북 생성 계획 유무
