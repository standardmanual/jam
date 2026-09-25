---
id: "20260925_2358"
category: Service
priority: P2
status: CLOSED
created: 2026-09-25
closed: 2026-09-26
related:
  - "20260925_2354"
  - "20260925_2319"
  - "20260925_2321"
  - "20260824_004"
---

# [Service] 서비스 화면 배지·컬렉션·트라이브 이미지 렌더 9개 파일을 SafeImage로 전환한다

> 티켓 [20260925_2354](20260925_2354_Service_서비스-화면의-next-image-미등록호스트-크래시-잔여지점-조사.md)에서
> 사용자가 방침 A를 결정했다(2026-09-25): 아바타 7곳과 정적 로고 3곳은 제외하고, 어드민이 값을 넣는 컬럼
> (배지·컬렉션·트라이브 이미지)을 그리는 서비스 파일을 `SafeImage`로 바꾼다. ESLint 규칙의 서비스 화면 확장은
> 나중에 판단하기로 했다(이 티켓에서 하지 않는다).

## 핵심 요약

- 요구사항: 서비스 화면 9개 파일의 `next/image` 직접 사용을 `SafeImage`로 교체해, 배지·컬렉션·트라이브 이미지에
  미등록 호스트 URL이 들어와도 화면 전체가 오류 화면이 되지 않게 한다.
- 구현 계획: 아래 지도의 `<Image>`를 `SafeImage`로 바꾼다. 모두 `width`·`height`가 고정된 사용이라 속성을 그대로
  옮기는 기계적 치환이다. 파일 9개이므로 착수할 때 `planOnlyWaiver`를 부여한다.
- 관련 파일(줄은 2026-09-25 기준, 모두 `jam-web/src/` 아래):
  - `app/(main)/FeedSection.tsx:351`(112×112)·`:440`(40×40)·`:675`(24×24, `key` 유지) — 활동 피드 배지 이미지
  - `app/(main)/combine/CombineClient.tsx:423`(64×64)
  - `app/(main)/combine/RecipeRewardRow.tsx:52`(40×40, 서버 컴포넌트)
  - `app/(main)/drops/BadgeDetailSheet.tsx:155`(176×176)
  - `app/(main)/missions/[id]/MissionDetailClient.tsx:327`(52×52, 같은 파일에 `SafeImage`가 이미 있어 import 중복 확인)
  - `app/(main)/onboarding/page.tsx:519`(트라이브 48×48만. **`:337`의 아바타 `<Image>`는 그대로 두므로 이 파일은
    `next/image`와 `SafeImage` import가 함께 남는다**)
  - `components/PoiCarouselModal.tsx:719`(80×80)·`:860`(44×44, `imageUrl` prop의 호출부는 조사에서 추적하지 못했다)
  - `components/badges/BadgeTrophyGridCard.tsx:83`(90×90)
  - `components/ui/BadgeGridCard.tsx:124`(90×90, 컬렉션 표지로도 쓰인다: `badges/BadgesClient.tsx:328`·
    `profile/ProfileClient.tsx:439`)
  - 참조: `components/SafeImage.tsx`(props `src`·`alt`·`className`·`width`·`height`·`sizes`·`fallback`)

## 배경 / 문제 정의

### 사실 (티켓 2354 조사 결과)

- `next/image`는 `images.remotePatterns`에 없는 호스트를 만나면 렌더 시점에 예외를 던져 화면 전체가 오류 화면이 된다.
  2319 실렌더에서 어드민 배지 상세로 확인했다. 서비스 화면에서는 재현하지 않았다.
- 서비스 화면이 읽는 컬럼에는 현재 미등록 값이 0건이다(`badges.image_url`·`item_books.image_url`·
  `user_activity_feed.metadata.badge_image_url`·`users.avatar_url`·`tribes.image_url`). 다만 어드민 배지·컬렉션·
  트라이브 API가 `image_url` 호스트를 검사하지 않아, 화면 밖에서 API를 직접 호출하거나 DB를 직접 고치면 들어올 수
  있다.
