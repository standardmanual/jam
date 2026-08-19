---
id: 20260819_007
category: Admin
status: OPEN
created: 2026-08-19
---

# [Admin] 배경 제너레이터 — BadgeForm 통합 (저작 UI + 실제 배지 배경 라이브 미리보기)

## 배경 / 문제 정의
스파이크(티켓 20260819_001~006)로 배경 제너레이터의 파이프라인(이미지 업로드 → 패턴/애니메이션
배타 선택 → 전역 Paper 필터 1종 → 미리보기)을 `/spike/background-generator`에서 검증 완료했다.
이제 이 저작 UI를 실제 어드민 배지 등록/수정 폼(`BadgeForm`)에 반영한다.

**이번 티켓 범위는 저작 UI + 라이브 미리보기까지다.** 최종 결과를 static 이미지/영상으로
굽거나(bake) Supabase Storage에 저장하는 것, `badges` 테이블에 새 값을 반영하는 것은
**이번 범위에서 제외**한다 — 그건 후속 티켓에서 다룬다. 즉 이 화면의 컨트롤은 기존
`BadgeForm`의 저장(submit) 흐름과 **연결하지 않는다.** 기존 `background_color`/
`background_shader_id` 필드와 저장 로직은 건드리지 않고 그대로 둔다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 대상 폼: `jam-web/src/app/admin/badges/BadgeForm.tsx` (FactionForm/ItemBookForm은 이번 범위 아님)
- 스파이크(`jam-web/src/app/spike/background-generator/`)의 다음 로직을 재사용한다 — 새로 만들지
  않는다:
  - `PatternPanel.tsx`/`patternTile.ts` (패턴 모드, 티켓 006까지 반영된 최신 버전 — 그리드 수 없음,
    이미지 크기 절대 px, 430px 기준, 간격이 이미지 크기에 영향 없음)
  - `AnimationPanel.tsx`/`kaleidoscope/engine.ts` (애니메이션 모드)
  - `FilterPreview.tsx` (Paper 필터 5종: fluted glass/image dithering/halftone dots/halftone
    cmyk/lens distortion)
  - `ImageUploader.tsx`, `loadImage.ts`, `types.ts`
  - 정확히 어떤 형태로 가져올지(모듈 그대로 import, 공통 lib로 추출 등)는 구현 시 판단하되,
    로직을 다시 작성하지 말 것.
- **라이브 미리보기는 실제 배지 배경화면을 재사용한다.** 스파이크처럼 독립된 사각 프리뷰 박스가
  아니라, `jam-web/src/lib/badgeBackgroundTheme.ts`의 `getBadgeBackgroundStyle` 및
  `jam-web/src/app/(main)/badges/[id]/BadgeHeroSection.tsx`가 실제 배지 상세화면에서 쓰는 것과
  **동일한 레이아웃 구조·폭(앱 컬럼 `max-w-[430px]`)**을 그대로 재사용해서 미리보기를 구성한다.
  - 컨트롤(이미지 업로드/패턴·애니메이션 옵션/Paper 필터 선택)에서 값이 바뀔 때마다 이 미리보기가
    실시간으로 갱신되어야 한다.
  - 배경색(`background_color`)과 새 쉐이더 합성 결과 둘 다 미리보기에서 확인 가능해야 한다 —
    다만 이번 스코프의 초점은 새 패턴/애니메이션/필터 합성 쪽이다. 기존 배경색 필드와 미리보기가
    서로 어떻게 공존할지(예: 배경색 위에 패턴이 얹히는지, 배경색과 새 배경이 상호 배타적인지)는
    구현 시 화면에 자연스럽게 배치하되, 기존 배경색 저장 로직은 건드리지 않는다.
- **미리보기는 패턴/애니메이션/Paper를 분리하지 말고 하나로 통합한다.** 스파이크는 각 패널이
  독립된 프리뷰 캔버스를 가진 구조였는데(패턴 프리뷰, 애니메이션 프리뷰, 필터 프리뷰가 각각
  따로), 이번엔 **선택된 모드(패턴 또는 애니메이션)의 결과 위에 선택된 Paper 필터가 적용된 최종
  합성 결과 하나만** 실제 배지 배경 레이어 위치에 렌더링한다. 컨트롤 패널(옵션 조작 UI)은 여러
  섹션으로 나뉘어도 되지만, **미리보기 화면은 하나**여야 한다.
