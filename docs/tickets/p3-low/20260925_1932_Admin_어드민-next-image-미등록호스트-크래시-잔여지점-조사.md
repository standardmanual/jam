---
id: "20260925_1932"
category: Admin
priority: P3
status: CLOSED
created: 2026-09-25
closed: 2026-09-25
---

# [Admin] 어드민 next/image 미등록 호스트 크래시 잔여 지점 조사와 방침 결정

> 티켓 [20260925_1411](../p2-normal/20260925_1411_Admin_에셋제너레이터-홈피드-적용탭-제작경로표시.md)
> 로컬 실렌더에서 발견한 결함(패치 142bf1da)의 잔여 이슈 1번. **조사 티켓이며 이 티켓에서는 코드를
> 고치지 않는다.**

## 핵심 요약

- 요구사항: 어드민에서 `next/image`를 직접 쓰는 파일 10개가 미등록 호스트 URL을 만나 화면 전체가
  오류 화면으로 바뀔 수 있는지 조사하고, 어드민 이미지 렌더 방침(`SafeImage` 통일 여부)을 정한다.
- 구현 계획: 코드 수정 없음. 파일별 URL 출처 분류 → 프로덕션 DB 읽기 전용 실측 → 방침 A/B/C 제시
  → 사용자 결정 → 필요하면 수정 티켓을 분할안으로 제안한다. 담당은 카리나(research 유형).
- 관련 파일: 아래 「사실」 절의 10개 파일, `jam-web/src/components/SafeImage.tsx`,
  `jam-web/src/lib/imageSrc.ts`(`IMAGE_REMOTE_PATTERNS`·`isOptimizableImageSrc`),
  `jam-web/next.config.ts`(`images.remotePatterns`).

## 배경 / 문제 정의

### 사실 (2026-09-25 명령으로 확인한 결과)

- **발견 경위**: 1411 로컬 실렌더에서 에셋 제너레이터 적용 탭이 홈피드 카드를 선택하자
  `next/image`가 `storage.heypop.kr`이 `images.remotePatterns`에 없다며 예외를 던졌고, 어드민
  화면 전체가 오류 화면으로 바뀌었다. 패치 142bf1da는 해당 `<Image>`에 `unoptimized`만 붙였다.
- **허용 호스트**: `IMAGE_REMOTE_PATTERNS`는 2종이다. `ceehnkzdbecxwzxrhhns.supabase.co`(경로
  `/storage/v1/object/public/**`), `*.googleusercontent.com`.
- **`today_cards.cover_image_url` 실측(프로덕션, 읽기 전용)**: 이미지가 있는 13건 중 외부 호스트
  11건(`storage.heypop.kr` 10건, `cdn.news.bbsi.co.kr` 1건), 내부 경로(`/badges/sample/…`) 2건,
  Supabase Storage 0건이다.
- **자유 입력 경로 하나 확인**: 홈피드 수정 화면(`TodayCardForm.tsx`)의 커버 이미지 URL은 업로드
  필드가 아니라 텍스트 입력이라, 운영자가 임의 호스트 URL을 넣을 수 있다. 이 화면 자체는
  `next/image`를 직접 쓰지 않는다. 위 `today_cards` 외부 호스트 11건이 이 폼으로 들어왔는지, seed
  SQL 등 다른 경로로 들어왔는지는 확인하지 않았다.
- **어드민에서 `next/image`를 직접 쓰는 파일 10개**(`SafeImage` 미사용):
  - `jam-web/src/app/admin/asset-generator/ApplyTab.tsx` (패치 142bf1da로 `unoptimized` 적용)
  - `jam-web/src/app/admin/itembooks/ItemBookForm.tsx`
  - `jam-web/src/app/admin/item-badges/ItemBadgesTable.tsx`
  - `jam-web/src/app/admin/item-badges/orphaned/OrphanedItemsTable.tsx`
  - `jam-web/src/app/admin/item-badges/[badgeId]/[itemId]/page.tsx`
  - `jam-web/src/app/admin/item-badges/[badgeId]/page.tsx`
  - `jam-web/src/components/admin/drop-policy/DropExclusionBadgesTable.tsx`
  - `jam-web/src/components/admin/badges/BadgeCard.tsx`
  - `jam-web/src/components/admin/badges/BadgesTable.tsx`
  - `jam-web/src/components/admin/badges/BadgeDetail.tsx`
