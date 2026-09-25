---
id: "20260925_2319"
category: Admin
priority: P3
status: CLOSED
created: 2026-09-25
closed: 2026-09-25
related:
  - "20260925_1932"
---

# [Admin] 어드민 이미지 렌더 지점 10곳을 SafeImage로 통일한다

> 티켓 [20260925_1932](20260925_1932_Admin_어드민-next-image-미등록호스트-크래시-잔여지점-조사.md)에서 사용자가
> 방침 A(어드민 렌더 지점을 `SafeImage`로 통일)를 결정했다(2026-09-25).

## 핵심 요약

- 요구사항: 어드민에서 `next/image`를 직접 쓰는 10곳을 `SafeImage`로 바꿔, 미등록 호스트 URL이나 로드 실패가
  화면 전체를 오류 화면으로 만들지 않게 한다. 이미 `unoptimized`로 임시 패치한 ApplyTab도 `SafeImage`로 바꾼다.
- 구현 계획: 아래 파일별 지도의 `<Image>`를 `SafeImage`로 교체한다. 기계적 치환이라 10개 파일이어도 규모 사전
  판정에서 `planOnlyWaiver`를 부여한다(파일 10개, 줄 수는 지점당 3~8줄 예상).
- 관련 파일(파일:줄은 2026-09-25 기준):
  - `jam-web/src/app/admin/asset-generator/ApplyTab.tsx:259` (`fill unoptimized`, 142bf1da 임시 패치 제거)
  - `jam-web/src/app/admin/itembooks/ItemBookForm.tsx:537` (32×32)
  - `jam-web/src/app/admin/item-badges/ItemBadgesTable.tsx:59`
  - `jam-web/src/app/admin/item-badges/orphaned/OrphanedItemsTable.tsx:73` (32×32)
  - `jam-web/src/app/admin/item-badges/[badgeId]/[itemId]/page.tsx:130` (64×64)
  - `jam-web/src/app/admin/item-badges/[badgeId]/page.tsx:77` (56×56)
  - `jam-web/src/components/admin/drop-policy/DropExclusionBadgesTable.tsx:60`
  - `jam-web/src/components/admin/badges/BadgeCard.tsx:44`
  - `jam-web/src/components/admin/badges/BadgesTable.tsx:120`
  - `jam-web/src/components/admin/badges/BadgeDetail.tsx:295` (`fill`)
  - 참조: `jam-web/src/components/SafeImage.tsx`(props: `src`·`alt`·`className`·`width`·`height`·`sizes`·`fallback`),
    `jam-web/src/lib/imageSrc.ts`. 문서 영향은 구현 때 확인한다(`docs/specs/` 안에서 어드민 이미지 렌더 방침을
    적은 문서가 있으면 함께 고친다).

## 배경 / 문제 정의

### 사실 (티켓 1932 조사 결과)

- `next/image`는 `images.remotePatterns`에 없는 호스트를 만나면 렌더 시점에 예외를 던져 화면 전체가 오류
  화면으로 바뀐다. `SafeImage`는 등록된 호스트·내부 경로만 `next/image`로 보내고 나머지는 일반 `<img>`로 그리며
  로드 실패는 `fallback`으로 흡수한다.
- 어드민 10곳은 `SafeImage`를 쓰지 않는다. 프로덕션에서 미등록 호스트 값이 실제로 들어 있는 컬럼은 홈피드
  카드의 `cover_image_url` 11건뿐이고(ApplyTab이 읽는다, 1932 완료 기록의 실측표), 나머지 9곳이 읽는 배지·컬렉션
  이미지 컬럼에는 지금 미등록 호스트 값이 없다. 다만 배지 생성·수정 API는 `image_url`의 호스트를 검사하지 않아
  앞으로 들어올 수 있다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. 10곳을 `SafeImage`로 교체한다. 크기·`className`·`alt`는 기존 값을 그대로 옮기고, `fill`을 쓰던 두 곳
   (ApplyTab·BadgeDetail)은 `width`·`height`를 주지 않는다(`fill` 모드).
2. 이미지가 없을 때의 표시(기존 `{url && (...)}` 분기)는 그대로 둔다. 로드 실패 폴백은 지점마다 기본값(아무것도
   그리지 않음)을 쓰되, 표 셀처럼 자리가 비어 레이아웃이 흔들리는 곳은 같은 크기의 빈 칸을 폴백으로 준다.
3. 등록된 호스트·내부 경로의 렌더 결과(최적화 여부)는 바뀌지 않아야 한다. `SafeImage`가 그 경우 `next/image`를
   그대로 쓰기 때문이다.

### UI/UX 관점

- 화면 모양은 바뀌지 않는다. 바뀌는 것은 미등록 호스트·로드 실패일 때의 동작(오류 화면 대신 이미지만 빠짐)뿐이다.

## 결정 기록

