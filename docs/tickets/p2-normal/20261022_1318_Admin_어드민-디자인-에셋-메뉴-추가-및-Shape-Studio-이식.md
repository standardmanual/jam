---
id: "20261022_1318"
category: Admin
priority: P2
status: OPEN
created: 2026-10-22
closed:
---

# [Admin] 어드민 디자인 묶음에 「에셋」 메뉴 추가 및 Shape Studio v2 이식

## 핵심 요약

- 요구사항: 어드민 사이드바 "디자인" 묶음(`NAV_GROUPS`의 `design`) 하위에 `에셋`(`href: '/admin/assets'`) 메뉴를 추가하고, Muse로 제작한 스탠드얼론 셰이더 웹페이지(`docs/assets/prototypes/20261022_shape-studio.html`, Shape Studio v2)의 UI 배치·기능 설계·WebGL 세그먼트 그라데이션 셰이더 엔진 전체를 어드민 shadcn 컴포넌트(`jam-web/src/components/admin/ui/`) 기반으로 이식한다.
- 구현 계획:
  1. `jam-web/src/components/admin/adminNavItems.ts`의 `design` 그룹(98~105줄)에 `{ href: '/admin/assets', label: '에셋', icon: IconShape }` 항목을 추가하고 `jam-web/src/components/admin/__tests__/adminNavItems.test.ts`(81~92줄)를 갱신한다.
  2. `jam-web/src/app/admin/assets/shapeStudioConfig.ts`에 `20261022_shape-studio.html` 125~368줄·484~578줄의 상수(`REF=640`, `GT=512`, `GRANGE=128`, `VIDEO_SEC=15`), 프리셋(`SHAPE_PRESETS` 2종, `GLYPH_PRESETS` 4종, `GRADIENT_PRESETS` 14종), GLSL 셰이더(`VERTEX_SHADER`, `FRAGMENT_SHADER`), 유클리드 거리장(`edt`, `buildGlyphSdf`), 기하 계산(`computeGeometry`), 썸네일 렌더(`drawPresetThumb`), 무작위 생성(`randomizeState`), JSON 설정 검증(`validatePresetState`)을 순수 모듈로 분리한다.
  3. `jam-web/src/app/admin/assets/ShapeStudioViewport.tsx`에 왼쪽 작업 영역(상단 `PREVIEW · 비율 · 해상도` 바, 중앙 체크보드 스테이지 및 WebGL 캔버스·ResizeObserver·PNG/SVG 드래그앤드롭, 하단 단축키 안내 및 `되돌리기`·`설정 저장`·`불러오기` 버튼, 고해상도 PNG 내보내기 및 15초 MediaRecorder 동영상 녹화 핸들)을 구현한다.
  4. `jam-web/src/app/admin/assets/ShapeStudioPanel.tsx`에 오른쪽 352px 설정 패널(`Shape Generator` 헤더 + `Segments + Metaball` 배지, ① `Shape` 형태 프리셋 3열 그리드·PNG/SVG 쉐입 추가, ② 랜덤 생성 버튼·항목별 체크박스 토글, ③ `Canvas` 비율 1:1/4:5/16:9 선택, ④ `Segments` 개수 2/3/4·전체 너비·세그먼트별 Height/Top R/Bottom R/Width 카드, ⑤ `Blend` Metaball merge·합치는 강도·겹침·윤곽 번짐·크기·회전·유기적 변형, ⑥ `Motion` 모션 재생 Switch·속도, ⑦ `Gradient` 14종 팔레트 그리드·6색 피커·흐름 방향·컬러 반복·컬러 이동·색 선명도·메탈릭 질감·형태 따라 휘기·가장자리 빛, ⑧ `Background` 배경 방식 Select·배경 A/B 컬러·배경 각도·그레인, ⑨ `Export` PNG 크기 Select + 저장 버튼·동영상 크기 Select + 15초 저장/취소 버튼)을 `components/admin/ui/`의 `Button`·`Badge`·`Checkbox`·`Switch`·`Select`·`Input`으로 구성한다.
  5. `jam-web/src/app/admin/assets/page.tsx`에 상단 바(`Shape Studio` 브랜드 헤더, 실시간 렌더링 상태 표시, `초기화`·`랜덤 생성`·`PNG 저장` 버튼), 2단 레이아웃(`ShapeStudioViewport` + `ShapeStudioPanel`), 히스토리 스택(최대 50단계 되돌리기), 키보드 단축키(`Space` 랜덤, `⌘/Ctrl+Z` 되돌리기), 커스텀 쉐입 업로드(최대 6개 유지), JSON 프리셋 파일 저장/불러오기를 연결한다.
  6. `jam-web/src/app/admin/assets/__tests__/shapeStudioConfig.test.ts`에 초기 상태·기하 계산·EDT 거리장·랜덤 토글·JSON 설정 검증 단위 테스트를 작성한다.
