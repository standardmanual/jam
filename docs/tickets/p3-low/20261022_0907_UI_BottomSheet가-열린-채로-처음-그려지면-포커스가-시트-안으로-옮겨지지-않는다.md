---
id: "20261022_0907"
category: UI
priority: P3
status: OPEN
created: 2026-10-22
parent: "20261021_1249"
---

# [UI] BottomSheet가 열린 채로 처음 그려지면 포커스가 시트 안으로 옮겨지지 않는다

## 핵심 요약

- 요구사항: 서비스 `BottomSheet`(`src/components/ui/BottomSheet.tsx`)는 열릴 때 첫 포커스 가능한 요소로 포커스를 옮기고 Tab을 시트 안에 가두는 효과(`useEffect`, 의존성 `[open]`)를 둔다. 그런데 시트가 «열린 상태로 처음 그려지는» 경우에는 이 효과가 시트 DOM이 붙기 전에 한 번만 돌아 아무 일도 하지 못한다(`mounted` 게이트가 하이드레이션 뒤에야 참이 되어 그때는 `sheetRef.current`가 비어 있다, 코드 읽기로 세운 추정이다). 그 결과 포커스가 시트 뒤 페이지에 남고 Tab이 시트 밖 요소로 간다. 시트 열림과 `mounted`가 모두 바뀐 뒤에도 포커스가 시트 안으로 가도록 고친다.
- 구현 계획: ① 효과 의존성에 `mounted`를 더해 시트 DOM이 붙은 뒤에도 `focusFirst()`와 키 처리기가 설치되게 한다(`previouslyFocused` 복원 동작이 두 번 설치돼 어긋나지 않는지 확인한다). ② URL 파라미터로 열리는 시트(`StravaDuplicateSheet`)와 처음부터 `open`인 시트의 키보드 흐름(첫 포커스, Tab 순서, Escape)을 시험으로 고정한다. 시험 환경은 jsdom이 없어(`vitest` `environment: 'node'`) 순수 로직 분리나 정적 렌더로는 한계가 있으므로, 효과의 조건 부분을 함수로 빼서 시험하거나 로컬 실측을 기록한다. ③ BottomSheet는 서비스 전체가 쓰므로 고친 뒤 대표 시트(탈퇴 시트, 연결 끊기 시트, 인벤토리 시트)를 로컬에서 키보드로 확인한다.
- 관련 파일: `jam-web/src/components/ui/BottomSheet.tsx` 150~245줄(마운트 게이트 `useSyncExternalStore`, 포커스 효과), `jam-web/src/components/strava/StravaDuplicateSheet.tsx`(URL로 열림), 영향이 큰 공용 파일이라 MODULAR 쌍(`design-system/components/navigation/BottomSheet.jsx`)과 쌍 시험(`bottomSheetFaces.test.tsx`)도 확인한다.

## 배경 / 문제 정의

6-3 4회 머지 뒤 로컬 확인에서 발견했다. 360×640과 390×844에서 `?strava=duplicate`로 중복 안내 시트를 열어 보니 시트의 «취소»가 아니라 시트 뒤 페이지에 포커스가 있고(`document.activeElement`가 헤더 영역), Tab을 누르면 시트 밖 링크로 이동했다. 처음부터 `open`인 연결 끊기 시트 보기(임시 페이지)도 같았다. 이 동작은 4회가 만든 것이 아니라 기존 `BottomSheet`의 성질이며, 채원 판정의 «열릴 때 포커스가 취소에 있다» 기준이 URL로 열리는 경로에서는 충족되지 않는다. 클릭으로 열리는 시트(탈퇴 시트 등)는 시트 DOM이 이미 있는 상태에서 `open`이 바뀌므로 이 문제가 없을 것으로 보이나 확인하지 않았다.

발견: 2026-10-22 티켓 20261021_1249 4회 머지 뒤 로컬 확인.

## 상세 요구사항

### UI/UX 관점

- 시트가 열리면 키보드 사용자와 화면 낭독기 사용자가 시트 안에서 시작한다. 새 토큰과 새 컴포넌트는 만들지 않는다.

## 완료 조건

- [ ] URL 파라미터로 열린 중복 안내 시트에서 첫 포커스가 «취소»에 있고 Tab 순서가 취소, 그래도 연결하기다(로컬 실측)
- [ ] 클릭으로 열리는 시트의 동작이 그대로다

## 진행 기록

## 잔여 이슈