- 신규 의존성 추가 금지(스파이크에서 이미 추가한 `@paper-design/shaders-react`만 사용, Three.js
  등 금지).
- 이 화면은 `/admin` 경로 하위이므로 기존 어드민 인증(Google 로그인) 그대로 적용된다 — 스파이크와
  달리 로그인 예외 처리하지 않는다.
- MODULAR 디자인 시스템은 어드민 화면에 적용하지 않는 기존 정책을 따른다(`admin/` 화면 DS 적용
  제외 — 신규 UI를 MODULAR 컴포넌트로 만들 필요 없음).

### UI/UX 관점 (해당 시)
- `BadgeForm` 안에서 기존 배경색 필드(`BackgroundColorField`) 영역 근처에 새 저작 UI를 배치한다.
  정확한 배치/접기(collapse) 여부는 구현 시 자연스럽게 판단.
- 이 UI가 아직 "저장되지 않는 실험적 기능"이라는 걸 사용자(운영자)가 헷갈리지 않게, 저장 버튼이나
  안내 문구 없이 "미리보기 전용"임이 명확히 드러나야 한다 (예: 별도 저장 버튼을 만들지 않는다).

### 컨텐츠 관점 (해당 시)
- 해당 없음

## 구현 계획
1. 스파이크 모듈(패턴/애니메이션/필터 관련 컴포넌트·로직)을 `BadgeForm`에서 재사용 가능한 형태로
   가져온다 (재작성 금지, 이동/재export 위주)
2. `getBadgeBackgroundStyle`/`BadgeHeroSection` 구조를 재사용해 실제 배지 배경과 동일한 미리보기
   컨테이너를 만든다
3. 패턴/애니메이션 배타 선택 → Paper 필터 적용까지의 합성 결과를 이 미리보기 컨테이너 하나에
   실시간 반영
4. `BadgeForm`의 기존 저장/submit 로직과는 분리돼 있음을 확인 (새 컨트롤 값이 저장 payload에
   섞여 들어가지 않는지)
5. Playwright 등으로 이미지 업로드 → 옵션 조정 → 미리보그레이 실시간 갱신되는지 시각 검증하고
   완료 기록에 근거를 남길 것

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `BadgeForm.tsx`(배경색 필드 아래)에 신규 `BackgroundGeneratorPreview` 컴포넌트를 배치했다.
  이미지 업로드 → 패턴/애니메이션 배타 선택 → Paper 필터 1종 적용까지의 컨트롤은 스파이크
  (`PatternPanel`/`AnimationPanel`/`FilterPreview`/`patternTile.ts`/`kaleidoscope/engine.ts`/
  `ImageUploader`/`loadImage.ts`/`types.ts`)를 알고리즘 재작성 없이 그대로 import해 재사용했다.
- 스파이크의 3개 컴포넌트(`PatternPanel`/`AnimationPanel`/`FilterPreview`)는 각자 독립된 프리뷰
  박스/캔버스를 갖고 있었는데, 새 `hidePreviewBox` optional prop(기본값 false, 스파이크 페이지
  기존 동작 100% 유지)을 추가해 그 박스만 숨기고 컨트롤만 노출하도록 최소 구조 변경했다. 실제
  픽셀 생성 로직(타일 합성, 칼레이도스코프 렌더링, Paper 필터별 파라미터/렌더링 분기)은 한 줄도
  다시 쓰지 않았다.
  - `FilterPreview`는 필터별 파라미터 state를 그대로 컴포넌트 내부에 유지한 채, 매 렌더마다
    계산되는 최종 미리보기 노드(previewNode)를 `onPreviewNodeChange` 콜백으로 부모에 그대로
    전달하도록 확장했다 — 렌더링 분기 자체는 완전히 동일, 어디서 그리는지만 부모가 결정.
  - `AnimationPanel`은 필터가 선택된 동안만 스냅샷을 캡처하던 기존 조건에 `alwaysSnapshot`
    optional prop(기본 false)을 추가해, BadgeForm 통합 화면에서는 필터 미선택 상태에서도
    400ms 간격으로 항상 캡처하도록 했다(기존 캡처 로직 자체는 그대로).
