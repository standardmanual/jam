---
id: 20260905_2038
category: UI
status: OPEN
created: 2026-09-05
closed:
---

# [UI] MODULAR 3종 컴포넌트 prompt.md — API 갱신 누락 수정

## 배경 / 문제 정의

티켓 20260901_1926(MODULAR 5종 컴포넌트 API 서비스기준 재정렬, staging에 이미 머지됨)의
게이트 리뷰에서 발견한 범위 밖 이슈다. 해당 티켓은 `.d.ts`·`.jsx`·`.stories.tsx`를 새 API로
갱신했지만, 대응 `.prompt.md` 3개는 손대지 않아 옛 API를 예시로 계속 보여준다.

과거 유사 티켓(20260815_023, 20260824_010, 20260901_1521)에서는 API 변경 시 prompt.md를
함께 갱신해온 관행이 있었는데 이번엔 빠졌다. `/jam-design`의 "탐색 → 재사용" 절차는
prompt.md를 1차 참고자료로 쓰므로, 방치하면 실제와 다른 API를 기대하게 만드는 문제가
티켓 20260901_1926이 지적한 것과 정확히 같은 지점에서 재발한다.

### 컴포넌트별 어긋난 지점 (origin/staging 기준 실측)

- **TopNav** (`jam-web/design-system/components/navigation/TopNav.prompt.md`)
  - 예시가 `logoSlot={<JamLogo />}` `avatarSlot={<ProfileAvatarLink />}`를 쓰는데, 실제
    `.d.ts`엔 이미 없다. 현재 API는 `logo`(logoSlot 대체) + `rightSlot`에 아바타까지
    합성하는 방식이다.
  - `style` prop도 `headerStyle`로 이름이 바뀌었는데 문서는 아직 `style`을 언급.
  - `centerSlot`은 유지되지만 "서비스 TopNavProps에는 노출되지 않는 내부 전용 슬롯"이라는
    현재 주석 내용이 문서에 없다.
- **TabBar** (`jam-web/design-system/components/navigation/TabBar.prompt.md`)
  - 신규 prop `username`(로그인 유저의 pathname/프로필 맥락 판정용, 컴포넌트는
    `data-username` 속성으로만 반영)에 대한 설명이 없다.
- **BadgeGridCard** (`jam-web/design-system/components/patterns/BadgeGridCard.prompt.md`)
  - 신규 prop `highlighted`(컬렉션 슬롯 장착 모드의 "지금 넣을 수 있는 칸" 강조 링,
    `selected`의 배경톤 채움과는 다른 시각)와 `onNavigate`(href 모드에서 Link 이동 직전
    부수효과용 클릭 핸들러)에 대한 설명이 없다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 문서만 갱신한다 — `.d.ts`/`.jsx`/`.stories.tsx`는 20260901_1926에서 이미 올바르게
  갱신됐으므로 **코드 변경 없음**. 실제 API는 각 컴포넌트의 `.d.ts`·`.stories.tsx`(같은
  디렉토리)를 소스 오브 트루스로 삼아 대조한다.
- 3개 prompt.md 각각 위 "어긋난 지점"을 실제 `.d.ts`/`.stories.tsx`와 일치하도록 고친다.
  - TopNav: `logoSlot`/`avatarSlot`/`style` 예시를 `logo`/`rightSlot` 합성/`headerStyle`로
    교체. 20260824_010 절의 3분할 예시 코드블록도 새 API로 다시 쓴다.
  - TabBar: `username` prop 설명 추가 (역할·data-username 반영 방식).
  - BadgeGridCard: `highlighted`·`onNavigate` prop 설명 추가.
- 기존 문서의 다른 부분(back-label 결정 정책, 병존 구현 관련 각주 등)은 유지한다 — 이번
  범위는 API 예시 동기화에 한정.

## 1.6 모듈러-서비스 연결 범위

이 티켓은 `.prompt.md`(MODULAR 문서 자산)만 고치며 실제 컴포넌트 코드는 건드리지 않는다.
따라서 세 컴포넌트가 "연결된 컴포넌트"(TopNav)든 "병존 구현"(TabBar·BadgeGridCard)이든
서비스 쪽 파일(`src/components/ui/*.tsx`)에 반영할 내용이 없다 — 문서만 실제 코드와
맞추는 작업.

## 재사용 판정 (1.5)

신규 UI를 만드는 작업이 아니라 기존 3개 MODULAR 컴포넌트의 문서를 최신 API에 맞게
동기화하는 작업이므로 재사용/신규 판정은 해당 없음.

## 구현 계획

컴포넌트당 독립적이므로 하나씩 처리:
1. TopNav.prompt.md — logo/rightSlot/headerStyle로 예시 교체
2. TabBar.prompt.md — username 설명 추가
3. BadgeGridCard.prompt.md — highlighted·onNavigate 설명 추가

각 파일 수정 후 대응 `.d.ts`·`.stories.tsx`와 다시 대조해 누락이 없는지 확인한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
티켓에 정리된 3개 컴포넌트의 어긋난 지점을 각 `.d.ts`/`.stories.tsx`(같은 디렉토리) 기준으로
대조해 `.prompt.md`만 갱신했다. 코드(`.d.ts`/`.jsx`/`.stories.tsx`)는 손대지 않았다.

- **TopNav**: 20260824_010 절의 3분할 예시를 `logoSlot`/`avatarSlot` → `logo`/`rightSlot` 합성으로
  교체하고, 우측 액션+아바타 공존 예시(share 버튼 + 아바타)를 추가. `centerSlot`이 서비스
  `TopNavProps`에는 노출되지 않는 내부 전용 슬롯이라는 설명 추가. `headerStyle`(구 `style`)
  prop 설명과 예시 코드 추가.
- **TabBar**: `username` prop(서비스 pathname/searchParams 판정용, `data-username`으로만 반영)
  설명과 예시 추가.
- **BadgeGridCard**: `highlighted`(컬렉션 슬롯 장착 모드 강조 링, `selected`와 시각적으로 구분)와
  `onNavigate`(href 모드 전용, Link 이동 직전 부수효과) prop 설명과 예시 추가.

기존 back-label 결정 정책, 병존 구현 각주 등 다른 부분은 그대로 유지했다.

### 변경된 파일
```
jam-web/design-system/components/navigation/TopNav.prompt.md
jam-web/design-system/components/navigation/TabBar.prompt.md
jam-web/design-system/components/patterns/BadgeGridCard.prompt.md
```

### 테스트 결과
- [x] 3개 파일 모두 각 `.d.ts`/`.stories.tsx`와 재대조해 누락 없음을 확인
- [x] `cd jam-web && npm run lint` 전체 실행 — 0 errors, 13 warnings(전부 기존 파일의
  사전 존재 경고, 이번 변경 파일과 무관 — `.prompt.md`는 lint 대상이 아님)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 — 내부 개발 문서(prompt.md)만 변경, 사용자 노출 텍스트 없음.

### 배포 정보
- 배포일: (미배포 — review 브랜치 push까지만 수행, 병합·배포는 오케스트레이터 승인 후)
- 환경: -
- 커밋: (아래 push 이력 참고)

### 주요 의사결정 / 핵심 메모
- 티켓 배경절이 "`style`이 `headerStyle`로 바뀌었는데 문서가 아직 `style`을 언급한다"고
  적었지만, 실측 결과 기존 prompt.md에는 `style`/`headerStyle` 언급 자체가 전혀 없었다
  (제거된 것이 아니라 애초에 문서화 안 됨). 실제 갭은 동일하므로 `headerStyle` 설명·예시를
  새로 추가하는 것으로 처리했다.

### 잔여 이슈
-
