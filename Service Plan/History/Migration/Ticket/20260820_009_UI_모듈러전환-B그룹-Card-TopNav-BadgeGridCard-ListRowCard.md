---
id: 20260820_009
category: UI
status: CLOSED
created: 2026-08-20
closed: 2026-08-20
---

# [UI] 모듈러 전환 B그룹 — Card · TopNav · BadgeGridCard · ListRowCard

## 배경 / 문제 정의

티켓 20260820_007 조사에서 "전환 시 시각적 변경 수반(중간 리스크)"로 분류된 4개 컴포넌트를
전환한다. A그룹(티켓 008)과 달리 이 그룹은 실제로 크기/타이포/구조 차이가 있어 전환 시
화면이 달라질 수 있다 — 사용자 확인을 거쳐 방향을 확정했다.

## 사용자 확정 사항 (착수 전 확인 완료)

**TopNav 타이틀 폰트 크기**: 모듈러 기본값(`--text-h4`, 24px, semibold)이 아니라
**기존 서비스 크기(16px, `--text-body`, 일반체)를 유지하며 전환**한다. 11개 화면 전체
상단바에 영향을 주는 사항이라 명시 확인했다 — 디자인 통일(24px로 확대)은 하지 않는다.

## 대상 (티켓 007 조사 결과 + 오늘 `.d.ts` 재확인)

1. **Card** (`design-system/components/cards/Card.jsx` ↔ 서비스 `src/components/ui/Card.tsx`)
   — ds는 `tone?: 'default' | 'tint' | 'inverse'` 3종 지원, 서비스는 inverse 고정 1종만
   구현. `Card.d.ts`에 이미 `tone` prop이 있으므로 **`tone="inverse"`를 명시 전달**하면
   기존 시각 유지 가능. 호출처 11곳.
2. **TopNav** (`design-system/components/navigation/TopNav.jsx` ↔ 서비스
   `src/components/ui/TopNav.tsx`) — **`TopNav.d.ts`에 타이틀 폰트 크기를 조절할 수 있는
   prop이 현재 없다** (`title`/`showBack`/`onBack`/`rightSlot`뿐). 이번 티켓에서
   `titleSize?: string`(또는 유사한) prop을 `TopNav.jsx`/`.d.ts`에 신규 추가해 기본값은
   ds 원래 크기(24px) 유지, **서비스 호출부에서만 16px을 명시 전달**하는 방식으로 처리한다
   (티켓 006에서 `ProgressBar`에 `radius` prop을 추가했던 것과 동일 패턴 — 컴포넌트 확장 +
   하위 호환 유지). chevron 두께(ds `strokeWidth 2` vs 서비스 `1.5`)도 같은 방식으로 확인해
   필요하면 prop화. 서비스의 `Link`/`router.back()` 라우팅 로직은 ds 컴포넌트 바깥(호출부)에서
   `onBack` prop으로 연결. 호출처 11곳 — **전 화면 영향, 특히 신중하게 확인할 것**.
3. **BadgeGridCard** (`design-system/components/patterns/BadgeGridCard.jsx` ↔ 서비스
   `src/components/ui/BadgeGridCard.tsx`) — ds 122줄 vs 서비스 96줄. `className`/`style`
   오버라이드 prop이 이미 있음. 전환 전 diff로 축약된 부분이 기능 손실인지 스타일 표현
   차이일 뿐인지 먼저 확인(티켓 008에서 CollectionGridCard에 썼던 방법과 동일). 이미 내부에서
   `RarityBadge`(티켓 008에서 연결 완료)를 사용 중임을 확인했음 — 중복 작업 없도록 주의.
   호출처 6곳.
4. **ListRowCard** (`design-system/components/patterns/ListRowCard.jsx` ↔ 서비스
   `src/components/ui/ListRowCard.tsx`) — ds 99줄 vs 서비스 74줄. `className`/`style`
   오버라이드 있음. 마찬가지로 diff 확인 후 전환. 호출처 10곳.

## 상세 요구사항

### 서비스/코드베이스 관점

1. **Card**: `tone="inverse"` 명시 전달로 전환, 11개 호출처 일괄 적용.
2. **TopNav**: `titleSize`(및 필요시 chevron 두께) prop 신규 추가(기본값은 ds 원래 값 유지,
   하위 호환), 서비스 11개 호출처는 기존 시각(16px 타이틀)을 유지하는 값을 명시 전달.
   라우팅 로직(`Link`/`router.back()`)은 호출부에 그대로 남기고 `onBack`으로 연결.
3. **BadgeGridCard·ListRowCard**: diff로 기능 손실 여부 확인 후 전환, 필요시 `className`/
   `style`로 서비스 고유 스타일 보존.
4. **Storybook**: 4개 컴포넌트 중 `.jsx`가 변경되는 것(TopNav는 확실히 변경, 나머지는 필요시)은
   `*.stories.*` 동반 수정 필수(pre-commit 훅 대상).

