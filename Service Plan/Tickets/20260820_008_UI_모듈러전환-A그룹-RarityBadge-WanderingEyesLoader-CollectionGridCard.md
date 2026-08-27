---
id: 20260820_008
category: UI
status: CLOSED
created: 2026-08-20
closed: 2026-08-20
---

# [UI] 모듈러 전환 A그룹 — RarityBadge · WanderingEyesLoader · CollectionGridCard 잔여분

## 배경 / 문제 정의

티켓 20260820_007 조사에서 리스크가 가장 낮은 3개 컴포넌트로 분류된 것을 전환한다. 이미
캐노니컬 스펙이 서비스 구현을 기준으로 만들어졌거나 토큰이 100% 일치해, ProgressBar 파일럿과
같은 패턴으로 안전하게 전환 가능하다.

## 대상 (티켓 007 조사 결과)

1. **RarityBadge** (`design-system/components/cards/RarityBadge.jsx` ↔
   서비스 `src/components/ui/Badge.tsx`, export명 `RarityBadge`) — 토큰명 100% 동일
   (`--color-rarity-*`, `--color-rarity-*-text`). 차이: padding이 ds `6px 14px` vs 서비스
   `px-2.5 py-1`(10px/4px), `--tracking-label`을 서비스는 적용 안 함. 호출처 7곳
   (`page.tsx`, `MissionDetailClient`, `BadgeDetailSheet`, `BadgeHeroSection`,
   `BadgeGridCard.tsx` 등).
2. **WanderingEyesLoader** (`design-system/components/feedback/WanderingEyesLoader.jsx` ↔
   서비스 `src/components/ui/WanderingEyesLoader.tsx`) — ds 파일 주석에 "소스: 서비스 파일
   1:1 재현"이라고 명시돼 있어 캐노니컬 자체가 서비스 기준. 차이: 기본 `duration` 2s(ds) vs
   8s(서비스), 기본 색 ds는 CSS var 폴백, 서비스는 hex 하드코딩. 호출처 1곳(`NavigationLoader.tsx`).
3. **CollectionGridCard** (`design-system/components/patterns/CollectionGridCard.jsx` ↔
   서비스 `src/components/ui/CollectionGridCard.tsx`) — `ProgressBar` 부분은 이미 티켓 005에서
   연결됨. 카드 프레임/레이아웃 나머지 부분(156줄 ds vs 91줄 서비스, 구조 축약)이 미연결.
   호출처 2곳.

## 상세 요구사항

### 서비스/코드베이스 관점

각각 `@ds/*` import로 전환한다. 티켓 004에서 확립한 방법(확장자 생략, 별도 설정 불필요)을
그대로 따른다.

1. **RarityBadge**: padding·tracking 차이가 실제 전환 시 서비스 화면에 어떻게 보이는지
   확인 — 이건 색상이 아니라 크기 차이라 티켓 005 사례와 다르게 배지 크기/여백이 미세하게
   바뀔 수 있다. 값 차이가 있는 지점을 완료 기록에 명시할 것(색상 변경이 아니므로 티켓 005보다
   회귀 여지가 작지만, 여전히 "완전 무변화"는 아님).
2. **WanderingEyesLoader**: duration 기본값이 다르다 — **서비스 값(8s)을 유지**해야 하는지
   확인 필요(로딩 애니메이션 속도가 사용자 체감에 영향). ds 기본값(2s)을 그대로 쓰면 로딩
   애니메이션이 4배 빨라진다 — `NavigationLoader.tsx` 호출부에서 `duration={8}`(또는 서비스
   기존 값)을 명시적으로 전달해 실제 체감 속도를 유지할 것. 색상도 마찬가지로 기존 hex 값을
   prop으로 명시 전달해 색이 안 바뀌게 할 것(무변화가 목표).