- 관련 파일:
  - `jam-web/src/components/admin/adminNavItems.ts` (`NAV_GROUPS` 내 `design` 그룹, 98~105줄)
  - `jam-web/src/components/admin/__tests__/adminNavItems.test.ts` (`NAV_GROUPS` 테스트, 81~92줄)
  - `jam-web/src/app/admin/assets/shapeStudioConfig.ts` (신규 — 셰이더·프리셋·기하·거리장·검증 유틸)
  - `jam-web/src/app/admin/assets/ShapeStudioViewport.tsx` (신규 — WebGL 캔버스 스테이지·내보내기·하단 바)
  - `jam-web/src/app/admin/assets/ShapeStudioPanel.tsx` (신규 — shadcn 기반 우측 컨트롤 패널 9개 섹션)
  - `jam-web/src/app/admin/assets/page.tsx` (신규 — 상단 바·레이아웃·상태·단축키·파일 입출력)
  - `jam-web/src/app/admin/assets/__tests__/shapeStudioConfig.test.ts` (신규 — 설정·기하·검증 단위 테스트)
  - 원본 프로토타입: `docs/assets/prototypes/20261022_shape-studio.html`

## 배경 / 문제 정의

Muse로 제작한 스탠드얼론 셰이더 웹페이지(`shape-studio.html`, Shape Studio v2 — Segment Gradient Generator)를 어드민의 `디자인 > 에셋` 메뉴(`/admin/assets`)에서 바로 사용할 수 있도록 통합한다. 이때 UI 부품은 어드민 표준 shadcn 컴포넌트(`jam-web/src/components/admin/ui/`)를 사용하되, 원본 파일의 UI 설계·섹션 배치·기능 구성을 그대로 유지한다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 어드민 좌측 네비게이션(`adminNavItems.ts`)의 `디자인`(`design`) 그룹에 `{ href: '/admin/assets', label: '에셋', icon: IconShape }`를 추가한다.
- 어드민 권한 게이트는 `jam-web/src/app/admin/layout.tsx`의 `hasAdminAccess`를 그대로 상속한다.
- 원본 `20261022_shape-studio.html`의 모든 수치 범위·초깃값·셰이더 유니폼·거리장(EDT) 생성·PNG/SVG 알파 및 배경색 자동 판별 마스크 추출·고해상도 PNG 출력(1024/2048/4096px)·15초 동영상 녹화(720/1080/1440px, MediaRecorder)·JSON 설정 저장/불러오기(`version: 2` 스키마 검증)가 동일하게 동작한다.

### UI/UX 관점
- 원본의 상단 헤더 바(`Shape Studio · Segment gradient generator · v2`, 실시간 렌더링 상태 표시, `초기화`, `랜덤 생성`, `PNG 저장`) + 좌측 프리뷰 워크스페이스(상단 `PREVIEW · 비율 · 크기`, 중앙 투명 체크보드 캔버스 스테이지, 하단 `Space`/`⌘/Ctrl Z` 단축키 힌트 및 `되돌리기`·`설정 저장`·`불러오기`) + 우측 352px 스크롤 설정 패널(9개 섹션: `Shape`, 랜덤 토글, `Canvas`, `Segments`, `Blend`, `Motion`, `Gradient`, `Background`, `Export`)의 레이아웃과 배치를 그대로 유지한다.
- 컨트롤 요소는 네이티브 폼 대신 `jam-web/src/components/admin/ui/`의 `Button`, `Badge`, `Checkbox`, `Switch`, `Select`, `Input`과 `sonner` 토스트(`toast`)를 사용한다.

