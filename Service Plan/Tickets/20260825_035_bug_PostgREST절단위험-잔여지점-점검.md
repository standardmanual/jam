---
id: 20260825_035
category: Service
status: OPEN
created: 2026-08-25
closed:
---

# [bug] PostgREST 1000행 절단 위험 잔여 지점 점검 (POI 배지·아이템 배지 근접 지점)

## 배경 / 문제 정의

티켓 [20260825_037](20260825_037_bug_PostgREST-1000행상한-배지조회-절단-일괄점검.md)의 게이트
리뷰·개선 리뷰에서 "이번 티켓 범위(확인된 대상)는 아니지만 여유가 크지 않거나 이론적 절단
가능성이 있는" 지점으로 지목된 것들이다. 실제 오판이 확인된 것은 아니라 즉시 수정 대상은
아니지만, 콘텐츠·유저 활동 총량이 늘어나면 절단이 발생할 수 있어 별도 티켓으로 추적한다.

## 상세 요구사항

### 서비스/코드베이스 관점

**1. `jam-web/src/app/(main)/badges/page.tsx:171` (WARN)**
- 유저 본인의 획득 POI 배지 조회(`badges.in('id', earnedPoiBadgeIds).eq('type','poi')`)가
  POI 배지 카탈로그 총량(1,800+)을 고려하면, 한 유저가 매우 많은 서로 다른 POI(지하철역·산 등)를
  방문해 `earnedPoiBadgeIds`가 1000을 넘을 경우 이론적으로 절단 위험이 있다
  (2026-07-31 POI/산 배지 대량 누락 인시던트와 동일 계열의 실패 모드이나, 그 인시던트는
  카탈로그 쪽이었고 이번은 유저 개인의 획득 이력 쪽으로 성격이 다름)
- 먼저 `SELECT user_id, count(*) FROM user_poi_badge_earns GROUP BY user_id ORDER BY count DESC
  LIMIT 5`로 현재 실제 위험도를 실측 확인한다 (031 개선 리뷰 제안)
- 실측 결과 위험이 확인되면 페이지네이션 또는 bounded 쿼리로 수정

**2. 아이템 배지 설계 총량(900) 근접 지점 — 여유 10%뿐 (INFO)**
- `jam-web/src/app/admin/itembooks/[id]/page.tsx:22` (미배정 아이템 배지 풀)
- `jam-web/src/app/admin/factions/page.tsx:9` (세계관별 배지 카운트)
- `jam-web/src/app/admin/itembooks/page.tsx:11` (`itemBadgesRaw` 조회)
- 현재는 `FACTIONS.md` 설계 총량(세계관 10 × 아이템배지 90 = 900개)에 의해 구조적으로
  1000 미만이 보장되지만, 콘텐츠가 설계 목표에 근접하거나 초과하면 절단 위험으로 전환된다
- 콘텐츠 총량 확장 계획이 있는지 먼저 확인하고, 필요 시 range 페이지네이션 선제 적용

## 구현 계획

1. 1번 항목: 실측 SELECT로 위험도 확인 → 위험 확인 시에만 수정
2. 2번 항목: 콘텐츠 총량 확장 계획 확인 → 계획이 있으면 선제 페이지네이션 적용,
   없으면 "안전, 재검토 필요 시점만 기록"으로 완료 기록에 남기고 종료

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

**1. `(main)/badges/page.tsx` — 유저 획득 체크인(구 POI) 배지 조회 (수정함)**

티켓이 지목한 `:171`은 티켓 작성(2026-08-25) 이후 `type='poi'`가 `type='checkin'`으로
전면 리네임(마이그레이션 `103_rename_poi_badge_to_checkin.sql`, 테이블도
`user_poi_badge_earns` → `user_checkin_badge_earns`)되면서 코드가 이동했다 — 현재는
`earnedCheckinBadgeIds`를 키로 쓰는 `badges.select('*').in('id', earnedCheckinBadgeIds)
.eq('type','checkin')`와 `poi.select(...).in('linked_badge_id', earnedCheckinBadgeIds)`
두 쿼리(약 150~156행)가 동일 실패 모드를 갖고 있었다. 대상만 이동했을 뿐 위험 자체는
그대로 유효하다고 판단해 이어서 점검했다.