- **사용 현황 집계**: `next/image`를 직접 쓰는 파일은 전체 29개(어드민 10개)이고, `SafeImage`를
  쓰는 파일은 전체 9개(어드민 2개)다.
- **선행 티켓**: [20260824_004](../p1-high/20260824_004_bug_홈화면-투데이카드-외부이미지호스트-렌더실패.md)가
  `SafeImage`를 만들어 투데이 카드를 고쳤고,
  [20260824_005](../p0-urgent/20260824_005_bug_어드민-자유입력-이미지URL-전수대응.md)가 미션·컬렉션·
  트라이브 렌더 지점을 `SafeImage`로 전환하고 `ImageUploadField`의 `allowManualUrl` 기본값을
  `false`로 뒤집었다. 005의 실태 조사(2026-08-24)에서 미션·컬렉션·트라이브·배지·사용자 아바타의
  미등록 호스트 건수는 0건이었다. 005의 전환 대상은 서비스 화면 렌더 지점이 중심이었다.

### 아직 확인하지 않은 것

- 위 10개 파일이 렌더하는 URL이 각각 어떤 DB 컬럼에서 오는지, 그 컬럼에 자유 입력 경로가
  있는지 (파일을 열어 확인하지 않았다).
- 005 이후 어드민에 새로 생긴 이미지 렌더 지점이 있는지(에셋 제너레이터 적용 탭이 그런 사례다).
- 10개 파일 밖에서 `<Image>`를 `next/image`가 아닌 다른 경로로 그리는 어드민 화면이 있는지.

## 상세 요구사항

### 서비스/코드베이스 관점

1. **파일별 분류표**: 10개 파일마다 「렌더하는 URL의 출처(DB 컬럼·업로드·자유 입력) · 미등록
   호스트가 들어올 수 있는 경로 · 근거(파일:줄)」를 적는다.
2. **DB 실측(읽기 전용)**: 유입 가능성이 있는 컬럼마다 `isOptimizableImageSrc()`와 같은 기준으로
   미등록 건수를 센다(005와 같은 방식, 쓰기 없음).
3. **방침 후보 제시**:
   - A. 어드민 렌더 지점을 `SafeImage`로 통일(로드 실패도 폴백으로 흡수, 프로젝트가 이미 쓰는 방식).
   - B. 지점마다 `unoptimized`로 우회(현재 ApplyTab의 임시 패치 방식).
   - C. `IMAGE_REMOTE_PATTERNS`에 외부 호스트를 추가(호스트가 계속 늘어나고 운영자가 임의
     호스트를 넣을 수 있어 근본 해결이 아니다).
4. **ApplyTab 임시 패치 처리**: 방침이 A로 정해지면 142bf1da의 `unoptimized`를 `SafeImage`로
   교체할지 함께 결정한다.

## 결정 기록

- **2026-09-25 사용자가 방침 A(어드민 렌더 지점을 `SafeImage`로 통일)를 결정했다.** ApplyTab 임시 패치(142bf1da)는
  방침 A의 일부로 `SafeImage`로 교체한다(수정 티켓 20260925_2319에 포함).

## 구현 계획

1. 10개 파일을 열어 URL 출처를 분류한다(위 「상세 요구사항」 1).
2. 유입 가능성이 있는 컬럼을 프로덕션 DB에서 읽기 전용으로 조회한다(2).
3. 결과와 방침 A/B/C를 사용자에게 보고하고 결정을 받는다. 카리나 추천은 A이나, 이는 **판단**이며
   근거(`SafeImage`가 004에서 정한 프로젝트 표준이고 로드 실패까지 흡수한다)를 보고에 함께 적는다.
4. 수정이 필요하면 파일 목록을 담은 수정 티켓 분할안을 제안한다. 티켓 생성과 구현은 사용자 승인
   뒤에 한다.

## 완료 조건