- **2026-09-25 사용자가 이 티켓의 진행을 승인했고, 재발 방지 ESLint 규칙은 별도 티켓으로 분리하기로 결정했다**
  (티켓 [20260925_2321](20260925_2321_Admin_어드민-경로의-next-image-직접-import를-ESLint로-막는다.md)). 이 티켓은 교체만 한다.

## 완료 조건

- 위 10곳에서 `next/image`를 직접 import하지 않는다(`grep`으로 어드민 경로 0건 확인).
- ApplyTab의 `unoptimized` 임시 패치가 없어지고 `SafeImage`로 바뀌어 있다.
- 미등록 호스트 URL을 가진 배지·컬렉션·홈피드 카드를 어드민 화면에서 열어도 오류 화면이 뜨지 않는다.
  ApplyTab은 실측 중 발견한 홈피드 카드(`storage.heypop.kr`)로, 배지 지점은 임시 배지 하나에 미등록 호스트 URL을
  넣어 실렌더로 확인한다(임시 데이터는 확인 뒤 삭제, 사용자 승인 필요).
- 등록된 호스트·내부 경로 이미지는 이전과 같이 표시된다(배지 목록·상세 실렌더로 확인).
- `scripts/verify.sh` 통과.

---
## 완료 기록

### 구현 내용 요약
- 어드민 10곳의 `next/image` 직접 사용을 `SafeImage`로 교체했다(크기·`className`·`alt` 그대로). ApplyTab의 `unoptimized` 임시 패치를 제거했고, `fill`을 쓰던 ApplyTab·BadgeDetail은 `width`·`height` 없이 `SafeImage`의 fill 모드로 옮겼다.
- **실렌더에서 발견해 추가로 고친 지점 1곳**: 어드민 배지 상세의 실시간 미리보기(`BadgeDetailPreviewFrame`)가 서비스 화면 컴포넌트 `app/(main)/badges/[id]/BadgeHeroSection.tsx`를 그대로 쓰고, 그 컴포넌트가 `next/image`를 직접 써서 미등록 호스트 배지 이미지가 오류 화면을 만들었다(콘솔 `next-image-unconfigured-host`). 사용자가 이 티켓에서 함께 고치기로 결정했고(2026-09-25) `SafeImage`로 교체했다. 이 컴포넌트는 서비스 배지 상세 화면(`badges/[id]/page.tsx:358`)도 쓰므로 서비스 화면 코드가 바뀐 변경이다. 등록 호스트·내부 경로 이미지는 `SafeImage`가 `next/image`를 그대로 쓰므로 표시가 같다.
- 표 셀 3곳의 이미지 출처를 조회 쿼리에서 확인했다(모두 `badges.image_url`): `ItemBadgesTable`(`item-badges/page.tsx:48-49`, `lib/admin/item-badge-list.ts:16`), `OrphanedItemsTable`(`lib/admin/orphaned-items-query.ts:145`), `DropExclusionBadgesTable`(`drop-policy/exclusions/page.tsx:68-69`, `lib/admin/drop-exclusion-list.ts:20`).
- 표 셀은 바깥 컨테이너가 고정 크기라 폴백은 기본값(빈 렌더)이고, 컬렉션 폼(`ItemBookForm.tsx:537`)은 게이트 WARN을 반영해 같은 크기(`w-8 h-8`)의 빈 칸을 폴백으로 준다.
- `docs/specs/`에는 어드민 이미지 렌더 방침을 적은 문서가 없다(`grep -rnE "SafeImage|next/image|unoptimized" docs/specs` 결과 0건). 문서 수정 없음.
- 재발 방지 ESLint 규칙은 티켓 20260925_2321에서 처리한다.

### 변경된 파일
```
jam-web/src/app/admin/asset-generator/ApplyTab.tsx
jam-web/src/app/admin/itembooks/ItemBookForm.tsx
jam-web/src/app/admin/item-badges/ItemBadgesTable.tsx
jam-web/src/app/admin/item-badges/orphaned/OrphanedItemsTable.tsx
jam-web/src/app/admin/item-badges/[badgeId]/[itemId]/page.tsx
jam-web/src/app/admin/item-badges/[badgeId]/page.tsx
jam-web/src/components/admin/drop-policy/DropExclusionBadgesTable.tsx
jam-web/src/components/admin/badges/BadgeCard.tsx
jam-web/src/components/admin/badges/BadgesTable.tsx
jam-web/src/components/admin/badges/BadgeDetail.tsx
jam-web/src/app/(main)/badges/[id]/BadgeHeroSection.tsx   (실렌더에서 추가, 서비스 컴포넌트)
```

