# JAM! Phase 16 프로젝트 스펙 — POI 배지 타입 추가

> 작성일: 2026-07-27

---

## 1. 기술 스택 (기존 유지, 신규 의존성 없음)

기존 Next.js + Supabase 패턴 그대로. Haversine 매칭·Strava Streams 연동 등은 전부 기존 `src/lib/poi/matcher.ts`, `src/lib/strava/sync.ts`를 재사용 — 새 라이브러리 불필요.

## 2. 파일 구성

```
[마이그레이션]
supabase/migrations/0XX_badge_type_poi.sql          # badge_type ENUM에 'poi' 추가 (Phase16_02 §1)
supabase/migrations/0XX_user_poi_badge_earns.sql    # 신규 테이블 (Phase16_02 §2)

[타입]
src/types/database.ts        # BadgeType에 'poi' 추가, UserPoiBadgeEarnRow 신설, BadgeCondition.poi_id 제거 (수정)

[배지 엔진 / 동기화]
src/lib/badge-engine/index.ts    # poi_id 조건 분기 제거 (수정)
src/lib/strava/sync.ts           # POI 매칭 루프에 poi 타입 분기 추가 (수정)
src/lib/itembook/checker.ts      # 완성 판정에 poi 타입 포함 (수정)

[어드민]
src/app/api/admin/poi/search/route.ts     # 신규 — 등록된 POI 이름 검색(어드민 배지 폼용)
src/app/admin/badges/BadgeForm.tsx        # poi 타입 분기 UI, condPoiId 제거 (수정)
src/app/api/admin/badges/route.ts         # poi 타입 저장 시 condition_json null 처리 (수정)
src/app/api/admin/badges/[id]/route.ts    # 동일 (수정)
src/app/admin/badges/page.tsx             # 페이지네이션 추가 (수정)
src/app/admin/_shared/Pagination.tsx      # (선택) POI 관리에서 쓰던 컴포넌트를 공용 위치로 이동

[서비스 UI]
src/app/(main)/badges/[id]/page.tsx           # poi 타입 획득 이력 리스트 렌더링 (수정)
src/app/(main)/itembooks/[id]/page.tsx        # poi 타입 소속 배지 표시(슬롯팅 없음) (수정)
```

## 3. 구현 규칙

- **`user_activity_badges`는 절대 건드리지 않는다** — 스키마도, 그 테이블을 읽는 기존 쿼리도. POI 배지의 반복 발급은 전적으로 `user_poi_badge_earns` 신규 테이블에서만 처리한다. 기존 활동/아이템 배지의 "1인1회" 제약은 이번 Phase의 변경 대상이 아니다.
- **`poi.linked_badge_id`는 다대일로 이미 동작한다** — 스키마 변경 없이, 여러 `poi` 행이 같은 `badge_id`를 가리키게 하는 것만으로 "배지 1개 : POI 여러 개"를 구현한다. 새 조인 테이블을 만들지 않는다.
- **`poi.radius_meters`를 그대로 판정 반경으로 쓴다** — 신규 컬럼(`badge_radius_meters` 등) 추가 금지. 기본값 50은 이미 스키마 기본값과 일치.
- **아이템북 "보유" 판정은 타입별로 다르다** — `item`은 슬롯팅(인벤토리 소비), `poi`는 1회 이상 획득 존재 여부(소비 없음, 반복 가능). 이 차이를 하나의 공통 함수로 억지로 통합하려 하지 말고 `checker.ts` 내부에서 타입별 분기로 명확히 분리한다.
- **동기화 재처리 안전장치**: `user_poi_badge_earns`에 `UNIQUE(user_id, badge_id, poi_id, triggered_by_strava_id)`를 반드시 건다 — 이게 없으면 Strava 웹훅 재전송이나 수동 재싱크 시 같은 활동에서 같은 배지가 중복으로 쌓인다. insert 시 `23505` 에러는 무시하고 계속 진행(기존 `user_activity_badges` insert 패턴과 동일).
- **어드민 배지 폼의 POI 검색은 기존 "네이버 검색"(`/api/admin/poi/naver-search`)과 다르다** — 이건 이미 JAM! DB에 등록된 POI를 찾는 것이므로 새 엔드포인트(`/api/admin/poi/search`)를 만든다. 두 API를 혼동하지 않는다.
- **페이지네이션 컴포넌트는 새로 만들지 않는다** — Phase 15에서 만든 `src/app/admin/poi/Pagination.tsx`를 그대로 재사용(옮기거나 import). 새 UI 패턴 발명 금지.

## 4. 절대 하지 마

- `user_activity_badges`의 `UNIQUE(user_id, badge_id)` 제약 제거/완화 — 활동/아이템 배지의 "1회만 보유" 시맨틱이 깨짐
- POI 배지 발급에 `inventory_items` 테이블 사용(유저가 명시적으로 배제함 — 인벤토리는 아이템 배지 수량 제한 전용 개념)
- POI 배지를 드랍/픽업(`poi_drops`) 시스템과 연결
- 판정 반경을 코드에 하드코딩(어드민이 POI별로 입력한 `radius_meters` 값을 항상 존중)
- `badge_type` ENUM을 POI 카테고리처럼 테이블로 전환(이건 어드민이 자유 생성하는 대상이 아니라 코드 분기용 고정 3종 — 과설계 금지)
- 배지 조건 빌더의 `poi_id` 죽은 필드를 남겨두고 새 UI만 얹기(반드시 제거 — 두 메커니즘이 공존하면 "왜 이 배지는 조건에 POI를 넣었는데 발급이 안 되지" 같은 혼란 재발)

## 5. 완료 체크리스트

- [ ] Step A: `badge_type`에 `poi` 추가 + `user_poi_badge_earns` 테이블 마이그레이션 적용
- [ ] Step B: 배지 엔진 죽은 코드 제거 + Strava 동기화 POI 매칭 분기 확장(반복 발급 확인)
- [ ] Step C: 어드민 배지 폼에서 POI 타입 선택 + 검색/다중 연결 UI 동작
- [ ] Step D: 어드민 배지 목록 페이지네이션 동작
- [ ] Step E: 배지 상세 획득 이력 리스트(최신순) + 아이템북 완성 판정 확장(POI 단독/혼합 둘 다)
- [ ] Step F: 반복 발급·타입별 회귀 없음 시나리오 전부 통과
- [ ] Step G: `tsc` 0 에러 + SERVICE_OPERATIONS 문서 + 마이그레이션 직접 실행 + 배포 확인 + commit/push
