---
id: "20260925_1932"
category: Admin
priority: P3
status: OPEN
created: 2026-09-25
closed:
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
