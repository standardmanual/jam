---
id: "20260925_2319"
category: Admin
priority: P3
status: IN_PROGRESS
created: 2026-09-25
closed:
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
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