## 구현 계획

| 파일 | 작업 내용 |
|---|---|
| `jam-web/src/components/admin/adminNavItems.ts` | `design` 그룹에 `{ href: '/admin/assets', label: '에셋', icon: IconShape }` 추가 |
| `jam-web/src/components/admin/__tests__/adminNavItems.test.ts` | 디자인 그룹 href 목록 기대값에 `'/admin/assets'` 반영 |
| `jam-web/src/app/admin/assets/shapeStudioConfig.ts` | 상수, 프리셋(Shape 2종·Glyph 4종·Gradient 14종), GLSL 셰이더, EDT 거리장, 기하 계산, 썸네일 드로잉, 랜덤 생성, JSON 설정 검증 함수 구현 |
| `jam-web/src/app/admin/assets/ShapeStudioViewport.tsx` | WebGL 렌더링 루프, ResizeObserver 스테이지 리사이즈, 드래그앤드롭 파일 업로드, PNG/동영상 내보내기 핸들, 하단 액션 바 구현 |
| `jam-web/src/app/admin/assets/ShapeStudioPanel.tsx` | 원본 9개 섹션 구조 그대로 shadcn 컴포넌트(`Button`, `Badge`, `Checkbox`, `Switch`, `Select`, `Input`) 기반 설정 패널 구현 |
| `jam-web/src/app/admin/assets/page.tsx` | 상단 바 + 좌우 2단 레이아웃 + 상태·히스토리(50단계)·단축키(`Space`, `⌘/Ctrl+Z`)·커스텀 PNG/SVG 쉐입 추가 연결 |
| `jam-web/src/app/admin/assets/__tests__/shapeStudioConfig.test.ts` | 초깃값, 기하 계산, EDT, 랜덤 생성, JSON 프리셋 검증 단위 테스트 |

### 완료 조건

### 구현 범위 (게이트 판정 대상)
- 어드민 `디자인` 그룹에서 `에셋 제너레이터` 메뉴를 제거하고 `에셋`(`href: '/admin/assets'`) 메뉴만 남기며 `adminNavItems.test.ts`가 통과한다.
- `에셋`(`/admin/assets`) 화면 안에서 **Shape (WebGL)** 모드와 **Ribbon (2D 곡선)** 모드를 전환해 각 프로퍼티를 조정할 수 있고(리본 모드에서 마스터 시드 입력/불러오기 UI는 제외), 이미지·텍스트 오버레이 레이어(`LayerSidebar`, `ImageLayerFields`, `TextLayerFields`)와 콘텐츠 바로 적용(`ApplyTab`), 고해상도 PNG/동영상 내보내기가 두 모드 모두에서 정상 동작한다.
- 프리셋 저장/불러오기는 로컬 JSON 파일 기능을 제거하고 서버 DB 프리셋(`PresetPanel`)으로 통합된다.
- `Mushroom`, `Hourglass` 형태 프리셋 및 세그먼트 배치에서 위·아래 세그먼트가 떨어져 보이지 않고 간격 없이 밀착해 붙도록 연결된다.
- `shapeStudioConfig.test.ts` 단위 테스트 및 `scripts/verify.sh` 전항목(lint·typecheck·test·ds:check·slop)이 통과한다.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤)
- 로컬 실렌더(`DEV_PROCESS_GUARDRAILS.md` 패턴 13)로 `/admin/assets` 화면 진입, WebGL 셰이더 실시간 렌더링, 프리셋 전환 및 슬라이더 조작 시 콘솔/서버 오류 0건 확인.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 어드민 사이드바 `디자인`(`design`) 그룹에서 `에셋 제너레이터` 메뉴를 제거하고 `에셋`(`href: '/admin/assets'`, `IconShape`) 메뉴로 단일화했으며 `adminNavItems.test.ts` 단위 테스트를 갱신했다.
- `에셋`(`/admin/assets`) 화면의 상단 헤더 바 + 좌측 프리뷰 워크스페이스 + 우측 352px 스크롤 설정 패널 구조 안에서 **Shape (WebGL 세그먼트·메타볼·글자 SDF)** 모드와 **Ribbon (2D 곡선 이동 엔진·마스터 시드)** 모드를 전환해 각 프로퍼티를 조정할 수 있도록 통합했다.
- 이미지·텍스트 오버레이 레이어(`LayerSidebar`, `ImageLayerFields`, `TextLayerFields`)를 Shape 모드와 Ribbon 모드 양쪽 모두에서 동일하게 합성·내보내기(고해상도 PNG, 15초 동영상)할 수 있도록 `ShapeStudioViewport`를 통합했다.
- 우측 패널 상단에 `제작` / `콘텐츠 적용` 화면 전환을 두고 기존 `ApplyTab`을 연결해 두 모드로 제작한 에셋 모두 배지·미션·컬렉션·홈피드 카드 대표 이미지로 바로 반영할 수 있게 했으며, 프리셋 저장·불러오기는 로컬 JSON 기능을 제거하고 서버 DB 프리셋(`PresetPanel`)으로 일원화했다.
- `Mushroom`, `Hourglass` 형태 프리셋의 `overlap: 28`, `merge: 36` 조정을 통해 상하 세그먼트가 간격 없이 밀착되도록 보완하고, 커스텀 쉐입 상태 관리 및 WebGL 리소스 해제를 보강했다.