- 등록 호스트·내부 경로는 `SafeImage`가 `next/image`를 그대로 쓰므로 표시가 같다(`SafeImage.tsx`, 티켓 004).
  `fill` 모드는 이 티켓 범위에 없다(전부 고정 크기).
- 2319에서 `BadgeHeroSection`(서비스·어드민 공용)을 같은 방식으로 이미 바꿨다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. 위 9개 파일의 지점을 `SafeImage`로 교체한다. `width`·`height`·`className`·`alt`·`key`는 그대로 옮긴다.
2. 이미지 로드 실패 시의 자리(`fallback`)를 지점마다 정한다. 이미 `{url ? <Image/> : <아이콘/>}` 분기가 있는 곳
   (`RecipeRewardRow`·`BadgeTrophyGridCard`·`BadgeGridCard`)은 로드 실패도 같은 아이콘을 폴백으로 주는 것을 기본으로
   하고, 나머지는 같은 크기의 빈 칸을 주어 레이아웃이 밀리지 않게 한다. 지점별 선택과 근거를 완료 기록에 적는다.
3. 아바타 7곳과 정적 로고 3곳은 바꾸지 않는다.

### UI/UX 관점

- 화면 모양은 바뀌지 않는다. 바뀌는 것은 미등록 호스트·로드 실패일 때의 동작뿐이다.

## 결정 기록

- **2026-09-25 사용자가 실렌더 확인 방법을 (가)+(나)로 결정했고 진행을 승인했다.**
  - **(가) 개발 전용 임시 확인**: 카리나가 병합 뒤 push 전에 로컬 `next dev`(`ADMIN_EMAILS` 셸 환경변수, 워크트리에서는
    `next dev`가 뜨지 않는다)에서 임시 샘플 페이지를 만들어 각 컴포넌트에 미등록 호스트 URL(`storage.heypop.kr`)을 넘겨 확인한다.
    **DB는 건드리지 않고 임시 페이지는 커밋하지 않고 확인 뒤 삭제한다**(`app/dev-sample/`에 이미 개발 전용 샘플 페이지가 있다).
    아현·민지는 이 확인을 하지 않는다.
  - **(나) 컴포넌트 렌더 테스트**: 아현이 추가한다. 저장소에는 `jsdom`·`testing-library`가 없고 `.test.tsx`도 없다.
    새 의존성을 들이지 않고 `react-dom/server`의 `renderToStaticMarkup`으로 서버 렌더해 「미등록 호스트 URL이어도 예외 없이
    `<img>`가 그려진다」를 고정하는 방식을 우선 시도한다. 컴포넌트가 라우터·컨텍스트에 의존해 서버 렌더가 어려우면 그 컴포넌트는
    테스트하지 못한 이유를 완료 기록에 적고, `SafeImage`의 계약(미등록 호스트 → `<img>`, 예외 없음)을 검증하는 테스트로 대신한다.

## 완료 조건

- 위 9개 파일 지점에서 `next/image`의 `<Image>`가 `SafeImage`로 바뀌어 있다(아바타·정적 로고는 그대로).
- 미등록 호스트 URL을 준 각 컴포넌트가 오류 화면 없이 렌더된다는 것이 (나) 테스트 또는 (가) 임시 확인으로 확인되어 있다.
  확인하지 못한 컴포넌트가 있으면 완료 기록에 어떤 것이고 왜인지 적는다. (가)는 **구현 범위가 아니라 카리나의 후속 범위**(병합 뒤
  push 전, 로컬)다.
- 등록 호스트·내부 경로 이미지는 이전과 같이 표시된다(피드·배지 목록·배지 상세 시트·컴바인 실렌더로 확인).
- `scripts/verify.sh` 통과.

---
## 완료 기록

### 구현 내용 요약

