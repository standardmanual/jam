---
id: 20260903_1414
category: UI
status: CLOSED
created: 2026-09-03
closed: 2026-09-03
---

# [UI] ItemSerialCode 아이템 배지 상세 페이지 배치 샘플 + 시각 튜닝

## 배경 / 문제 정의
[티켓 20260903_1356](20260903_1356_UI_아이템배지-일련번호-ItemSerialCode-MODULAR-신규등록.md)에서
MODULAR에 등록한 `ItemSerialCode`를 실제 배지 상세 페이지 맥락(430px 모바일 폭, 다른 실제
컴포넌트들 사이)에 놓고 봤을 때도 괜찮은지 확인이 필요했다. 실제 서비스 파일은 건드리지
않고 별도 샘플로 확인 후, 승인된 값을 디자인시스템에 반영한다.

## 상세 요구사항

### UI/UX 관점
- 실제 서비스 라우트(`badges/[id]/page.tsx`)를 리뉴얼하지 않고 별도 샘플 페이지로 확인
- 아이템배지 상세 화면에서 기존 "일련번호" 텍스트 영역(`ItemEarnHistory` 카드 내 일련번호 행)을
  제거하고, 설명(`BadgeHeroSection` 하단)과 획득 이력 사이 공간에 `ItemSerialCode` 배치
  (타이틀 텍스트 없음)
- 카드 밝은 부분(하이라이트) 톤 다운, 전체 크기 축소 — 사용자 시각 검토 후 확정

## 구현 계획
1. `src/app/dev-sample/item-badge-serial/page.tsx` 신규 — 실제 컴포넌트(TopNav,
   BadgeHeroSection, ListRowCard 등) 재사용 + 목 데이터로 인증 없이 로컬 확인 가능하게 구성
2. `npm run dev`로 로컬 확인 → 사용자 피드백에 따라 `ItemSerialCode.jsx` 반복 조정
3. 확정값을 Storybook 스토리에도 반영, `ds:check`로 회귀 확인

---
## 완료 기록

### 구현 내용 요약
- **샘플 페이지**: `src/app/dev-sample/item-badge-serial/page.tsx` 신규 작성. 실제
  `TopNav`·`BadgeHeroSection`·`ListRowCard`·`LocalDate` 컴포넌트를 그대로 재사용하고 목
  배지/인벤토리 데이터만 하드코딩 — 실제 서비스 라우트는 무수정
  - 설명 문단 바로 아래, 획득 이력 카드 위에 `ItemSerialCode` 배치, 타이틀 텍스트 없음
  - 획득 이력 카드에서 일련번호 행 제거, 획득일/만료일만 표시 (실제 `ItemEarnHistory.tsx`는
    무수정 — 이 페이지 전용으로 인라인 재구성)
- **시각 튜닝** (사용자가 스크린샷 보고 반복 요청, 최종 승인):
  1. 카드 하이라이트(radial-gradient 최고점) 알파 `0.38 → 0.27`(-30%) → `0.27 → 0.19`(추가 -30%,
     누적 약 -50%)
  2. 전체 크기 70%로 축소 — 샘플 페이지 호출부 `height={72} → height={50}`
     (컴포넌트 기본값 `height=160`은 변경하지 않음 — 이 값은 이 배치 맥락 전용 튜닝)
- **디자인시스템 반영**: 하이라이트 알파는 `ItemSerialCode.jsx` 자체 값이라 모든 사용처에
  공통 적용됨. `height=50`은 특정 배치(배지 상세 페이지, 430px 폭) 전용 값이라 컴포넌트 기본값은
  그대로 두고, Storybook `Compact` 스토리를 이 실측값으로 갱신해 재사용 가능한 참고값으로 남김

### 변경된 파일
```
jam-web/src/app/dev-sample/item-badge-serial/page.tsx        (신규 — 샘플, 실서비스 라우트 아님)
jam-web/design-system/components/patterns/ItemSerialCode.jsx  (하이라이트 알파 0.38→0.19)
jam-web/design-system/components/patterns/ItemSerialCode.stories.tsx (Compact 스토리 height 56→50)
```

### 테스트 결과
- [x] `npm run ds:check` — 오류 0 (이전과 동일, 신규 드리프트 없음)
- [x] `tsc --noEmit`, `eslint` — 샘플 페이지 오류 0
- [x] 로컬 dev 서버(`:3000/dev-sample/item-badge-serial`)에서 매 조정 단계마다 스크린샷으로
  시각 확인 (Playwright 헤드리스 렌더 — `/api/dev-login`으로 인증 후 캡처)
- [x] Storybook `Compact` 스토리도 동일 값으로 재확인

### UX Writing 검증
해당 없음 — 신규 사용자 노출 문구 없음 (기존 i18n 문구 재사용만).

### 배포 정보
- 배포일: 2026-09-03
- 환경: MODULAR 디자인시스템(L2) + 로컬 전용 샘플 라우트. **서비스(L1) 미반영**은 그대로 유지
- 커밋: (staging 커밋 참조)

### 주요 의사결정 / 핵심 메모
- **샘플을 `(main)/` 라우트 그룹 밖에 뒀다.** `(main)/layout.tsx`는 서버 컴포넌트에서
  로그인 세션을 조회해 없으면 `/login`으로 리다이렉트한다 — 샘플까지 그 안에 넣으면 레이아웃이
  요구하는 프로필/스트라바 조회 등 부가 데이터를 함께 목킹해야 했다. 다만 `src/proxy.ts`
  (이 프로젝트의 커스텀 Next.js 버전에서 middleware.ts 역할)가 `_next/static` 등 몇 경로를
  제외한 **모든** 요청에 인증을 강제해, `(main)` 밖에 둬도 로그인 자체는 여전히 필요했다.
  프록시를 수정해 샘플 경로를 예외 처리하는 대신, 이미 있는 `/api/dev-login`
  (NODE_ENV=development 전용 테스트 로그인 우회)을 그대로 활용 — 인증 인프라는 건드리지 않음
- **컴포넌트 기본값(height=160)은 그대로 둠.** height=50은 430px 폭·이 특정 배치에 맞춘 값이라
  전역 기본값으로 승격하면 다른 맥락에서 다시 작아지는 회귀가 된다. `height` prop으로 맥락별
  조정한다는 원래 설계(티켓 20260903_1356)를 그대로 유지
- **하이라이트 알파 조정은 상대값(-30%×2)으로 누적 적용.** 사용자가 각 요청을 "현재 값 대비
  -30%"로 표현해 절대값이 아닌 곱연산으로 처리 (0.38→0.27→0.19)

### 잔여 이슈
- 서비스(L1) 적용 여부·시점은 여전히 미정 (사용자가 "실제 서비스를 리뉴얼하지 말고 별도로
  만들자"고 명시 — 이번에도 준비 단계까지만)
- claude.ai/design(L4) 재업로드 보류 계속 — [티켓 20260903_1356](20260903_1356_UI_아이템배지-일련번호-ItemSerialCode-MODULAR-신규등록.md)에서
  발견된 62개 파일 백로그에 이번 변경 2개 파일이 추가됨. 여전히 전체 재업로드 규모라 사용자
  확인 후 별도 진행
- `dev-sample/item-badge-serial`은 검토용으로 남겨둠 — 계속 보관할지, 실제 적용 후 삭제할지는
  후속 판단 필요
