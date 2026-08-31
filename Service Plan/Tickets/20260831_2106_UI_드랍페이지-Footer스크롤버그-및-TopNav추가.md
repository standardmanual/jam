---
id: 20260831_2106
category: UI
status: OPEN
created: 2026-08-31
---

# [UI] 드랍 페이지 Footer 스크롤 버그 수정 + TopNav 추가

## 배경 / 문제 정의

사용자가 아이폰 사파리에서 드랍(지도) 페이지(`/drops`)를 스크롤하면 하단 Footer가 지도 위로
끌려 올라오는 문제, 그리고 드랍 페이지 상단에 TopNav가 없는 문제 두 가지를 신고했다.

**원인 조사 결과 (조사 완료, 코드 수정 없음)**:

### 1. Footer 스크롤 버그 (누락 버그)
- 전역 `Footer`(`src/components/ui/Footer.tsx:10`)는 `pathname === '/'`(홈)만 배제하고
  `/drops`는 배제 목록에서 빠져 있다.
- `/drops`는 `DropsClient.tsx:230`에서 `fixed inset-0`로 문서 흐름을 완전히 이탈한 풀스크린
  구조(노치·홈 인디케이터까지 채우는 풀블리드 지도, 2026-07-29 `1d7a8d55` 커밋에서 도입)다.
- 레이아웃(`(main)/layout.tsx:44-59`)의 sticky-footer 트릭은 `children` 래퍼에
  `min-h-dvh`를 강제해 콘텐츠가 짧아도 Footer가 뷰포트 아래로 밀려나게 하는 구조인데, 이
  트릭은 "children이 fixed로 이탈할 수 있다"는 케이스를 고려하지 않았다. `/drops`의 콘텐츠는
  `fixed`라 실제 높이가 0인데도 `min-h-dvh` 래퍼가 강제로 뷰포트 1개 높이를 차지하고 그 뒤에
  Footer가 붙어, `main`(`overflow-y-auto`)의 스크롤 가능 높이가 `100dvh + Footer 높이`가
  된다. 지도는 `fixed`라 화면에 고정된 채 안 움직이지만, `main`을 스크롤하면 문서 흐름에
  얹힌 Footer만 탭바 위로 끌려 올라와 보인다.
- Footer 컴포넌트가 2026-07-30(`a4717b3e`)에 처음 추가될 때도, 이후 두 차례 수정
  (2026-08-25, `cbe4e65e`/`c1f2a8fb`, 티켓 `20260825_006`·`007`)에서도 `/drops`의 `fixed`
  풀스크린 케이스는 한 번도 고려되지 않았다 — 의도된 설계가 아니라 레이어링 누락.

### 2. TopNav 부재 (기존에는 의도된 설계였으나 이번 요청으로 변경)
- `/drops`가 TopNav를 렌더링하지 않는 것은 `1d7a8d55`(2026-07-29) 커밋에서 노치·홈
  인디케이터까지 채우는 완전 풀블리드 지도를 만들기 위한 **의도적 결정**이었고,
  `TopNav.tsx:44,80`의 코드 주석과 `Service Plan/Specs/PRD/2026-08-15
  DESIGN_RENEWAL_SPEC.md:353`("그 화면(`/drops`)에는 TopNav가 없음")에 명시적으로
  문서화돼 있다.
- 사용자 확인 결과, 이 기존 설계 결정을 뒤집고 **TopNav를 추가하기로 결정**했다(풀스크린
  지도 상단 일부가 TopNav에 가려지는 트레이드오프 감수). 완료 후 PRD 문서의 해당 서술을
  갱신해야 한다.

## 상세 요구사항

### 서비스/코드베이스 관점
1. `src/components/ui/Footer.tsx`의 배제 조건에 `/drops`를 추가한다. 근본적으로는
   "`fixed inset-0`로 풀스크린 이탈하는 다른 화면이 향후 생길 수 있다"는 점을 고려해, 경로
   하드코딩보다 더 견고한 방식(예: 레이아웃에서 pathname 기반으로 Footer 자체를 조건부
   렌더링, 또는 라우트 그룹 분리)이 적절한지 구현 시점에 판단한다. 단 이번 범위는 `/drops`
   버그 수정이 목적이므로 과도한 리팩토링은 지양한다.
2. `DropsClient.tsx`에 다른 탭 최상위 페이지(`page.tsx`, `BadgesClient.tsx`,
   `MissionsListClient.tsx`, `inventory/page.tsx`)와 동일한 패턴으로
   `<TopNav logo .../>`를 추가한다.