3. **CollectionGridCard**: 카드 프레임 나머지 부분을 ds 구조로 전환할 때, 이미 연결된
   ProgressBar 부분과 충돌하지 않는지 확인. ds 156줄 vs 서비스 91줄의 구조 축약분이 정확히
   무엇인지(생략된 기능이 있는지) 먼저 diff 확인 후 전환.

### UI/UX 관점

- WanderingEyesLoader는 **의도적으로 무변화**(duration/색상 prop 명시 전달)를 목표로 한다.
- RarityBadge는 padding 차이로 미세한 크기 변화가 있을 수 있음 — 완료 기록에 명시.

## 구현 계획

1. RarityBadge 전환 (7개 호출처)
2. WanderingEyesLoader 전환 (1개 호출처, duration/색상 명시 전달로 무변화 유지)
3. CollectionGridCard 카드 프레임 나머지 부분 전환 (2개 호출처)
4. staging에서 dev-login으로 실제 화면 확인 (배지 표시되는 여러 화면, 로딩 화면, 컬렉션 그리드)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

1. **RarityBadge**: `src/components/ui/Badge.tsx`를 참조하던 직접 호출처 6곳(`page.tsx`,
   `MissionDetailClient.tsx`, `BadgeDetailSheet.tsx`, `BadgeHeroSection.tsx`,
   `BadgeGridCard.tsx`, `CollectionGridCard.tsx`) 모두 `import { RarityBadge } from
   '@ds/components/cards/RarityBadge'`로 전환. 서비스 파일 `Badge.tsx`는 참조하는 곳이
   없어져 삭제(orphan 정리). `BadgesClient.tsx`/`CombineClient.tsx` 등은 `BadgeGridCard`를
   통해 간접 참조하므로 별도 수정 불필요.
   - `page.tsx`/`MissionDetailClient.tsx`/`BadgeDetailSheet.tsx`/`BadgeHeroSection.tsx`/
     `BadgeGridCard.tsx`는 `<RarityBadge rarity={...} />` 단순 호출이라 className 오버라이드가
     없었음 — padding이 `px-2.5 py-1`(10px/4px)에서 ds 기본값 `6px 14px`로, tracking이
     0 → `--tracking-label`(0.4px)로 바뀜. 색은 토큰 100% 동일이라 무변화, 크기만 미세하게
     커짐(가로 +4px, 세로 +2px 수준).
   - `CollectionGridCard.tsx`는 `className="text-[length:var(--text-caption)] px-2 py-0.5"`로
     패딩을 줄여 쓰고 있었는데, ds RarityBadge는 padding을 인라인 style로 고정하기 때문에
     className으로 오버라이드가 원천적으로 불가능함(인라인 style이 항상 클래스보다 우선).
     이 className을 제거하고 ds 기본 크기(6px 14px)를 그대로 노출 — 컬렉션 그리드 카드
     썸네일 위 등급 태그가 기존보다 눈에 띄게 커짐. 아래 alerts 참조.
2. **WanderingEyesLoader**: `NavigationLoader.tsx`의 import를
   `@ds/components/feedback/WanderingEyesLoader`로 전환. 티켓 배경 설명은 "서비스 기본값 8s"를
   전제했지만, 실제 호출부(`<WanderingEyesLoader duration="2s" eyeColor="#f8fafc"
   pupilColor="#0f172a" />`)는 이미 `duration="2s"`를 명시 전달하고 있어 컴포넌트의 default
   prop(8s)은 애초에 적용된 적이 없었음(사용 안 하는 default). ds 컴포넌트 default도 2s라
   동일 — 기존 explicit prop을 그대로 유지 전달했으므로 실제 렌더 결과는 완전 무변화.
   서비스 로컬 파일(`src/components/ui/WanderingEyesLoader.tsx`)은 참조하는 곳이 없어져 삭제.
