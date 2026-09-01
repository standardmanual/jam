---
id: 20260901_1851
category: Infra
status: OPEN
created: 2026-09-01
closed:
---

# [Infra] /spike/background-generator 프로덕션 라우트 접근 차단

## 배경 / 문제 정의
티켓 [20260824_017](20260824_017_Infra_떠돌이신화-기능-전면제거.md)에서 발견: 배경
제너레이터 스파이크 개발 도구(`/spike/background-generator`)가 로그인 없이 프로덕션
빌드 라우트에 그대로 포함돼 있다. 인증 미들웨어의 `publicPaths`가 접두어 오매칭되는
문제를 다룬 티켓([20260827_008](20260827_008_Service_인증미들웨어-publicPaths-접두어오매칭-선제수정.md))과
관련이 있을 수 있으니 함께 확인한다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `/spike/background-generator`가 실제로 인증 없이 접근 가능한지 재확인
- 스파이크(실험) 도구이므로: (a) 프로덕션 빌드에서 아예 제외하거나, (b) 로그인+관리자
  권한 게이트를 추가하거나, (c) 더 이상 필요 없다면 라우트 자체를 삭제 — 셋 중 실제
  사용 현황(배경 제너레이터가 `/admin/background-generator` 등 정식 어드민 기능으로
  이미 흡수됐는지)을 먼저 확인하고 판단

## 구현 계획
- 배경 제너레이터의 정식 어드민 화면 존재 여부 확인 → 스파이크 라우트가 더 이상
  필요 없으면 삭제, 필요하면 접근 제어 추가

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 재확인 결과: `jam-web/src/proxy.ts`의 `publicPaths`에 `/spike`가 그대로 포함돼 있고,
  이는 staging뿐 아니라 **main 브랜치에도 이미 존재**한다(`origin/main` 확인).
  코드 주석(`'/spike'는 검증용 스파이크 프로토타입 전용 경로... 20260819_001, staging 전용,
  main 머지 대상 아님`)과 달리 실제로는 main에 병합돼 있어, 프로덕션 빌드에서도
  `/spike/background-generator`가 로그인 없이 접근 가능한 상태였다(주석과 실제 동작의 모순 —
  아래 alerts 참고).
- 배경 제너레이터의 정식 어드민 화면(`/admin/badges` 내 `BackgroundGeneratorPreview.tsx`,
  `BadgeForm.tsx`에서 사용)이 이미 존재 확인 → (c) 라우트 삭제로 판단.
- 다만 스파이크 폴더 내부에 실서비스 코드가 이미 의존하는 공용 모듈 2개가 섞여 있었다
  (`types.ts`의 `SERVICE_WIDTH` 상수 — 어드민 미리보기 프레임 2곳이 사용, `loadImage.ts`의
  `loadImageFromUrl` — 배지 공유 이미지 생성(`buildBadgeShareBlob.ts`)이 사용). 이 둘을
  `src/lib/backgroundGenerator/`로 이전해 실서비스 의존성을 끊지 않고, 나머지 스파이크
  전용 UI/로직 파일(`page.tsx` 등 8개)은 삭제했다.
- `/spike/background-generator` 라우트 자체(`page.tsx`)가 사라져 해당 경로는 이제 404.
- 이동한 두 파일의 헤더 주석을 "스파이크 전용"에서 "실서비스가 참조하는 공용 모듈"로 갱신.
- `BadgeShareButton.tsx`의 삭제된 파일 경로 참조 주석을 실제 상태에 맞게 수정.
- `/spike/badge-reveal`은 이번 티켓 범위(background-generator) 밖이라 그대로 두었다 —
  아래 alerts에 별도 기록.

### 변경된 파일
```
jam-web/src/app/spike/background-generator/AnimationPanel.tsx (삭제)
jam-web/src/app/spike/background-generator/FilterPreview.tsx (삭제)
jam-web/src/app/spike/background-generator/GifFrameTest.tsx (삭제)
jam-web/src/app/spike/background-generator/ImageUploader.tsx (삭제)
jam-web/src/app/spike/background-generator/PatternPanel.tsx (삭제)
jam-web/src/app/spike/background-generator/kaleidoscope/engine.ts (삭제)
jam-web/src/app/spike/background-generator/page.tsx (삭제)
jam-web/src/app/spike/background-generator/patternTile.ts (삭제)
jam-web/src/app/spike/background-generator/types.ts → jam-web/src/lib/backgroundGenerator/types.ts (이동)
jam-web/src/app/spike/background-generator/loadImage.ts → jam-web/src/lib/backgroundGenerator/loadImage.ts (이동)
jam-web/src/app/admin/badges/BadgeDetailPreviewFrame.tsx (import 경로 수정)
jam-web/src/app/admin/itembooks/ItemBookDetailPreviewFrame.tsx (import 경로 수정)
jam-web/src/app/(main)/badges/[id]/buildBadgeShareBlob.ts (import 경로 수정)
jam-web/src/app/(main)/badges/[id]/BadgeShareButton.tsx (주석 수정)
```

### 테스트 결과
- [x] `npx tsc --noEmit -p tsconfig.json` — 오류 없음
- [x] `npm run lint` (전체) — 0 errors, 13 warnings (전부 `design-system/` 기존 경고, 이번
      변경과 무관, 변경 파일에서 발생한 경고 없음)
- [ ] 실제 배포 후 `/spike/background-generator` 404 확인은 staging 병합 후 필요
      (이 review 브랜치는 아직 staging에 병합되지 않음)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 (사용자 노출 텍스트 변경 없음, 라우트 삭제 및 내부 코드 정리만 수행)

### 배포 정보
- 배포일: (미배포 — staging 병합 후 오케스트레이터가 처리)
- 환경: production
- 커밋: (아래 push 브랜치 참조)

### 주요 의사결정 / 핵심 메모
- **전체 폴더 삭제 대신 부분 이전을 택한 이유**: `/spike/background-generator` 폴더는
  겉보기엔 순수 실험 도구처럼 보이지만, `types.ts`(`SERVICE_WIDTH`)와 `loadImage.ts`
  (`loadImageFromUrl`)는 어드민 미리보기·배지 공유 이미지 생성이라는 실서비스 경로에서
  실제로 import되고 있었다. 폴더를 통째로 지웠다면 빌드가 즉시 깨졌을 것이라 두 파일만
  `src/lib/backgroundGenerator/`로 옮기고 나머지 UI 전용 파일(8개)만 삭제했다.
- **`types.ts`의 미사용 export(`Mode`, `PatternParams`, `AnimationParams`, `FilterId` 등)를
  트리밍하지 않은 이유**: 이번 티켓 범위는 "프로덕션 접근 차단"이지 리팩터링이 아니다.
  실서비스가 쓰는 `SERVICE_WIDTH`만 살리고 나머지 타입 정의를 지우는 것은 스코프 밖의
  판단이 개입될 수 있어(향후 재사용 가능성 등) 보수적으로 파일 전체를 그대로 옮겼다.
- **`/spike/badge-reveal`을 함께 정리하지 않은 이유**: 티켓 요구사항이
  `/spike/background-generator`로 명시돼 있어 범위를 벗어나지 않기 위해 그대로 두었다.
  다만 같은 `/spike` publicPath 문제를 공유하므로 alerts에 별도 기록.

### 잔여 이슈
- `/spike/badge-reveal`도 동일한 `/spike` publicPath 노출 구조를 공유한다 (alerts 참고, 이번
  티켓 범위 밖).
- `proxy.ts`의 `/spike` 주석("staging 전용, main 머지 대상 아님")이 실제 코드 상태와
  어긋난다 (alerts 참고).