**실측 시도와 한계**: 티켓은 `SELECT user_id, count(*) FROM user_poi_badge_earns GROUP BY
user_id ORDER BY count DESC LIMIT 5`로 먼저 실측하라고 지시했으나, 이 저장소에서
jam-developer 서브에이전트는 DB 직접 조회 권한이 없다(트레일메이커 역할 프롬프트가
Supabase MCP 자체를 tools에서 제외 — "실수로라도 실행 경로가 없어야 함"; 037 티켓의
`checker.ts`/`completable.ts` 케이스와 동일한 제약). `.env.local`의 service_role 키로
curl/스크립트를 짜서 우회하는 것도 같은 제약을 회피하는 것이라 하지 않았다. 따라서 실제
최대 보유 행수는 확인하지 못했다.

**판단**: 실측 없이도 위험을 구조적으로 제거하는 수정 비용이 낮고(입력 배열을 청크로
나누기만 하면 됨), 037 티켓이 같은 제약 하에서 `checker.ts`/`completable.ts`를 방어적으로
고친 선례와 일관되게, "측정 후 필요시 수정" 대신 **측정 불가 → 방어적으로 즉시 수정**을
택했다. `earnedCheckinBadgeIds`를 `IN_CHUNK_SIZE`(200, `lib/notifications/batch/shared.ts`에
이미 정의된 상수 — drop-engine/ambient-drop에서도 같은 파일의 `fetchAllRows`를 이미
가져다 쓰고 있어 이 상수도 크로스 도메인으로 재사용 가능하다고 판단)씩 나눠 `badges`·`poi`
두 쿼리 모두 청크 단위로 병렬 조회 후 병합하도록 바꿨다. 청크당 응답이 최대 200행으로
고정되므로 (a) PostgREST 1,000행 상한 절단과 (b) `.in()` URL 길이 상한 두 위험이 유저의
실제 보유량과 무관하게 구조적으로 해소된다. `fetchAllRowsIn`(같은 파일의 청크 헬퍼)을
그대로 쓰지 않은 이유: 그 헬퍼는 실패 시 예외를 던지는데, 이 페이지의 다른 모든 쿼리는
에러를 조용히 무시하고 `?? []`로 폴백하는 관용구를 쓰고 있어(에러 체크 자체가 없음),
헬퍼를 쓰면 이 배치 조회 하나만 실패해도 배지 화면 전체가 크래시하는 방향으로 톤이
바뀐다 — 기존 파일의 관용구를 그대로 유지하기 위해 로컬 청크 루프로 직접 구현했다.

**2. 아이템 배지 설계 총량(900) 근접 지점 3곳 재판정 (수정 없음 — 안전 유지로 판정)**

- `admin/itembooks/[id]/page.tsx:22`(미배정 아이템 배지 풀) — 티켓 작성 이후 별도
  티켓(20260826_011)이 이 지점을 검색 기반 `unassigned=true` API
  (`api/admin/badges/search/route.ts`, `MAX_RESULTS=20`)로 이미 전환해 이번 티켓 범위의
  위험 자체가 소멸했다. 037 감사 표에도 이 API는 이미 "안전"으로 분류돼 있다.
- `admin/factions/page.tsx:9`(세계관별 배지 카운트, `badges.select('faction_id')` 무필터)
  — 변경 없음, 여전히 900건 상한이 구조적으로 유효.
- `admin/itembooks/page.tsx`의 `itemBadgesRaw` 조회 — 티켓 작성 이후 20260826_011에서
  페이지네이션(PAGE_SIZE=30)이 도입되며 `.in('item_book_id', bookIds)`의 `bookIds`가
  "전체 책"에서 "현재 페이지의 책(최대 30권)"으로 좁혀졌다. 900 설계 상한보다도 더
  타이트해져 위험이 줄었을지언정 늘지는 않았다.

