# JAM! Phase 8 구현 단계

> 작성일: 2026-07-14

---

## Phase 8-A: 데이터 기반 (DB + 어드민)

**목표**: 세계관/아이템북/배지 데이터 구조 완성 + 어드민에서 전체 관리 가능

### 작업 목록

1. **DB 마이그레이션** (`supabase/migrations/014~018`)
   - `factions` 테이블 생성
   - `badges` 컬럼 추가 (faction_id, item_book_id, drop_weight, drop_condition_json)
   - `item_books` 컬럼 추가/제거 (faction_id, story_text, is_active, drop_condition_json, required_item_badge_ids 제거)
   - `user_item_book_slots`, `user_item_book_completions` 생성
   - `inventory_items.slotted_in` 추가
   - Public 세계관 seed + 기존 배지 배정

2. **어드민 — 세계관 관리** (`/admin/factions`)
   - 목록: 세계관 이름, drop_weight, is_active, 배지 수
   - 생성/편집: 모든 속성 + 드랍 조건 설정 UI
   - 삭제: 소속 배지 있으면 경고 후 확인

3. **어드민 — 아이템 배지 편집 변경**
   - 세계관 선택 드롭다운 추가
   - 소속 아이템북 표시 (읽기 전용)
   - drop_weight 슬라이더 (0.1~10.0)
   - 드랍 조건 설정 (activity_types 체크박스, 거리/고도/시간 min 입력)
   - 상위 상속 조건 미리보기 (세계관 → 아이템북 조건 표시)

4. **어드민 — 아이템북 편집 변경**
   - 세계관 선택 드롭다운 추가
   - story_text 텍스트에어리어 추가
   - is_active 토글 추가
   - 드랍 조건 설정 (세계관 조건 상속 표시 + override)
   - **배지 슬롯 관리 UI**: 현재 배정 배지 목록 + 배지 추가(item_book_id 세팅) + 배지 제거(item_book_id NULL)

5. **TypeScript 타입 업데이트** (`src/types/database.ts`)
   - `FactionRow`, `UserItemBookSlotRow`, `UserItemBookCompletionRow` 추가
   - `BadgeRow`, `ItemBookRow` 타입 업데이트

### 완료 기준
- 어드민에서 세계관 CRUD 완전 동작
- 배지에 세계관/아이템북 배정 가능
- 아이템북에서 배지 슬롯 추가/제거 가능
- 드랍 조건 3단계 상속 어드민 UI에서 확인 가능

---

## Phase 8-B: 드랍 엔진 업그레이드

**목표**: 활동 조건 기반 드랍 풀 필터링 + 가중치 적용

### 작업 목록

1. **`tryItemDrop` 엔진 수정** (`src/lib/drop-engine/index.ts`)
   - 활동 정보(type, distance, elevation, duration) 파라미터 확장
   - 드랍 풀 구성 시 faction/item_book/badge의 drop_condition_json 3단계 평가
   - rarity 추첨 후 drop_weight 기반 가중치 랜덤 선택

2. **드랍 조건 평가 함수** (`src/lib/drop-engine/condition.ts`)
   ```typescript
   function resolveDropCondition(
     faction: DropCondition | null,
     itemBook: DropCondition | null,
     badge: DropCondition | null
   ): DropCondition  // 3단계 교집합/최댓값 적용
   
   function matchesActivity(
     condition: DropCondition,
     activity: NormalizedActivity
   ): boolean
   ```

3. **Strava sync 연동** (`src/lib/strava/sync.ts`)
   - `tryItemDrop` 호출 시 활동 정보 전달

### 완료 기준
- 러닝 활동 시 러닝 조건 배지만 드랍되는 것 어드민 시뮬레이터로 확인
- drop_weight 변경 시 드랍 분포 변화 확인
- 활동 조건 없는 배지(Public)는 기존대로 드랍

---

## Phase 8-C: 유저 화면 — 아이템북 슬로팅

**목표**: 유저가 아이템북을 발견하고 배지를 슬롯에 넣어 완성하는 경험

### 작업 목록

1. **아이템북 목록 화면 변경** (`/itembooks`)
   - 보유 배지가 속한 아이템북만 노출
   - 세계관별 그룹핑 (선택)
   - 완성 여부 표시

2. **아이템북 상세 화면** (`/itembooks/[id]`)
   - 세계관 정보 헤더 (이름, 슬로건, 대표 이미지)
   - story_text 표시
   - 슬롯 그리드:
     - 보유 배지 슬롯: 이미지 + 인벤토리 수량 + "추가" 버튼
     - 장착된 슬롯: 이미지 + "제거" 버튼
     - 미보유 슬롯: 흐림 처리 + 조건 힌트
   - 완성 시 완성 배너

3. **슬롯 API** (`src/app/api/itembooks/[id]/slot/route.ts`)
   - `POST`: 배지 장착 (inventory_items → user_item_book_slots 이동, slotted_in 세팅)
   - `DELETE`: 배지 제거 (slotted_in = NULL, slot row 삭제)
   - 완성 감지 및 `user_item_book_completions` INSERT

4. **새 배지 드랍 알림 연동**
   - 드랍된 배지가 아이템북 소속이면 → activity feed에 아이템북 발견 이벤트 추가

5. **인벤토리 화면 변경**
   - 슬롯 장착 배지 필터링 (기본적으로 숨김, 아이템북 사용 중 탭 별도 표시)

### 완료 기준
- 드랍 → 아이템북 노출 → 슬롯 추가 → 완성까지 전체 플로우 동작
- 슬롯에서 제거 시 인벤토리 복귀 확인
- 완성 최초 1회만 기록 확인

---

## Phase 8-D: 데이터 일괄 입력

**목표**: 10개 세계관 × 10개 아이템북 × 9개 배지 데이터 입력

### 작업 목록

1. CSV 데이터 파일 수령 (운영팀 제공)
2. `supabase/seeds/004_factions_initial.sql` 생성
3. 배지 이미지 업로드 및 URL 세팅
4. 데이터 검증 쿼리 실행
   ```sql
   SELECT f.name, COUNT(ib.id) as books, COUNT(b.id) as badges
   FROM factions f
   LEFT JOIN item_books ib ON ib.faction_id = f.id
   LEFT JOIN badges b ON b.item_book_id = ib.id
   GROUP BY f.id, f.name
   ORDER BY f.sort_order;
   ```

### 완료 기준
- 11개 세계관 (Public + 10개) 생성 확인
- 10개 세계관 × 10개 아이템북 = 100개 아이템북 확인
- 각 아이템북에 배지 9개 배정 확인