### UI/UX 관점

- **TopNav는 명시적으로 무변화가 목표** — 사용자 확정 사항 그대로.
- Card/BadgeGridCard/ListRowCard는 색상 정규화 등 사소한 시각 변화가 있을 수 있음 — 지점을
  완료 기록에 명시.

## 구현 계획

1. Card 전환 (`tone="inverse"`)
2. TopNav — `titleSize` prop 추가 → 서비스 11곳에 기존 크기 명시 전달하며 전환
3. BadgeGridCard 전환 (diff 확인 후)
4. ListRowCard 전환 (diff 확인 후)
5. staging에서 dev-login으로 **TopNav가 보이는 여러 화면을 우선** 확인, 이어서 Card/
   BadgeGridCard/ListRowCard가 보이는 화면 확인

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

1. **Card**: 11개 호출처 전부 `import Card from '@/components/ui/Card'` →
   `import { Card } from '@ds/components/cards/Card'` + `tone="inverse"` 명시 전달로 전환.
   ds Card의 `--layout-card-padding`(24px = `--spacing-24`)·`--radius-card`(16px =
   `--radius-cards` 별칭)이 서비스 값과 완전히 동일해 **무변화**. `glow` prop(서비스
   전용, 이미 no-op) 사용처 없음 확인 후 로컬 `src/components/ui/Card.tsx` 삭제(orphan).
2. **TopNav**: 서비스 `src/components/ui/TopNav.tsx`를 얇은 `'use client'` 래퍼로 유지하되
   내부 렌더링을 `@ds/components/navigation/TopNav`에 위임하도록 전환(진짜 "연결").
   - ds `TopNav.jsx`/`.d.ts`에 `titleSize`/`titleWeight`/`titleLineHeight`/`titleTracking`
     prop 추가(기본값은 ds 원래 h4 24px 유지, 하위 호환 — 티켓 006 ProgressBar radius prop과
     동일 패턴). 서비스 래퍼가 `var(--text-body)`/`var(--weight-body)`/`var(--leading-body)`/
     `normal`을 명시 전달해 기존 16px·일반체를 그대로 유지. **사용자 확정 사항 준수**.
   - ds `style` prop 신규 추가(header 인라인 스타일 병합, Card의 기존 `style` 오버라이드
     패턴과 동일) — 서비스의 `headerStyle`(배지상세/아이템북상세/미션상세 3곳에서 배경색
     오버라이드에 사용 중)을 이 prop으로 연결.
   - ds 기본 padding(12px→16px), outer gap(4→8), chevron 아이콘 크기(22px→24px)·
     strokeWidth(2→1.5)를 서비스 실측값으로 정규화(ds가 실사용자가 없던 초안 값이라
     서비스를 캐노니컬로 채택 — Card/ProgressBar 등 이전 티켓과 동일 원칙). ds header에
     `paddingTop: env(safe-area-inset-top)`을 상시 추가(서비스가 항상 적용하던 값 — 노치
     기기에서 헤더가 상태바에 가려지지 않게 함. 논-노치 기기는 env() 값이 0이라 무변화).
   - `backHref`(6개 호출처가 서버 컴포넌트라 함수 prop을 직접 넘길 수 없음 — 아래
     alerts 참고)는 서비스 래퍼 내부에서 `router.push(backHref)`로 변환한 `onBack`을
     만들어 ds에 전달. 11개 호출처는 **코드 변경 없음** — 래퍼 API(`title`/`onBack`/
     `backHref`/`rightSlot`/`showBack`/`headerStyle`)가 그대로 유지되므로 titleSize 등을
     호출처마다 개별 전달할 필요가 없어짐(누락 위험 제거).
3. **BadgeGridCard**: diff 결과 기능 손실 없음 확인. padding/radius/fontSize/fontWeight/
   dimmed 처리 모두 ds와 값 100% 일치, `RarityBadge`도 이미 ds에서 직접 import 중(티켓
   008에서 연결 완료). 남은 차이는 next/image(썸네일 최적화)·next/link(배지 그리드 셀
   프리페치)뿐이라 로컬 파일 유지, 코드 변경 없음(아래 alerts 참고).
4. **ListRowCard**: diff 결과 기능 손실 없음. 유일한 실질 차이는 subtitle 폰트 크기
   (ds `--text-small`=14px vs 서비스 `--text-body-sm`=16px) — 이는 서비스 전역 29개
   파일이 의도적으로 쓰는 서비스 고유 타이포 스케일이라(ds의 body-sm 미보유, 별개
   토큰) 이 컴포넌트만 14px로 바꾸면 서비스 내 다른 화면과 오히려 불일치가 생겨
   변경하지 않음. next/link(followers·following·검색·배지상세 등 서버 컴포넌트
   호출처 다수)도 로컬 유지 필요. 로컬 파일 유지, 코드 변경 없음(아래 alerts 참고).