서비스 화면 9개 파일의 `next/image` `<Image>` 12곳을 `SafeImage`로 교체했다(아바타 `onboarding/page.tsx:337`과 정적 로고는 그대로).
기존 `{url ? <Image/> : <아이콘/>}` 삼항은 `SafeImage`의 `src`·`fallback`으로 합쳤다 — `src`가 비면 `SafeImage`가 폴백을 그리므로
화면 동작은 같고, 로드 실패·미등록 호스트도 같은 아이콘 자리로 흡수된다. 등록 호스트·내부 경로는 `SafeImage`가 `next/image`를 그대로 써서 표시가 같다.

지점별 폴백(모두 기존 else 분기의 요소를 그대로 옮겼다):
- `FeedSection` 112px·40px: 기존 `EventIcon` 박스 — 이미 있던 폴백이라 로드 실패에도 같은 것을 준다.
- `FeedSection` 묶음 썸네일 24px: 기존에 폴백이 없던 곳이라 같은 크기(`w-6 h-6`)의 옅은 칩(`bg-white/8`)을 줘 줄 간격이 밀리지 않게 했다.
- `CombineClient`·`RecipeRewardRow`: `PackageIcon`. `BadgeDetailSheet`·`PoiCarouselModal` 2곳·`BadgeTrophyGridCard`·`BadgeGridCard`: `MedalIcon`.
- `MissionDetailClient` 보상 행: 기존 `🏅`. `onboarding` 트라이브: 기존 `UserIcon` 박스.
- `MissionDetailClient`·`onboarding`은 `next/image` import를 정리했고(`onboarding`은 아바타용으로 `next/image` import가 남는다), `RecipeRewardRow`(서버 컴포넌트)는 클라이언트 컴포넌트인 `SafeImage`를 그대로 import한다.

### 변경된 파일
```
jam-web/src/app/(main)/FeedSection.tsx
jam-web/src/app/(main)/combine/CombineClient.tsx
jam-web/src/app/(main)/combine/RecipeRewardRow.tsx
jam-web/src/app/(main)/drops/BadgeDetailSheet.tsx
jam-web/src/app/(main)/missions/[id]/MissionDetailClient.tsx
jam-web/src/app/(main)/onboarding/page.tsx
jam-web/src/components/PoiCarouselModal.tsx
jam-web/src/components/badges/BadgeTrophyGridCard.tsx
jam-web/src/components/ui/BadgeGridCard.tsx
jam-web/src/components/__tests__/safeImageCallSites.test.tsx (신규)
```

