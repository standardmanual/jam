---
id: "20260925_2354"
category: Service
priority: P2
status: OPEN
created: 2026-09-25
closed:
related:
  - "20260925_1932"
  - "20260925_2319"
  - "20260824_004"
  - "20260824_005"
---

# [Service] 서비스 화면 17개 파일의 next/image 미등록 호스트 크래시 잔여 지점 조사

> 티켓 [20260925_2319](../p3-low/20260925_2319_Admin_어드민-이미지-렌더-지점을-SafeImage로-통일.md)의 실렌더에서
> 발견했다. 어드민 미리보기가 쓰는 서비스 컴포넌트(`BadgeHeroSection`)가 `next/image`를 직접 써서 오류 화면이
> 났고, 같은 구조가 서비스 화면에 더 있는지 조사한다. **조사 티켓이며 이 티켓에서는 코드를 고치지 않는다.**
> 서비스 화면은 일반 사용자가 보는 화면이라 어드민보다 영향이 크다(판단).

## 핵심 요약

- 요구사항: 서비스 화면에서 `next/image`를 직접 쓰는 파일이 렌더하는 이미지 URL이 어디서 오는지 분류하고,
  `images.remotePatterns`에 없는 호스트가 실제로 들어올 수 있는지 프로덕션 DB를 읽기 전용으로 확인한 뒤
  `SafeImage` 전환 범위를 정한다.
- 구현 계획: 코드 수정 없음. 파일별 URL 출처 분류 → 프로덕션 DB 읽기 전용 실측 → 방침 제시 → 사용자 결정 →
  필요하면 수정 티켓 분할안을 제안한다. 담당은 카리나(research 유형).
- 관련 파일: 아래 「사실」 절의 17개 파일, `jam-web/src/components/SafeImage.tsx`, `jam-web/src/lib/imageSrc.ts`
  (`IMAGE_REMOTE_PATTERNS`·`isOptimizableImageSrc`), `jam-web/next.config.ts`(`images.remotePatterns`).

## 배경 / 문제 정의

### 사실 (2026-09-25 명령으로 확인한 결과)

- `next/image`는 `images.remotePatterns`에 없는 호스트를 만나면 렌더 시점에 예외를 던져 그 이미지를 포함한
  화면 전체가 오류 화면으로 바뀐다. 허용 호스트는 2종이다: `ceehnkzdbecxwzxrhhns.supabase.co`(경로
  `/storage/v1/object/public/**`), `*.googleusercontent.com`.
- 티켓 2319의 실렌더에서 미등록 호스트 이미지를 가진 배지로 어드민 배지 상세를 열자 오류 화면이 떴다. 원인은
  서비스 컴포넌트 `app/(main)/badges/[id]/BadgeHeroSection.tsx`의 `next/image`였고 2319에서 `SafeImage`로 고쳤다.
  같은 컴포넌트를 서비스 배지 상세 화면도 쓰므로, 그 화면도 같은 위험이 있었다(서비스 화면 실렌더는 하지 않았다).
- **서비스 화면(어드민 경로 제외)에서 `next/image`를 직접 import하는 파일은 17개**이고(`SafeImage.tsx` 제외),
  `SafeImage`를 쓰는 서비스 파일은 `TodayCardStack.tsx`·`[username]/collections/page.tsx`·`badges/[id]`(페이지·
  히어로)·`missions/[id]/MissionDetailClient.tsx`(일부)·`today/[cardId]/page.tsx`·`components/ui/CollectionGridCard.tsx`
  이다. 17개 파일과 `<Image src>` 값(줄 번호는 2026-09-25 기준):
  - **정적 파일 3곳(호스트 위험 없음)**: `app/(auth)/login/page.tsx:26`·`app/(main)/voc/page.tsx:93`의
    `/jam-logo-white.png`, `components/ui/TopNav.tsx:124`의 같은 로고.
  - **사용자 아바타 6곳**: `TopNav.tsx:93`(`avatarUrl`), `[username]/FollowUserList.tsx:73`(`u.avatar_url`),
    `profile/ProfileClient.tsx:485·578`, `search/page.tsx:127`, `notifications/NotificationsClient.tsx:104`
    (`view.actor.avatarUrl`), `onboarding/page.tsx:337`·`profile/edit/page.tsx:244`(`avatarUrl`).
  - **배지·이미지 컬럼 렌더 8곳**: `FeedSection.tsx:351·440·675`(`badgeImage`·`src`), `combine/CombineClient.tsx:423`
    (`row.imageUrl`), `combine/RecipeRewardRow.tsx:52`(`primary.image_url`), `drops/BadgeDetailSheet.tsx:155`
    (`drop.badge_image_url`), `missions/[id]/MissionDetailClient.tsx:327`(`badge.image_url`),
    `onboarding/page.tsx:519`(`tribe.image_url`), `components/PoiCarouselModal.tsx:719·860`
    (`badgeImageUrl`·`imageUrl`), `components/badges/BadgeTrophyGridCard.tsx:83`, `components/ui/BadgeGridCard.tsx:124`.