3. TopNav 추가로 지도 컨테이너 상단이 가려지는 만큼, 지도 초기 위치·POI 마커·현재 위치
   버튼 등 기존 UI 요소가 TopNav와 겹치지 않는지 확인하고 필요 시 지도 영역의 top 오프셋을
   조정한다. `Service Plan/Specs/PRD/2026-08-15 DESIGN_RENEWAL_SPEC.md`의 z-index 레이어
   체계·"기하값은 실측한다" 절을 참고해 임의 추정값을 쓰지 않는다.
4. 완료 후 `2026-08-15 DESIGN_RENEWAL_SPEC.md:353`의 "그 화면(`/drops`)에는 TopNav가
   없음" 서술과 `TopNav.tsx:44,80`의 관련 주석을 실제 상태에 맞게 갱신한다(`/jam-docs` 규칙에
   따라 PRD는 덮어쓰기).

### UI/UX 관점 (해당 시)
- TopNav 재사용 판정: 신규 컴포넌트 생성 없이 기존 `src/components/ui/TopNav.tsx`를 다른
  최상위 탭 페이지와 동일한 `logo` 모드로 그대로 재사용한다 (MODULAR 연결된 컴포넌트 9종 중
  하나, 이미 서비스 전역에서 쓰이고 있어 별도 탐색·확장 판단 불필요).
- 실기기(아이폰 사파리)에서 Footer가 더 이상 스크롤에 끌려 올라오지 않는지, TopNav가 다른
  탭 페이지와 시각적으로 일관되게 보이는지 확인한다.

## 절대 건드리면 안 되는 것
- 지도 자체의 인터랙션 로직(팬·줌·마커 클릭), POI 팝업/드랍/픽업 플로우
- Footer 컴포넌트의 다른 페이지 노출 로직(홈 배제 조건 등 기존 동작)

## 구현 계획
1. `Footer.tsx` 배제 조건에 `/drops` 추가 → 로컬에서 스크롤 시 Footer가 안 끌려오는지 확인
2. `DropsClient.tsx`에 `TopNav logo` 추가 → 지도 상단 오프셋·기존 UI 요소 겹침 확인
3. PRD 문서(`2026-08-15 DESIGN_RENEWAL_SPEC.md`) 및 `TopNav.tsx` 주석 갱신
4. 로컬 dev 서버에서 두 수정 사항 실기기 뷰포트(375×812 등)로 검증

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
1. `Footer.tsx`의 배제 조건을 `pathname === '/'` 단일 비교에서 `FOOTER_EXCLUDED_PATHS`
   배열(`['/', '/drops']`) 기반으로 바꾸고 `/drops`를 추가했다. `/drops`(`DropsClient.tsx`)가
   `fixed inset-0`로 문서 흐름을 이탈하는 풀스크린 구조라, `(main)/layout.tsx`의
   sticky-footer 트릭(children 래퍼 `min-h-dvh`)이 이를 감안하지 못해 `main`을 스크롤하면
   지도는 고정된 채 Footer만 끌려 올라오던 버그를 해결했다. 경로 하드코딩 배열 이상의
   리팩토링(레이아웃 조건부 렌더링 등)은 이번 범위(`/drops` 버그 수정)를 벗어나 하지 않았고,
   대신 향후 유사 케이스가 생기면 재검토하라는 주석을 남겼다.
2. `DropsClient.tsx`에 다른 최상위 탭 페이지와 동일한 패턴으로 `<TopNav logo
   headerStyle={{ background: 'var(--color-surface)' }} />`를 추가했다(사용자가 기존
   풀블리드 지도 설계 결정을 뒤집기로 확인, 지도 상단 일부가 가려지는 트레이드오프 감수).
   TopNav(`design-system/components/navigation/TopNav.jsx`)는 `position: sticky`+
   `z-index: 30`으로 자체 스태킹 컨텍스트를 만들어, `/drops`의 `fixed`(역시 자체 스태킹
   컨텍스트 생성) 컨테이너 안에서 `z-index: auto`인 지도 레이어보다 항상 위에 그려진다 —
   추가 z-index 조정 불필요함을 로컬에서 실측·확인했다.