**콘텐츠 총량 확장 계획 확인**: `Service Plan/Specs/Content/FACTIONS.md`의 "세계관 신규
추가 시 체크리스트"가 미체크 상태이고, `Business/서비스플랜/02 JAM! 서비스 플랜.md`에도
900(세계관 10×아이템배지 90) 총량을 늘리는 확정 계획은 없다(어드민에 세계관 CRUD 인프라가
있다는 서술은 "착수 시 빠르게 가능"이라는 역량 설명일 뿐 확정 로드맵이 아님). 티켓의
구현 계획 2번 분기("계획 없으면 안전, 재검토 필요 시점만 기록하고 종료")를 따라
`admin/factions/page.tsx`·`admin/itembooks/page.tsx`는 **수정하지 않았다.**
**재검토 필요 시점**: (a) 세계관이 11번째 이상으로 늘거나, (b) 세계관당 아이템배지 90종
설계가 늘어나 총량이 1,000에 근접(여유 10% 이하로 좁혀지는 시점, 대략 총량 900→950
이상)하면 두 지점 모두 range 페이지네이션 선제 적용 필요.

### 변경된 파일
```
jam-web/src/app/(main)/badges/page.tsx
Service Plan/Tickets/20260825_035_bug_PostgREST절단위험-잔여지점-점검.md
```

### 테스트 결과
- [x] `npx tsc --noEmit` 통과 (에러 없음)
- [x] `npm run lint` 전체 실행 — 0 errors, 27 warnings (모두 이번 변경과 무관한 기존
      경고 — `badges/page.tsx`에는 신규 경고 없음)
- [x] `npx vitest run` — 659개 중 658 통과, 1건 실패
      (`design-system/components/patterns/BadgeRevealCarousel.stories.tsx`의 Storybook
      상호작용 테스트, 접근성 라이브 리전 텍스트 어설션 — 이번 변경 파일과 무관한
      기존 실패로 판단, 재확인 안 함)
- [ ] 실측 A/B(체크인 배지 탭 정상 렌더) — staging 병합 후 확인 필요

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [x] 해당 없음 — 사용자 노출 텍스트 변경 없음 (쿼리 방식만 바꿈, 화면 출력 결과는 동일)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

- **"측정 후 필요시 수정" 대신 "측정 불가 → 방어적 수정"을 택함**: 티켓은 실측 SELECT를
  먼저 돌리라고 지시했지만, jam-developer 역할에는 애초에 DB 조회 경로가 없다(트레일메이커
  프롬프트가 명시적으로 Supabase MCP를 tools에서 제외). 이 제약은 037 티켓의
  `checker.ts`/`completable.ts` 처리에서도 동일하게 있었고 그때도 "실측 없이 방어적 수정"을
  택했다 — 이번에도 같은 판단 기준을 일관되게 적용했다. 오케스트레이터/사용자가
  `SELECT user_id, count(*) FROM user_checkin_badge_earns GROUP BY user_id ORDER BY count DESC
  LIMIT 5`로 실측하면 이 판단(수정이 필요했는지)을 사후 검증할 수 있다.
- **`fetchAllRowsIn` 대신 로컬 청크 루프**: 기존 헬퍼는 에러 시 예외를 던지는 정책이라
  이 페이지의 "에러는 조용히 무시하고 빈 배열로 폴백" 관용구와 어긋난다. 상수(`IN_CHUNK_SIZE`)만
  재사용하고 로직은 로컬로 직접 구현해 기존 파일 톤을 유지했다.
- **아이템 배지 900 총량 지점은 이번 티켓에서 페이지네이션을 적용하지 않음**: 티켓이 제시한
  분기 조건(콘텐츠 확장 계획 유무)을 그대로 따른 결과다. 확장 계획이 확인되지 않아 스펙에
  없는 선제 리팩터링을 하지 않았다(가드레일 §7).

### 잔여 이슈
- `admin/factions/page.tsx:9`(세계관별 배지 카운트 합산)는 세계관이 11개 이상으로 늘거나
  세계관당 아이템배지 수가 90종을 초과하는 시점에 재검토 필요 — 현재는 페이지네이션
  미적용.
- 체크인 배지 탭 청크 조회 정상 동작(다건 획득 시나리오)은 staging 병합 후 실측 A/B 필요.
