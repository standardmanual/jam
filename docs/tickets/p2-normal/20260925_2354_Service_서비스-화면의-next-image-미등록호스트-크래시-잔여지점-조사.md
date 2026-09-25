---
id: "20260925_2354"
category: Service
priority: P2
status: WAITING
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

## 조사 결과 (2026-09-25)

### 파일별 분류표 (코드를 읽어 확인한 결과)

| 파일:줄 | `src` 값의 출처 | 미등록 호스트 유입 경로 |
|---|---|---|
| `(auth)/login/page.tsx:26`, `(main)/voc/page.tsx:93`, `components/ui/TopNav.tsx:124` | `/jam-logo-white.png` 정적 파일 | 없음 |
| `TopNav.tsx:93`, `[username]/FollowUserList.tsx:73`, `profile/ProfileClient.tsx:485·578`, `search/page.tsx:127`, `notifications/NotificationsClient.tsx:104`, `onboarding/page.tsx:337`, `profile/edit/page.tsx:244` | `users.avatar_url` | 저장 경로 두 곳뿐이다. (1) `api/profile/avatar/route.ts:52-67`이 Supabase Storage `avatars` 버킷에 올리고 공개 URL을 저장한다. (2) `auth/callback/route.ts:31-58`이 Google 로그인 `user_metadata.avatar_url`을 저장한다. 로그인 제공자는 Google뿐이다(`login/page.tsx:17`). 두 경로 모두 등록 호스트다 |
| `FeedSection.tsx:351·440`, `ProfileClient.tsx:410`(→ `BadgeGridCard`) | 활동 피드 `metadata.badge_image_url` | 이벤트를 만들 때 `badges.image_url`을 복사해 저장하고(`badge-engine`·`drop-engine`·`strava/sync` 등), 조회할 때 `lib/activity-feed/hydrate.ts:140`이 현재 배지 값으로 다시 채운다. 원천은 `badges.image_url` |
| `FeedSection.tsx:675` | 피드 묶음 항목의 `metadata.badge_image_url` (같은 원천) | 위와 같음 |
| `combine/CombineClient.tsx:423`, `combine/RecipeRewardRow.tsx:52`, `missions/[id]/MissionDetailClient.tsx:327`, `components/badges/BadgeTrophyGridCard.tsx:83`, `components/ui/BadgeGridCard.tsx:124`, `drops/BadgeDetailSheet.tsx:155` | `badges.image_url`(`badge.image_url`·`candidate.image_url`·`drop.badge_image_url` — 드랍 API 4곳이 `badges.image_url`을 복사, `api/drops/*`·`api/inventory/items`) | 어드민 배지 생성·수정 API가 `image_url` 호스트를 검사하지 않는다(`api/admin/badges/route.ts`·`[id]/route.ts`). 어드민 화면 입력란은 업로드 전용(`allowManualUrl=false`)이라 API를 직접 호출하거나 DB를 직접 고칠 때만 들어온다 |
| `BadgeGridCard.tsx:124`(컬렉션 표지로 쓰일 때, `badges/BadgesClient.tsx:328`·`ProfileClient.tsx:439`) | `item_books.image_url` | 어드민 컬렉션 API가 같은 방식이다 |
| `onboarding/page.tsx:519` | `tribes.image_url` | 어드민 트라이브 API(`api/admin/tribes`)가 값을 받는다. 프로덕션에 값이 있는 행이 없다 |
| `components/PoiCarouselModal.tsx:719·860` | `badgeImageUrl`(드랍의 `badges.image_url`), `imageUrl`(prop, `PoiCarouselModal.tsx:814`) | 719행은 위와 같다. 860행 `imageUrl`을 넘기는 호출부는 추적하지 않았다 |

### DB 실측 (프로덕션, 읽기 전용, 쓰기 없음)

`isOptimizableImageSrc()`와 같은 기준으로 분류했다: 등록 = Supabase Storage 공개 경로 또는 `*.googleusercontent.com`, 내부 = `/`로 시작하는 경로.

| 컬럼 | 등록 | 내부 경로 | 미등록 |
|---|---|---|---|
| `users.avatar_url` | 5 (Supabase 3, `lh3.googleusercontent.com` 2) | 0 | 0 |
| `tribes.image_url` | 0 | 0 | 0 (값이 있는 행 없음, 트라이브 10개) |
| `badges.image_url` | 1,039 | 2,326 | 0 |
| `item_books.image_url` | 45 | 55 | 0 |
| `user_activity_feed.metadata.badge_image_url` | 197 | 49 | 0 (피드 250행 중 값이 있는 246행) |
| `today_cards.cover_image_url` (참고) | 0 | 2 | 11 (서비스 화면은 이미 `SafeImage`) |

