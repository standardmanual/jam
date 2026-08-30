---
id: 20260830_1620
category: BadgeEngine
status: OPEN
created: 2026-08-30
closed:
---

# [BadgeEngine] 비활성 POI를 드랍·체크인·매칭 로직에서 제외

## 배경 / 문제 정의
티켓 `20260830_1619`에서 `poi.is_active` 컬럼과 어드민 토글 UI를 추가했지만, 그 티켓은
**어드민 화면 전용**으로 범위를 한정했다 — `is_active=false`로 꺼도 실제 드랍 생성·체크인
판정·POI 매칭에는 아무 영향이 없다. 관리자가 "이 지점은 더 이상 쓰지 않는다"고 어드민에서
표시해도, 유저 쪽에서는 여전히 드랍이 뜨고 체크인이 되는 상태다 — 어드민 토글이 실질적
효과가 없어 보이는 간극이 생긴다.

이 티켓은 `20260830_1619` 작업 중 오케스트레이터가 사용자에게 범위를 확인한 결과("권장으로
진행하되 드랍/체크인 로직 관련 작업을 티켓으로 남김")에 따라 분리된 후속 작업이다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `poi` 테이블을 조회해 드랍 생성·체크인·매칭에 쓰는 다음 지점들을 실사해 `is_active=false`
  POI를 제외해야 하는지 판단하고 반영한다 (아래는 오케스트레이터가 `grep`으로 찾은 후보
  목록 — 구현자가 각 파일을 열어 실제로 활성 필터가 필요한 로직인지 재확인할 것):
  - `jam-web/src/lib/poi/matcher.ts` — POI 매칭 핵심 로직
  - `jam-web/src/app/api/drops/route.ts`, `jam-web/src/app/api/drops/debug/route.ts`,
    `jam-web/src/app/api/drops/[dropId]/pickup/route.ts` — 드랍 생성/픽업
  - `jam-web/src/app/api/checkin-badges/route.ts` — 체크인 배지 판정
  - `jam-web/src/lib/ambient-drop/index.ts` — 앰비언트 드랍
  - `jam-web/src/lib/notifications/batch/dropSpot.ts` — 드랍 스팟 알림 배치
  - `jam-web/src/app/(main)/drops/page.tsx`, `jam-web/src/app/(main)/badges/page.tsx`,
    `jam-web/src/app/(main)/badges/[id]/page.tsx` — 유저 노출 화면(지도·목록에서 비활성
    POI가 계속 보이는지 확인)
- 이미 발급된(과거) 배지·드랍 이력에는 영향 없어야 한다 — "앞으로의 신규 드랍/체크인 판정"만
  막는 것이지 과거 기록을 소급 처리하지 않는다.
- 회귀 위험: 위 파일들은 배지 드랍 엔진의 핵심 경로라 `Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md`
  대조가 필수다(`jam-work` `engine` 유형 절차 참고).

### UI/UX 관점
- 비활성 POI가 유저 화면(지도·드랍 목록)에서 어떻게 보여야 하는지 결정 필요 — 완전히 숨길지,
  "운영 종료" 등으로 표시할지는 이 티켓 구현 단계에서 정책 결정 필요(현재 미정).

### 컨텐츠 관점
- 해당 없음

## 구현 계획
> 완료 — 후보 파일을 전부 열어 실사한 뒤, 실제로 "신규 판정" 경로인 곳만 필터를 추가했다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`poi.is_active=false`(운영 종료)를 "앞으로의" 신규 드랍 생성·체크인 판정·매칭·시스템 배치에서
제외했다. 이미 발급된 배지·이미 놓인 드랍(유저 드랍·앰비언트 드랍 모두)에는 소급 적용하지
않는다. 유저 노출 정책은 **완전히 숨김**으로 결정(대안이었던 "운영 종료" 표시는 스펙 미정
상태에서 굳이 새 UI 상태를 만들 이유가 없어 채택하지 않음).

**필터 적용**:
- `matcher.ts`(`matchPoisForActivity`) — 체크인 배지 판정의 유일한 매칭 경로. 스트라바 싱크는
  신규 활동만 처리하므로 과거 이력에 영향 없음.
- `api/drops/route.ts` GET(지도·목록 T1 POI 노출 + T2 네이버 폴백 판단용 카운트) / POST(드랍
  생성 시 서버측 재검증, 비활성이면 `poi_not_found`로 거부 — 캐시된 poi_id 방어).
- `api/checkin-badges/route.ts` — 지도의 체크인 배지 마커 노출.
- `lib/ambient-drop/index.ts` — 시스템이 새로 배치할 후보 POI.
- `(main)/drops/page.tsx` — 알림 딥링크(`?poi=`) 포커스 지점 조회.
- `(main)/badges/[id]/page.tsx` — **미획득** 체크인 배지의 "여기로 가보세요" 안내
  (`PoiMapButton`)용 `linked_badge_id` 조회.

**필터 미적용(의도적, 근거는 BADGE_ENGINE_UNIFIED.md §3.17에 정리)**:
- `api/drops/[dropId]/pickup/route.ts` — 이미 놓인 드랍의 픽업은 신규 판정이 아니라 기존
  거래 완결이라 그대로 허용.
- `api/drops/debug/route.ts` — 어드민 전용 원시 DB 진단 도구, 드랍/체크인 판정 경로가 아님.
- `lib/notifications/batch/dropSpot.ts` — 기존 활성 드랍(`is_available`) 열람 알림, pickup과
  동일 취급.
- `(main)/badges/page.tsx` 체크인 탭, `badges/[id]/page.tsx`의 **획득 이력** 조회(`earned.poi`,
  `checkinEarns[i].poi`) — 전부 과거 이력 화면이라 소급 금지 원칙상 무관.

`Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md`에 §3.17을 신설해 적용/미적용 지점과 근거를
문서화했다.

**게이트 리뷰 FAIL 재작업(2차)**: `api/drops/route.ts` GET에서 `allDbPois` 조회에
`is_active=true` 필터를 걸었더니, 같은 결과가 `refreshPoisInBackground`에 전달되는
`naverIdMap`(existingNaverIds — `searchAndPersistCategories`의 중복 삽입 방지 키) 구성에도
재사용되는 게 문제였다. 관리자가 `naver_id`를 가진 T2 POI를 비활성화한 뒤 검색 캐시 TTL이
만료돼 재검색이 돌면, 네이버가 같은 장소를 다시 반환할 때 `naverIdMap`에 없다고 오판(비활성
POI라 필터로 빠졌으므로) → INSERT 시도 → `naver_id` UNIQUE 제약 위반 → 그 배치의 진짜 신규
POI까지 저장 실패(에러가 조용히 삼켜짐)하는 회귀였다. **수정**: bbox 쿼리 자체에서는
`is_active` 필터를 제거하고 전량(`allDbPois`)을 가져와 `naverIdMap`은 그대로 전체 기준으로
구성하되, 유저 노출용 `nearbyDbPois`/`allPois`/드랍 카운트 집계는 별도로 만든
`activeDbPois = allDbPois.filter(p => p.is_active)`에서 계산하도록 분리했다. 다른 필터 적용
지점(matcher.ts, checkin-badges/route.ts, ambient-drop/index.ts 등)은 게이트 리뷰에서 이미
타당하다고 확인된 그대로 유지했다(변경 없음).

### 변경된 파일
```
jam-web/src/lib/poi/matcher.ts
jam-web/src/app/api/drops/route.ts
jam-web/src/app/api/checkin-badges/route.ts
jam-web/src/lib/ambient-drop/index.ts
jam-web/src/app/(main)/drops/page.tsx
jam-web/src/app/(main)/badges/[id]/page.tsx
jam-web/src/types/database.ts (PoiRow.is_active 주석 갱신)
Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md (§3.17 신설)
```

### 테스트 결과
- [x] `cd jam-web && npm run lint` 전체 실행 — 0 errors, 25 warnings(전부 이번 변경과 무관한
      기존 경고, 변경 전후 건수 동일 — 신규 warning 없음)
- [ ] 실제 화면 확인(어드민에서 POI 비활성화 후 지도·드랍·체크인 흐름) — DB 마이그레이션 없이
      기존 `is_active` 컬럼을 그대로 쓰므로 staging 병합 후 즉시 확인 가능하나, 이 세션에서는
      실행하지 않음(코드 레벨 검증만 수행)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
- **유저 노출 정책 = 완전히 숨김.** 지도·목록·알림 딥링크 어디서도 비활성 POI가 보이지 않게
  했다. "운영 종료" 배지 같은 대안 UI는 만들지 않았다 — 이 티켓 시점에는 스펙 미정이었고,
  최소 침습적인 기본안을 우선 적용했다(추후 필요하면 별도 티켓으로 UI 추가 가능).
- **픽업은 신규 판정이 아니라는 기준으로 pickup 경로와 dropSpot 알림은 필터에서 제외.** "앞으로의
  신규 드랍/체크인 판정만 막는다"는 티켓 요구사항을 문자 그대로 지키면, 이미 존재하는 드랍의
  완결(픽업)까지 막는 것은 과잉이라고 판단했다 — POI가 나중에 비활성화됐다고 이미 놓인
  아이템이 영구히 못 줍는 상태로 묶이면 유저 입장에서 손해다.
- **POST /api/drops에 서버측 재검증 추가.** GET에서 이미 숨겨지므로 정상 흐름에서는 도달하지
  않지만, 클라이언트가 들고 있던 캐시된 poi_id로 요청하는 경로를 방어했다. 에러 코드는 새로
  만들지 않고 기존 `poi_not_found`를 재사용했다(이미 "이 지점 정보를 불러오지 못했어요" 문구가
  매핑돼 있어 UX 가이드라인상 새 문구를 추가할 필요가 없다고 판단).
- **작업 중 다른 병렬 세션(티켓 20260830_2000, `ambient-drop` fetchAllRows 리팩터)이 같은
  파일(`lib/ambient-drop/index.ts`)을 동시에 편집 중이던 것을 발견했다** — 해당 세션은 자기
  브랜치(`claude/jamwork-20260830_2000-ambient-drop-fetchallrows`)에 정상적으로 커밋하고
  빠져나가 실질적 충돌은 없었지만, 한때 같은 워킹 디렉터리에서 미커밋 변경이 겹쳐 있어 파일
  덮어쓰기 위험이 있었다(Edit 도구가 "파일이 읽은 후 변경됨" 오류로 자동 방지). 이후 리뷰
  브랜치는 `origin/staging` 기준 신규 체크아웃으로 분리해 오염 없이 커밋했다.

### 잔여 이슈
- 유저 노출 정책(완전 숨김 vs "운영 종료" 표시)은 향후 UX 검토에서 재논의될 수 있다.
