---
id: "20260925_2358"
category: Service
priority: P2
status: OPEN
created: 2026-09-25
closed:
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

## 결정 필요

- **실렌더 확인 방법**: 서비스 화면의 배지 이미지는 활동 피드가 소프트 삭제된 배지를 제외하는 등(`lib/activity-feed/
  hydrate.ts`) 활성 데이터에서만 보이는데, 활성 임시 배지는 일반 사용자에게 노출될 수 있어 공용 DB에 만들기 위험하다.
  (가) 개발 전용 샘플 페이지에 컴포넌트를 임시로 올려 미등록 호스트 URL로 확인한다(DB 무변경, 확인 뒤 되돌림),
  (나) 컴포넌트 렌더 테스트를 추가한다, (다) 사용자 승인을 받아 임시 데이터를 만든다 중에서 착수 때 정한다.
  카리나 추천은 (가)+(나)다(판단: DB 쓰기 없이 미등록 호스트 동작을 재현하고 회귀도 고정한다).

## 완료 조건

- 위 9개 파일 지점에서 `next/image`의 `<Image>`가 `SafeImage`로 바뀌어 있다(아바타·정적 로고는 그대로).
- 미등록 호스트 URL을 준 각 컴포넌트가 오류 화면 없이 렌더된다는 것이 실렌더 또는 테스트로 확인되어 있다.
  확인하지 못한 컴포넌트가 있으면 완료 기록에 어떤 것이고 왜인지 적는다.
- 등록 호스트·내부 경로 이미지는 이전과 같이 표시된다(피드·배지 목록·배지 상세 시트·컴바인 실렌더로 확인).
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