- 라이브 미리보기는 `jam-web/src/app/(main)/badges/[id]/BadgeHeroSection.tsx`를 그대로
  import해 사용하고, `jam-web/src/lib/badgeBackgroundTheme.ts`의 `getBadgeBackgroundStyle`을
  재사용해 배지 상세화면의 고정 배경 레이어(`badges/[id]/page.tsx`의 `badgeBackgroundLayer`)와
  동일한 방식(배경 레이어 absolute + Hero `relative z-10`)으로 430px 폭 컨테이너를 구성했다.
  패턴 flatten 결과 또는 애니메이션 스냅샷 위에 Paper 필터가 적용된 최종 합성 결과 하나만
  이 배경 레이어 위치에 렌더링된다(패턴/애니메이션/필터 프리뷰 분리 없음).
- 배경색(`backgroundColor`)은 `getBadgeBackgroundStyle`을 통해 이 배경 레이어의 base
  `backgroundColor`로, 새 합성 결과(패턴/애니메이션+필터)는 그 위에 얹히는 자식 노드로
  배치했다 — "배경색 위에 새 배경이 얹힌다"는 자연스러운 스택 구조.
- `BadgeForm`의 `handleSubmit`/`body` payload는 전혀 건드리지 않았다 — 새 컨트롤의 상태는
  `BackgroundGeneratorPreview` 내부 로컬 state로만 존재하고 상위로 전파되지 않는다. 저장 버튼도
  만들지 않았고, 섹션 상단에 "저작 미리보기 전용 (저장되지 않음)"임을 명시했다.
- 기존 `background_color`/`background_shader_id` 필드 및 저장 로직은 변경하지 않았다.

### 변경된 파일
```
jam-web/src/app/admin/badges/BackgroundGeneratorPreview.tsx (신규)
jam-web/src/app/admin/badges/BadgeForm.tsx
jam-web/src/app/spike/background-generator/PatternPanel.tsx
jam-web/src/app/spike/background-generator/AnimationPanel.tsx
jam-web/src/app/spike/background-generator/FilterPreview.tsx
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 변경/신규 5개 파일 관련 에러 없음(기존 무관 테스트 설정 에러만 존재)
- [x] `npx eslint`(5개 파일) — 에러/경고 없음
- [x] Playwright로 로컬(`next dev`)에서 `/api/dev-login`(NODE_ENV=development 허용 경로) +
  로컬 전용 임시 `ADMIN_EMAILS` 설정으로 어드민 세션을 만들어 `/admin/badges/new` 시각 검증
  (검증 후 `.env.local`은 원상 복구):
  - 대각선 마커가 있는 60×60 테스트 이미지를 배경 제너레이터 섹션에 업로드 → 패턴 모드 컨트롤
    노출 확인, 미리보기 컨테이너 `boundingBox.width === 430` 확인(실제 배지 배경 폭과 동일)
  - 이미지 크기 슬라이더를 86px→40px로 바꾸자 미리보기 타일 밀도가 즉시 변함(5개→10개 표시)을
    스크린샷으로 확인 — 실시간 반영
  - Fluted Glass 필터 선택 → 미리보기가 `<img>`에서 `<canvas>`(Paper 셰이더)로 즉시 전환,
    글래스 왜곡이 적용된 결과가 배지 배경 레이어 위치에 그대로 반영됨을 스크린샷으로 확인
  - 애니메이션 모드로 전환 → 필터가 유지된 채 칼레이도스코프 합성 결과로 미리보기가 바뀜을
    스크린샷으로 확인(필터+모드 전환 조합에서도 미리보기 하나만 존재)
  - 컨트롤 섹션 내부에 체크보드 프리뷰 박스(`repeating-conic-gradient`) 0개, 컨트롤 영역의
    애니메이션 캔버스는 `hidden` 클래스로 숨겨진 채 1개만 존재(마운트는 유지, 시각 노출만 차단)
    — 스파이크의 패턴/애니메이션/필터 프리뷰가 분리되지 않고 미리보기가 하나로 통합됐음을 확인
  - 배경색 필드만 `#ff8800`으로 설정(이미지 미업로드) → 배경 레이어와 Hero 카드가 모두 해당
    색으로 채워짐을 스크린샷으로 확인(기존 `getBadgeBackgroundStyle` 동작 그대로 재사용됨)
  - 검증 스크립트/이미지는 스크래치패드에만 저장, 저장소에는 커밋하지 않음(임시 파일 정리 완료)