### 테스트 결과
- [x] (나) `react-dom/server` `renderToStaticMarkup` 렌더 테스트 11건 — 새 의존성 없음. 미등록 호스트(`storage.heypop.kr`)를 준 `BadgeGridCard`·`BadgeTrophyGridCard`·`RecipeRewardRow`·`FeedSection`(단건 40px·묶음 24px)·`FeedSection` `DetailSheet`(112px)·`MissionDetailClient`(52px)가 예외 없이 `<img>`를 그린다. 교체 전 코드(`origin/staging`)로 되돌려 돌리면 이 중 5건이 실패하는 것을 확인했다(Prove-It). 나머지는 등록 호스트·폴백·`SafeImage` 계약 케이스다.
- [x] `scripts/verify.sh` 통과.
- [x] 게이트(민지): **PASS**(1차, 재작업 없음). 브랜치 HEAD 4d322bd2의 GitHub `verify` success(run 36151946541).
- 서버 렌더로 확인하지 못한 컴포넌트와 이유(아현): `BadgeDetailSheet`(176px)·`CombineClient`(64px, 가방 시트 안)·`PoiCarouselModal`(80px·44px)은 `BottomSheet`(`components/ui/BottomSheet.tsx:275`의 `if (!mounted) return null`, `:331` `createPortal`)나 마운트 이후에만 그려져 서버 렌더 결과에 이미지가 나오지 않는다. `onboarding/page.tsx`(트라이브 48px)는 훅·데이터 페치로 단계별 화면을 그려 초기 서버 렌더에 트라이브 선택 단계가 없다. 이 4개는 `SafeImage` 계약 테스트로 대신했고 아래 (가)에서 실렌더로 확인했다(온보딩 제외).
- [x] **(가) 실렌더 확인(2026-09-26, 사용자 승인)**: 로컬 `next dev`(`ADMIN_EMAILS` 셸 환경변수, dev-login 계정)에서 개발 전용 임시 페이지 두 개(`app/dev-sample/tmp-2358`·`tmp-2358-poi`)를 만들어 확인하고 삭제했다. **DB는 건드리지 않았다**(가짜 props와 `window.fetch` 가로채기만 사용). 임시 페이지는 커밋하지 않았고 작업 트리는 깨끗하다.
  - 미등록 호스트 URL(`storage.heypop.kr`, 홈피드 카드에 실제로 있는 값)을 준 결과, 모두 오류 화면 없이 일반 `<img>`로 표시되고 이미지가 로드됐다(`naturalWidth` 800): `BadgeDetailSheet` 176px, `CombineClient` 목록의 보상 이미지 40px(`RecipeRewardRow`)와 가방 시트의 후보 이미지 64px, `PoiCarouselModal` 픽업 목록 44px·보유 배지 목록 44px·드랍 확인 단계 80px.
  - 등록 호스트 실표시(실제 프로덕션 데이터): 서비스 배지 상세(`/badges/[id]`, 2319에서 바꾼 `BadgeHeroSection`의 200px 히어로)와 미션 상세(`/missions/[id]`, 52px 이미지)가 오류 없이 열리고 이미지가 `/_next/image`로 최적화되어 로드됐다(배지 상세는 이미지 요청 200 응답, 미획득 배지라 원래 스타일대로 반투명). `/badges`·`/`(홈)도 오류 없이 열렸고 홈의 미등록 호스트 카드 4장은 기존대로 `SafeImage`로 표시된다.
- **직접 확인하지 못한 곳(브라우저)**: `FeedSection` 3곳(활동 피드), `BadgeTrophyGridCard`·`BadgeGridCard`(배지 그리드·컬렉션 표지), `onboarding/page.tsx` 트라이브 이미지. dev-login 계정에 팔로잉·획득 배지가 없어 그 화면들에 항목이 나타나지 않았고, 온보딩은 진행하면 사용자 데이터를 바꾸며 트라이브 이미지 값이 프로덕션에 없다. 이 곳들은 (나) 서버 렌더 테스트(온보딩 제외)로만 확인했다.

### 배포 정보
- 배포일: (main 배포 전, staging 반영은 2026-09-26)
- 환경: staging
- 커밋: 병합 커밋 971f21e3 (구현 4d322bd2)
- DB 마이그레이션: 없음.

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 | 134,172 | 25,661 / 3,896 | 9분 52초 | 47 |
| 합계 | 아현·민지 | 134,172 | 25,661 / 3,896 | 9분 52초 | 47 |

### 주요 의사결정 / 핵심 메모
- 삼항을 유지한 채 `<Image>`만 바꾸는 대신 `src`·`fallback`으로 합쳤다. 이유: 삼항을 남기면 로드 실패 폴백을 지점마다 따로 이중으로 써야 한다.
- ESLint 규칙의 서비스 화면 확장은 이 티켓 범위가 아니다(티켓 20260925_2354 결정).

### 잔여 이슈
- 위 「직접 확인하지 못한 곳」(활동 피드 3곳·배지 그리드 카드·온보딩 트라이브)은 브라우저 실렌더 미확인이다.
- 아바타 7곳과 정적 로고 3곳은 이 티켓 범위 밖이다(티켓 2354 결정). ESLint 규칙의 서비스 화면 확장은 서비스 전환을 마친 뒤 판단한다(티켓 2354 잔여 이슈).
- [참고] 민지: `FeedSection` `DetailSheet`의 이미지 없음 케이스 테스트가 `expect(html).not.toContain('width="112"')`만 확인하고 폴백 아이콘이 그려졌는지는 직접 검증하지 않는다.