- 어드민 `next/image` 직접 사용 파일 10개(및 조사 중 추가로 발견한 지점)마다 「URL 출처 · 미등록
  호스트 유입 가능 여부 · 근거」가 완료 기록의 표에 적혀 있다.
- 유입 가능한 컬럼마다 프로덕션 DB 읽기 전용 조회로 구한 미등록 건수가 기록되어 있다(쓰기 없음).
- 방침 A/B/C 중 사용자가 정한 결정과 ApplyTab 임시 패치 처리 결정이 기록되어 있다.
- 후속 수정이 필요하면 파일 목록이 있는 티켓 분할안이 남아 있고, 필요 없으면 그 근거가 적혀 있다.
- 이 티켓의 변경은 문서뿐이다(코드 변경 없음).

---
## 완료 기록

### 구현 내용 요약
- 조사 티켓이라 코드는 바꾸지 않았다. 10개 파일의 URL 출처를 분류하고 프로덕션 DB를 읽기 전용으로 조회한 뒤, 사용자가 방침 A를 결정했다(2026-09-25).
- 결론: 어드민 10곳 모두 미등록 호스트가 들어오면 화면 전체가 오류 화면이 될 수 있는 구조다. **지금 실제로 미등록 호스트 값이 있는 곳은 ApplyTab이 읽는 홈피드 카드 한 곳뿐**이고(이미 `unoptimized`로 임시 패치), 나머지 9곳이 읽는 배지·컬렉션 이미지에는 현재 미등록 값이 없다. 다만 배지 생성·수정 API가 `image_url` 호스트를 검사하지 않아 앞으로 들어올 수 있다.
- 수정은 티켓 [20260925_2319](20260925_2319_Admin_어드민-이미지-렌더-지점을-SafeImage로-통일.md)(OPEN)로 분리했다.

### 파일별 분류표 (2026-09-25 코드를 읽어 확인한 결과)

| 파일:줄 | 렌더하는 URL | 미등록 호스트 유입 경로 | 근거 |
|---|---|---|---|
| `asset-generator/ApplyTab.tsx:259` | 선택한 대상의 이미지: 배지 `badges.image_url`, 미션 `missions.image_url`, 컬렉션 `item_books.image_url`, 홈피드 `today_cards.cover_image_url` | **있음(현재 11건)**. 홈피드 커버 URL은 수정 화면의 텍스트 입력이라 임의 호스트가 들어간다 | `ApplyTab.tsx:123-131`, 홈피드 폼 |
| `itembooks/ItemBookForm.tsx:537` | 컬렉션에 속한 아이템 배지의 `badges.image_url` | 배지 API가 호스트를 검사하지 않음(UI 입력란은 없음) | `itembooks/[id]/page.tsx:23` select |
| `item-badges/ItemBadgesTable.tsx:59` | `row.original.image_url` | 같음. 조회 쿼리는 열지 않았고 배지 이미지로 추정 | 표 셀 |
| `item-badges/orphaned/OrphanedItemsTable.tsx:73` | `badgeImageUrl` | 같음. 조회 쿼리는 열지 않았고 배지 이미지로 추정 | 표 셀 |
| `item-badges/[badgeId]/[itemId]/page.tsx:130` | `badges.image_url` | 같음 | 같은 파일 41-45행 select |
| `item-badges/[badgeId]/page.tsx:77` | `badges.image_url` | 같음 | 같은 파일 |
| `drop-policy/DropExclusionBadgesTable.tsx:60` | `row.original.image_url` | 같음. 조회 쿼리는 열지 않았고 배지 이미지로 추정 | 표 셀 |
| `badges/BadgeCard.tsx:44` | `badge.image_url` | 같음 | `badge-list-query.ts:35` select |
| `badges/BadgesTable.tsx:120` | `row.original.image_url` | 같음 | `badge-list-query.ts:225` |
| `badges/BadgeDetail.tsx:295` | `badge.image_url`(`fill`) | 같음 | `admin/badges/[id]/page.tsx` |