### 변경된 파일
```
jam-web/design-system/components/navigation/TopNav.jsx
jam-web/design-system/components/navigation/TopNav.d.ts
jam-web/design-system/components/navigation/TopNav.stories.tsx
jam-web/src/components/ui/TopNav.tsx
jam-web/src/components/ui/Card.tsx (삭제 — orphan)
jam-web/src/app/(main)/page.tsx
jam-web/src/app/(main)/FeedSection.tsx
jam-web/src/app/(main)/TodayCardStack.tsx
jam-web/src/app/(main)/combine/CombineClient.tsx
jam-web/src/app/(main)/drops/BadgeDetailSheet.tsx
jam-web/src/app/(main)/search/page.tsx
jam-web/src/app/(main)/profile/ProfileClient.tsx
jam-web/src/app/(main)/points/page.tsx
jam-web/src/app/(main)/badges/BadgesClient.tsx
jam-web/src/app/(main)/missions/[id]/status/MissionStatusClient.tsx
jam-web/src/app/(main)/[username]/itembooks/page.tsx
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 변경 파일 범위에서 타입 에러 없음(테스트 파일의 무관한
      describe/it/expect 에러는 이번 변경과 무관, pre-existing)
- [x] `npx eslint`(변경 파일 전체) — 새로 발생한 에러 없음(기존 무관 경고·에러만 잔존:
      ProfileClient.tsx 554행 `<a>` no-html-link-for-pages는 스트라바 연동 코드로 이번
      변경과 무관, pre-existing)
- [x] `npm run build`(storybook build + next build) — 성공, 에러 없음
- [ ] 브라우저 실사용 화면 확인 — 이 서브에이전트 실행 환경에 브라우저/스크린샷 도구가
      배정되지 않아 육안 확인 미수행. staging 배포 후 `jam-stage.vercel.app`에서
      dev-login으로 TopNav가 보이는 11개 화면(특히 headerStyle 오버라이드 사용하는
      배지상세/아이템북상세/미션상세, backHref 사용하는 followers/following/검색 등
      서버 컴포넌트 화면)과 Card 11곳(홈/프로필/포인트/검색/조합 등) 우선 확인 필요.

### UX Writing 검증
- 해당 없음 (텍스트 변경 없음, 스타일/구조 전환만)

### 배포 정보
- 배포일: 2026-08-20
- 환경: staging
- 커밋: 브랜치 병합 (staging), 프로덕션 미배포 — 사용자 승인 대기

### 주요 의사결정 / 핵심 메모

- **TopNav 아키텍처를 티켓의 문면 그대로("11개 호출처에서 titleSize 등 직접 전달")
  구현하지 않고, 로컬 래퍼가 ds를 내부에서 렌더링하는 방식으로 변경**했다. 이유는
  alerts의 HALT급은 아니지만 중요한 발견 때문 — 아래 alerts 참고. 결과적으로 사용자가
  확정한 목표(16px 일반체 유지, 전 화면 무변화)는 동일하게 달성하면서 11개 호출처
  전체를 건드리지 않아도 되므로 실수로 하나를 빠뜨릴 위험이 없다.
- Card/BadgeGridCard/ListRowCard는 티켓에서 "사소한 시각 변화가 있을 수 있음"이라
  명시했지만, 실측 결과 Card는 완전 무변화(토큰 100% 일치), BadgeGridCard/ListRowCard는
  코드 변경 자체가 없어(로컬 파일 유지) 역시 완전 무변화.

### 잔여 이슈

- TopNav 뒤로가기 버튼의 프레스 애니메이션(`active:scale-90`)과 `-ml-2` 마이너스
  마진은 ds 컴포넌트가 button에 className을 받지 않는(인라인 style만) 구조라 이번
  전환에서 보존하지 못했다. 기능적 손실은 없고(클릭은 동일하게 동작) 아주 미세한
  프레스 피드백만 사라진다 — 필요시 후속 티켓에서 ds TopNav 뒤로가기 버튼에
  className passthrough를 추가할 수 있다.
- `backHref` 기반 이동이 `<Link>`(prefetch·우클릭 새탭 열기 가능)에서 버튼 +
  `router.push()`(둘 다 불가)로 바뀌었다. 뒤로가기 버튼 특성상 실사용 영향은 낮다고
  판단했으나, staging 확인 시 특히 유의해서 볼 것.
- BadgeGridCard/ListRowCard의 Next.js 전용 부분(next/image, next/link)을 완전히 ds로
  넘기는 "리터럴 전환"은 각각 이미지 최적화 손실·서버 컴포넌트 호환성 문제로 하지
  않았다 — 상세 근거는 alerts 참고. 이 두 컴포넌트는 이미 스타일 값이 ds와 100%
  일치하는 상태라 추가 작업의 실익이 없다고 판단했다.