### 배포 정보
- 배포일: (아직 미배포 — 사용자 승인 후 오케스트레이터가 staging에 push/배포)
- 환경: staging 전용 (production 배포 금지 — 저장/굽기 미구현 상태이므로 더더욱 프로덕션 부적합)
- 커밋: (아직 커밋 전)

### 주요 의사결정 / 핵심 메모
- "미리보기를 하나로 통합" 요구사항을 만족시키기 위해, 스파이크 3개 컴포넌트에 React 상태
  재설계(리프팅) 대신 **`hidePreviewBox`(박스 렌더링 억제) + 콜백(`onFlattenedChange`/
  `onSnapshotChange`/`onPreviewNodeChange`)** 방식을 택했다. 이미 존재하던 콜백 인터페이스를
  최대한 재사용하고, `FilterPreview`만 새 콜백을 추가했다 — 결과적으로 알고리즘 코드는 1줄도
  다시 쓰지 않고 "어디에 그릴지"만 호출부가 결정하도록 구조를 바꿨다.
- **실제 배지 배경 레이어 재사용 범위 관련 트레이드오프**: `BadgeHeroSection.tsx`는 프로덕션
  공용 컴포넌트라 내부를 수정하지 않고 그대로 import했다. 그 결과 Hero 카드 자체(`aspect-square`,
  `bg-surface-elevated` + 인라인 `backgroundColor`)는 항상 불투명해서, 새 합성 배경은 실제로는
  `badgeBackgroundLayer`에 해당하는 바깥 여백(카드 상하좌우 패딩 영역)에서만 보인다 — 이는
  프로덕션에서 `background_color`가 오늘날 동작하는 방식과 정확히 동일한 특성이다(페이지 전체
  고정 레이어와 Hero 카드가 같은 색을 각각 따로 채워 전체적으로 톤이 맞아 보이는 방식). 배경색을
  설정한 상태에서는 Hero 카드도 동일 색으로 채워져 합성 배경과 시각적으로 자연스럽게 이어진다.
  Hero 카드 내부까지 새 합성 배경을 관통시키려면 `BadgeHeroSection`/`getBadgeBackgroundStyle`
  자체를 확장해야 하는데, 이는 프로덕션 배지 상세화면 렌더링에 영향을 주는 변경이라 "굽기/저장/
  실제 반영은 후속 티켓" 범위 밖으로 판단해 이번 티켓에서는 손대지 않았다.
- 로컬 검증을 위해 `/admin` Google 로그인 우회 경로(`/api/dev-login`, `NODE_ENV=development`
  에서만 활성)와 `.env.local`의 `ADMIN_EMAILS`를 임시로 사용했다 — 검증 후 `.env.local`은
  세션 시작 전 상태로 완전히 복구했다(git에는 애초에 포함되지 않는 파일).

### 잔여 이슈
- 위 "주요 의사결정"에 기록한 대로, 배경색 미설정 시 새 합성 배경이 Hero 카드 내부(아이콘이
  보이는 정사각 카드)까지는 보이지 않고 카드 바깥 여백에서만 보인다. 후속 티켓(굽기/Storage
  저장/실제 반영)에서 `BadgeHeroSection`/`getBadgeBackgroundStyle` 확장 여부를 결정할 때 함께
  재검토가 필요하다.
- GIF 프레임 처리 검증용 `GifFrameTest.tsx`는 이번 티켓의 재사용 대상 목록에 없어 통합하지
  않았다(스파이크에는 남아있음, BadgeForm 통합 화면에는 GIF 프레임 비교 기능 없음).