### 결론(사실)

- 서비스 화면 `next/image` 직접 사용 17개 파일 중 **현재 프로덕션 데이터로 화면이 깨질 곳은 없다.** 서비스 화면이 읽는 모든 컬럼에 미등록 호스트 값이 0건이다.
- 미등록 값이 들어오려면 어드민이 배지·컬렉션·트라이브 API를 화면 밖에서 직접 호출하거나 DB를 직접 고쳐야 한다. 사용자 아바타는 Google·자체 업로드 두 경로로 제한된다.
- 다만 그 API에는 호스트 검사가 없고, 한 번 들어오면 그 이미지를 그리는 서비스 화면(피드·배지 그리드·배지 상세 시트·컴바인 등)이 전부 오류 화면이 된다. 이 결과는 2319 실렌더에서 어드민 배지 상세로 확인했고, 서비스 화면에서는 재현하지 않았다.
- 정적 로고 3곳은 안전하다.

### 방침 후보

| 후보 | 내용 | 변경 규모 | 장점 / 한계 |
|---|---|---|---|
| A. 렌더 지점을 `SafeImage`로 전환 | 어드민이 값을 넣는 컬럼(배지·컬렉션·트라이브 이미지)을 그리는 서비스 파일 9곳(`FeedSection`·`CombineClient`·`RecipeRewardRow`·`BadgeDetailSheet`·`MissionDetailClient`·`onboarding`(트라이브 부분)·`PoiCarouselModal`·`BadgeTrophyGridCard`·`BadgeGridCard`)을 바꾼다. 아바타 7곳과 정적 로고 3곳은 제외한다 | 파일 9개, 기계적 치환 | 프로젝트가 이미 쓰는 방식(004·005·2319)이다. 등록 호스트는 `SafeImage`가 `next/image`를 그대로 쓰므로 표시가 같다. 서비스 화면이라 실렌더 확인이 필요하다 |
| B. 저장 입구에서 호스트 검증 | 배지·컬렉션·트라이브 생성·수정 API가 `IMAGE_REMOTE_PATTERNS`에 맞지 않는 `image_url`을 거절한다(`isOptimizableImageSrc` 재사용) | API 파일 약 6개(배지·컬렉션·트라이브 생성·수정 등) | 원천에서 막아 렌더 지점 수와 무관하게 안전하다. 그러나 등록 스크립트·적용 탭 등 기존 저장 경로가 모두 Supabase Storage URL을 쓰는지 먼저 확인해야 하고(이 조사에서는 확인하지 않았다), 이미 들어간 값과 DB 직접 수정은 못 막는다 |
| C. 현 상태 유지 | 코드 변경 없음, 주간 점검에서 미등록 건수가 0인지만 본다 | 없음 | 비용이 없다. 유입 경로가 막혀 있지 않아 발생하면 서비스 화면이 오류가 되고 장애 대응이 사후가 된다 |

### 카리나 추천 (판단)

**A**를 추천한다. 근거: (1) 지금 데이터에는 문제가 없지만 유입을 막는 장치가 없고, 발생 시 영향이 서비스 사용자 전원이다. (2) 프로젝트가 004·005·2319에서 같은 결함을 `SafeImage`로 고쳐 온 방식이라 검증된 접근이다. (3) B는 기존 저장 경로를 아직 조사하지 않아 이번에 결정하기에는 정보가 부족하다. A와 B는 배타적이지 않으므로 A를 먼저 하고 B는 필요할 때 별도 티켓으로 검토할 수 있다.
아바타 7곳은 유입이 Google·자체 업로드로 제한되어 A 범위에서 뺐다. 다만 원하시면 함께 넣을 수 있다(7개 파일 추가).

### ESLint 규칙 확장(2321) 여부에 대한 판단

서비스 화면까지 금지 규칙을 넓히려면 정적 로고 3곳(login·voc·TopNav)과 아바타에 예외가 필요하다. A 전환을 마친 뒤에 남는 파일을 보고 판단하는 편이 낫다(추천). 지금 확장하면 A 전환 전 코드가 오류로 잡힌다.

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