### 테스트 결과
- [x] `scripts/verify.sh`·GitHub `verify` 통과(브랜치 HEAD 2cfef152, run 36149405454).
- [x] 게이트(민지): 1차 **WARN**(실렌더 미확인, 컬렉션 폼 폴백), 카리나 패치(a32d2353) 뒤 **WARN**(실렌더만 남음), `BadgeHeroSection` 추가 패치(2cfef152) 뒤 **WARN**(실렌더는 카리나 담당이라 남음, 완료 기록 파일 목록 누락 — 이 기록에서 반영). 코드·CI 항목은 모두 통과다.
- [x] **실렌더 확인(2026-09-25, 사용자 승인)**: 로컬 `next dev`(`ADMIN_EMAILS` 셸 환경변수)로 확인했다. 임시 배지 2건(액티비티·아이템 유형, 미등록 호스트 이미지 `storage.heypop.kr`, 소프트 삭제 상태)을 공용 DB에 만들었다가 삭제했고, 기준 건수(배지 3,365건)로 복구된 것을 조회로 확인했다.
  - 적용 탭(홈피드 카드, 같은 미등록 호스트): 오류 화면 없이 이미지 표시. 1411 실렌더에서 크래시가 났던 경로다.
  - 배지 목록(`BadgesTable`): 오류 없이 썸네일 표시.
  - 배지 상세(`BadgeDetail` + 미리보기): **첫 확인은 오류 화면**이었고(`BadgeHeroSection` 미교체 상태), 교체 뒤 오류 없이 상세 이미지와 미리보기 이미지가 표시된다.
  - 아이템 배지 상세(`item-badges/[badgeId]`): 오류 없이 이미지 표시.
  - 등록 호스트 이미지(배지 목록 50장): 이전처럼 `/_next/image`로 최적화되어 표시되고, 깨진 이미지 0건.
- **직접 확인하지 못한 화면(코드 교체만 검토)**: `ItemBadgesTable`(목록), `OrphanedItemsTable`, 아이템 배지 개별 발급 상세(`[badgeId]/[itemId]`), `DropExclusionBadgesTable`, `BadgeCard`, 컬렉션 폼의 아이템 배지 행. 임시 배지가 소프트 삭제·컬렉션 미연결 상태라 이 화면들에 나타나지 않았다. 서비스 배지 상세 화면(`badges/[id]`)도 실렌더로 확인하지 않았다.

### 배포 정보
- 배포일: (main 배포 전, staging 반영은 2026-09-25)
- 환경: staging
- 커밋: 병합 커밋 d34fd3fb(구현 6d3471c2·컬렉션 폼 폴백 a32d2353), 병합 커밋 37b939ef(`BadgeHeroSection` 2cfef152)
- DB 마이그레이션: 없음.

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 | 84,380 | 17,267 / 3,890 | 12분 42초 | 30 |
| 재판정 1(카리나 폴백 패치 뒤) | 민지 | 32,765 | 0 / 3,716 | 2분 52초 | 6 |
| 재판정 2(`BadgeHeroSection` 추가 패치 뒤) | 민지 | 36,139 | 0 / 4,597 | 3분 54초 | 7 |
| 합계 | 아현·민지 | 153,284 | 17,267 / 12,203 | 19분 28초 | 43 |

### 주요 의사결정 / 핵심 메모
- **조사와 게이트 모두 서비스 컴포넌트를 통해 어드민에 들어오는 경로를 놓쳤다.** 1932는 어드민 경로 파일만 세었고, 아현·민지도 티켓 지도(어드민 10곳)만 봤다. 미등록 호스트 이미지로 실제 화면을 열어 보는 실렌더에서만 발견됐다. 이미지 컴포넌트 교체처럼 렌더 결과가 화면에서만 확인되는 변경은 임시 데이터 실렌더가 필요하다는 사례다.
- 임시 배지는 소프트 삭제 상태로 만들어 사용자 화면에 노출되지 않게 했다. 그 대가로 아이템 배지 목록·컬렉션 폼 등 활성 배지만 보이는 화면은 확인하지 못했다.
- 병합 순서: 게이트가 WARN으로 남는 사유가 실렌더뿐이라, 로컬 `staging`에 병합한 뒤 push 전에 실렌더로 확인하는 순서를 썼다(병합은 로컬이라 되돌릴 수 있다).

### 잔여 이슈
- 위 「직접 확인하지 못한 화면」 6곳과 서비스 배지 상세 화면은 실렌더 미확인이다.
- 어드민 미리보기가 끌어오는 서비스 컴포넌트 중 `TopNav`는 아바타·로고에 `next/image`를 쓴다(배지 이미지와 무관, 아바타는 `*.googleusercontent.com`만 등록). 이번에 조사하지 않았다.
- 서비스 화면(`app/(main)` 등)에서 `next/image`를 직접 쓰는 다른 파일의 미등록 호스트 위험도 확인하지 않았다.
- 배지 생성·수정 API가 `image_url` 호스트를 검사하지 않는 점은 그대로다.