### 변경된 파일
```
- jam-web/src/components/admin/adminNavItems.ts
- jam-web/src/components/admin/__tests__/adminNavItems.test.ts
- jam-web/src/app/admin/assets/shapeStudioConfig.ts
- jam-web/src/app/admin/assets/ShapeStudioViewport.tsx
- jam-web/src/app/admin/assets/ShapeStudioPanel.tsx
- jam-web/src/app/admin/assets/page.tsx
- jam-web/src/app/admin/assets/__tests__/shapeStudioConfig.test.ts
- docs/assets/prototypes/20261022_shape-studio.html
```

### 테스트 결과
- [x] `scripts/verify.sh` 전항목 통과 (`lint` · `typecheck` · `test` · `ds:check` · `asset-bundle` · `slop` · `scripts-test` · `contract` · `team-doc` · `team-map` · `scheduled-jobs` · `home-feed-doc` · `skills` · `client-server-imports`)
- [x] 민지(`jam-reviewer`) 게이트 리뷰 **PASS** (`9a946a481..bf8fc3483`)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/service/writing/UX_WRITING_GUIDELINE.md` 참조

- [x] 용어 일관성: 고정 용어만 사용 (어드민 내부 도구 UI, 원본 프로토타입 라벨 유지)
- [x] 톤앤매너: 상황에 맞는 톤
- [x] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [x] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [x] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 2026-10-22
- 환경: staging
- 커밋: bf8fc3483

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | 아현 (jam-developer) | - | - | 33m | - |
| 2 | 민지 (jam-reviewer) | - | - | 8m | - |
| 합계 | 2회 | - | - | 41m | - |

### 주요 의사결정 / 핵심 메모
- 작업 유형 `admin`(라이트 파이프라인: 아현 구현 → 민지 게이트 리뷰, MODULAR 적용 제외로 채원①·② 생략).
- 규모 사전 판정: 신규 화면 파일 5개 + 수정 2개 + 프로토타입 보관 1개로 `stop-conditions.md`의 `plan_only` 임계값을 넘기므로, 카리나가 파일 단위 구현 계획을 티켓에 확정하고 첫 호출부터 `planOnlyWaiver`를 부여했다.
- 에셋 제너레이터 통합 시 `src/lib/asset-generator/renderPreset.ts` 및 `src/lib/admin/opsInbox/imageRender.client.ts`(테스트 포함)가 참조하는 `src/app/admin/asset-generator/` 하위 모듈은 유지하고 `/admin/assets`에서 재사용했다.

### 잔여 이슈
- 없음