- **선행 티켓**: [20260824_004](../p1-high/20260824_004_bug_홈화면-투데이카드-외부이미지호스트-렌더실패.md)가 `SafeImage`를
  만들어 투데이 카드를 고쳤고, [20260824_005](../p0-urgent/20260824_005_bug_어드민-자유입력-이미지URL-전수대응.md)가
  미션·컬렉션·트라이브 렌더 지점을 `SafeImage`로 전환했다. 005의 실태 조사(2026-08-24)에서 미션·컬렉션·트라이브·
  배지·사용자 아바타의 미등록 호스트 건수는 0건이었다. 그 이후 새로 생긴 값이나 렌더 지점은 확인하지 않았다.
- 프로덕션 실측(2026-09-25, 티켓 1932): `badges.image_url`(등록 1,039·내부 경로 2,326·미등록 0),
  `item_books.image_url`(45·55·0), `missions.image_url`(값 없음), `today_cards.cover_image_url`(미등록 11).
  `users.avatar_url`·`tribes.image_url`은 이번에 세지 않았다.
- 배지 생성·수정 API(`api/admin/badges/route.ts`·`[id]/route.ts`)는 `image_url`의 호스트를 검사하지 않는다.
  사용자 아바타를 저장하는 경로가 호스트를 어떻게 제한하는지는 확인하지 않았다(`auth/callback/route.ts`는
  `includes('googleusercontent')`로 느슨하게 판정한다는 주석이 `lib/imageSrc.ts`에 있다).

### 아직 확인하지 않은 것

- 위 17개 파일 각각의 URL이 어떤 DB 컬럼·저장 경로에서 오는지, 그 경로에 호스트 제한이 있는지.
- `users.avatar_url`(프로필 편집·온보딩 화면에서 사용자가 값을 바꿀 수 있는 경로 포함)과 `tribes.image_url`의
  프로덕션 미등록 건수.
- `FeedSection.tsx:675`·`RecipeRewardRow.tsx:52`·`BadgeTrophyGridCard.tsx:83`·`BadgeGridCard.tsx:124`의 `src`가
  전달되는 경로(부모 컴포넌트).
- `SafeImage`를 쓰는 파일 중에서도 같은 화면 안의 다른 이미지가 `next/image`인 곳이 있는지.
- 서비스 배지 상세 화면(`badges/[id]`)이 `BadgeHeroSection` 교체 뒤에도 이전과 같이 표시되는지(2319에서
  실렌더로 확인하지 못했다).

## 상세 요구사항

### 서비스/코드베이스 관점

1. **파일별 분류표**: 17개 파일마다 「렌더하는 URL의 출처(DB 컬럼·업로드·OAuth·자유 입력) · 미등록 호스트가
   들어올 수 있는 경로 · 근거(파일:줄)」를 적는다.
2. **DB 실측(읽기 전용)**: 유입 가능성이 있는 컬럼마다 `isOptimizableImageSrc()`와 같은 기준으로 미등록 건수를
   센다(티켓 1932와 같은 방식, 쓰기 없음). 최소한 `users.avatar_url`·`tribes.image_url`을 포함한다.
3. **방침 후보 제시**: (A) 유입 가능성이 있는 지점만 `SafeImage`로 전환, (B) 서비스 화면 전체를 `SafeImage`로
   통일(정적 로고 제외), (C) 현 상태 유지. 각 후보의 변경 파일 수와 서비스 화면 회귀 위험(등록 호스트는
   `SafeImage`가 `next/image`를 그대로 쓰므로 표시가 같다는 근거)을 함께 적는다.
4. **재발 방지 규칙 확장 여부**: 티켓 20260925_2321에서 어드민 경로에만 건 ESLint `no-restricted-imports`를
   서비스 화면까지 넓힐지 함께 판단한다(정적 로고처럼 `next/image`가 정당한 곳은 예외가 필요하다).

## 구현 계획

1. 17개 파일을 열어 URL 출처를 분류한다(위 「상세 요구사항」 1).
2. 유입 가능성이 있는 컬럼을 프로덕션 DB에서 읽기 전용으로 조회한다(2).
3. 결과와 방침 후보를 사용자에게 보고하고 결정을 받는다. 카리나 추천은 조사 결과를 본 뒤에 적는다(현재는
   판단 근거가 없다).
4. 수정이 필요하면 파일 목록을 담은 수정 티켓 분할안을 제안한다. 티켓 생성과 구현은 사용자 승인 뒤에 한다.
   서비스 화면은 일반 사용자가 보므로 수정 티켓은 실렌더 확인 항목을 완료 조건에 넣는다(2319의 교훈).

## 완료 조건

- 서비스 `next/image` 직접 사용 17개 파일(및 조사 중 추가로 발견한 지점)마다 「URL 출처 · 미등록 호스트 유입
  가능 여부 · 근거」가 완료 기록의 표에 적혀 있다.
- 유입 가능한 컬럼마다 프로덕션 DB 읽기 전용 조회로 구한 미등록 건수가 기록되어 있다(쓰기 없음).
- 방침 후보 중 사용자가 정한 결정과 ESLint 규칙 확장 여부 결정이 기록되어 있다.
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