- 배지 이미지 입력란은 업로드 방식이다(`BadgeForm.tsx:1146` `allowManualUrl={false}`, 티켓 005). 다만 `api/admin/badges/route.ts`(POST, 50행은 존재 여부만 확인)와 `[id]/route.ts`(PATCH, 77행)는 `image_url` 값의 호스트를 검사하지 않는다. 이 API를 직접 호출하거나 등록 스크립트가 쓰는 경로로는 임의 URL이 들어갈 수 있다(호출 경로 전수는 확인하지 않았다).
- 조사 중 추가로 발견한 지점은 없다. `SafeImage`를 쓰는 어드민 파일은 `ImageUploadField.tsx`·`TodayCardDetail.tsx` 두 곳이다. 어드민이 `next/image`가 아닌 다른 경로로 그리는 화면은 찾지 않았다(전수 확인 아님).

### DB 실측 (프로덕션, 읽기 전용, 쓰기 없음)

`isOptimizableImageSrc()`와 같은 기준으로 분류했다: 등록 = Supabase Storage 공개 경로 또는 `*.googleusercontent.com`, 내부 = `/`로 시작하는 경로.

| 컬럼 | 등록 호스트 | 내부 경로 | 미등록 |
|---|---|---|---|
| `badges.image_url` | 1,039 | 2,326 | 0 |
| `item_books.image_url` | 45 | 55 | 0 |
| `missions.image_url` | 0 | 0 | 0 (값이 있는 행 없음) |
| `today_cards.cover_image_url` | 0 | 2 | **11** (`storage.heypop.kr` 10, `cdn.news.bbsi.co.kr` 1) |

### 방침 결정
- **방침 A**: 어드민 렌더 지점을 `SafeImage`로 통일한다. 로드 실패까지 폴백으로 흡수하고 004에서 이미 프로젝트 표준으로 정한 방식이다. B(지점별 `unoptimized`)는 지점마다 우회를 반복하고 로드 실패를 못 막으며, C(호스트 추가)는 운영자가 임의 호스트를 넣을 수 있어 근본 해결이 아니다.
- **ApplyTab 임시 패치**: `SafeImage`로 교체한다(수정 티켓 2319에 포함).

### 후속 티켓 분할안
- [20260925_2319](20260925_2319_Admin_어드민-이미지-렌더-지점을-SafeImage로-통일.md): 10개 파일 교체(기계적 치환, `planOnlyWaiver` 예정). 구현은 사용자 승인 뒤에 한다.
- 재발 방지 ESLint 규칙(어드민 경로의 `next/image` 직접 import 금지)은 별도 티켓으로 분리할지 2319의 「결정 필요」에 적었다. 아직 티켓으로 만들지 않았다.

### 테스트 결과
- [x] 문서 변경만이다(코드 변경 없음). 문서 검사(pre-commit) 통과 예정.

### 배포 정보
- 배포일: (main 배포 전, staging 반영은 2026-09-25)
- 환경: staging
- 커밋: (이 티켓 커밋)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 카리나 직접 조사(워크플로 없음) | - | - | - | - |

### 주요 의사결정 / 핵심 메모
- 서비스 화면(`(main)` 등)에서 `next/image`를 직접 쓰는 19개 파일(전체 29개 − 어드민 10개)은 이 조사 범위 밖이다. 서비스 화면도 같은 구조적 위험이 있는지는 확인하지 않았다.
- 어드민 표 셀 3곳(ItemBadgesTable·OrphanedItemsTable·DropExclusionBadgesTable)이 읽는 조회 쿼리는 열지 않았다. 수정 티켓에서 교체하며 확인한다.

### 잔여 이슈
- **조사 범위의 사각지대(2319 실렌더에서 확인, 2026-09-25)**: 이 조사는 어드민 경로 파일만 셌다. 어드민 배지 상세의 미리보기가 서비스 컴포넌트 `BadgeHeroSection`(`next/image` 직접 사용)을 그대로 써서 미등록 호스트 배지에서 오류 화면이 났다. 2319에서 함께 고쳤다. 어드민이 서비스 컴포넌트를 끌어오는 다른 경로는 `TopNav`(아바타·로고)를 확인했을 뿐 전수 조사가 아니다.
- 수정 티켓 2319는 CLOSED(2026-09-25).