3. **CollectionGridCard**: ds 156줄 vs 서비스 91줄 차이를 diff한 결과, 누락된 기능은 없음 —
   차이는 (a) ds가 인라인 style 객체로 작성돼 JS가 장황해진 것, (b) ds 패턴 파일 자체가
   `ProgressBar` 컴포넌트를 재사용하지 않고 진행바를 자체 재구현(수동 `scaleX` div)한 것,
   (c) ds 패턴 파일이 등급 태그를 `RarityBadge` 컴포넌트 재사용 없이 자체 `TAG_STYLE`
   (padding 3px 8px)로 재구현한 것뿐. 서비스 쪽은 이미 티켓 005에서 실제 `@ds` ProgressBar
   컴포넌트를 재사용 중이라 (b)는 이미 더 나은 상태이므로 유지. "완성" 태그 배경을 하드코딩
   `#E8461F` → `var(--color-primary)` 토큰으로 치환(같은 값, #e8461f = --color-base-red →
   --color-primary). `--radius-cards`는 `--radius-card`의 별칭(`design-system/tokens/radius.css`)
   이라 값 차이 없어 유지. next/image·next/link 등 Next.js 전용 요소는 프레임워크 어댑테이션이라
   유지(ds는 프레임워크 비종속이라 순수 `<img>`/`<a>` 사용).

### 변경된 파일
```
jam-web/src/app/(main)/page.tsx
jam-web/src/app/(main)/missions/[id]/MissionDetailClient.tsx
jam-web/src/app/(main)/drops/BadgeDetailSheet.tsx
jam-web/src/app/(main)/badges/[id]/BadgeHeroSection.tsx
jam-web/src/components/ui/BadgeGridCard.tsx
jam-web/src/components/ui/CollectionGridCard.tsx
jam-web/src/components/NavigationLoader.tsx
jam-web/src/components/ui/Badge.tsx (삭제 — orphan)
jam-web/src/components/ui/WanderingEyesLoader.tsx (삭제 — orphan)
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 변경 파일 범위에서 타입 에러 없음(기존 테스트 파일의 무관한
      `describe/it/expect` 에러는 이번 변경과 무관, pre-existing)
- [x] `npx eslint` (변경 파일 전체) — 에러 없음
- [x] `npm run build` (storybook build + next build) — 성공
- [x] 로컬 `next dev` 기동 확인, `/api/dev-login` 307 리다이렉트 정상 응답
- [ ] 브라우저 실사용 화면 확인 — 이 서브에이전트 실행 환경에 브라우저/스크린샷 도구가
      배정되지 않아 육안 확인 미수행. staging 배포 후 `jam-stage.vercel.app`에서
      dev-login으로 배지 화면(홈/미션상세/드랍/배지상세)·로딩 화면·컬렉션 그리드(배지함/프로필)
      확인 필요.

### UX Writing 검증
- 해당 없음 (텍스트 변경 없음, 스타일/import 전환만)

### 배포 정보
- 배포일: 2026-08-20
- 환경: staging
- 커밋: 브랜치 병합 (staging), 프로덕션 미배포 — 사용자 승인 대기

### 주요 의사결정 / 핵심 메모
- RarityBadge를 재사용하는 6개 호출처 모두 동일 방식으로 전환. CollectionGridCard의
  className 패딩 오버라이드는 ds 컴포넌트가 인라인 style을 쓰는 구조상 애초에 무력화되므로
  제거하고 ds 기본 크기를 그대로 노출하기로 결정(별도 로컬 재구현 대신 task 1에서 확립한
  공유 컴포넌트 재사용 원칙 유지 — 상세 근거는 alerts 참조).
- WanderingEyesLoader는 실제로는 완전 무변화(호출부가 이미 explicit prop 전달 중이었음).

### 잔여 이슈
- CollectionGridCard의 등급 태그 크기 확대(아래 WARN)는 사용자 확인 후 필요시 별도 후속
  티켓으로 ds RarityBadge에 size variant(sm/md)를 추가하거나, CollectionGridCard 전용 컴팩트
  버전을 논의할 수 있음.