3. TopNav 추가로 상단이 가려지는 만큼 겹치는 기존 UI 요소를 확인했다.
   - "현재 위치로 이동" 버튼(`MapView.tsx`)은 하단 앵커라 영향 없음.
   - "주변 탐색 중" 로딩 pill(`top-[calc(env(safe-area-inset-top)+1rem)]`)은 TopNav 도입 전
     기준으로 최상단에 붙어 있어 TopNav 뒤에 가려지므로,
     `top-[calc(env(safe-area-inset-top)+56px+1rem)]`로 내렸다. `56px`는
     `TopNav.jsx`의 헤더 내부 `height: 56` 고정값(코드에 명시된 실측값, `min-h` 추정 아님)이다.
   - POI 마커는 지도 캔버스 상 위치가 유저 팬/줌에 따라 달라져 정적 top 오프셋으로 보정할
     수 없다 — TopNav 아래로 마커가 들어가면 가려지는 것은 사용자가 확인한 트레이드오프의
     일부로 남겨뒀다(별도 조정 없음).
4. `DESIGN_RENEWAL_SPEC.md:353`(z-index 레이어 "기하값 실측" 표)의 "그 화면(`/drops`)에는
   TopNav가 없음" 행과 `TopNav.tsx:44,80`의 관련 주석을 실제 상태(2026-08-31부터 `/drops`도
   TopNav 렌더링)에 맞게 갱신했다. PRD 표는 2026-08-26 당시의 역사적 사례를 보존하되
   현재 상태 변경분을 주석으로 덧붙이는 방식으로 갱신했다(과거 실측 오류 사례 자체를
   지우면 "기하값은 추정하지 말고 실측한다" 규칙의 근거 서술이 사라지므로).

### 변경된 파일
```
jam-web/src/components/ui/Footer.tsx
jam-web/src/app/(main)/drops/DropsClient.tsx
jam-web/src/components/ui/TopNav.tsx
Service Plan/Specs/PRD/2026-08-15 DESIGN_RENEWAL_SPEC.md
```

### 테스트 결과
- [x] 로컬 dev 서버(`npm run dev`) + Playwright(375×812, 개발 전용 테스트 로그인)로
  `/drops` 방문: `<footer>` 요소가 렌더링되지 않음(`missions`·다른 탭 페이지는 그대로 렌더링됨)
  확인. `document.querySelector('main').scrollHeight === clientHeight`(892px로 동일)이고
  `scrollTo(0,300)` 시도 후에도 `scrollTop`이 0으로 유지됨을 확인 — Footer 스크롤 버그 재현 안 됨.
- [x] 같은 뷰포트에서 `/drops`에 TopNav(로고/문의 버튼/동기화 버튼/알림 종/아바타)가 다른
  탭 최상위 페이지와 동일하게 렌더링되는 것을 스크린샷으로 확인. `/api/drops` 응답을
  인위적으로 지연시켜 "주변 탐색 중" pill이 TopNav 아래에 겹치지 않고 표시되는 것을 확인.
  "현재 위치로 이동" 버튼(우하단)도 겹침 없음을 확인.
- [x] `npm run lint` 전체 실행: **0 errors, 26 warnings** — 26건 모두 이번 변경 파일과
  무관한 기존 warning(design-system stories·기존 미사용 import 등)이며 변경 파일
  (Footer.tsx/DropsClient.tsx/TopNav.tsx) 관련 항목 없음.
- [ ] 실기기 아이폰 사파리 확인은 하지 않음(로컬 dev 서버 Chromium 기반 검증만 수행) —
  staging 배포 후 실기기 확인 권장.
- 참고: 로컬 dev 환경에서는 네이버 지도 Open API 인증이 `localhost` 도메인을 허용하지 않아
  지도 타일 자체는 렌더링되지 않았다(회사 API 키의 도메인 화이트리스트 제약, 이번 티켓과 무관한
  기존 로컬 환경 제약). TopNav·Footer 레이어링 검증에는 영향 없음.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 해당 없음 (텍스트 문구 변경 없음, 레이아웃·컴포넌트 배치만 수정)

### 배포 정보
- 배포일: (미배포 — 사용자 승인 후 오케스트레이터가 staging 병합·배포 처리)
- 환경: production
- 커밋: (아래 push한 브랜치 참고, main 병합 전)

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

- TopNav 부재는 원래 의도된 설계(풀블리드 지도)였고 PRD에 문서화돼 있었으나, 사용자가 이
  결정을 뒤집기로 명시적으로 확인해 진행한다 — 완료 후 PRD 갱신 필수.

### 잔여 이슈
-
