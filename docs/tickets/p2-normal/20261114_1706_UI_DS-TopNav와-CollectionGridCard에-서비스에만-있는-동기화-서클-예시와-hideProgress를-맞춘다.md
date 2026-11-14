---
id: "20261114_1706"
category: UI
priority: P2
status: CLOSED
created: 2026-11-14
closed: 2026-11-14
---

# [UI] DS TopNav와 CollectionGridCard에 서비스에만 있는 동기화 서클 예시와 hideProgress를 맞춘다

## 핵심 요약

- 요구사항: 오늘(2026-11-14) 세션 DS 정합성 검토에서 DS 원본과 서비스 사본이 어긋난 두 곳을 DS 쪽에 맞춘다. ① DS `TopNav`에 «동기화 아이콘 서클을 rightSlot에 두는» 예시(Story와 prompt)를 더한다. ② DS `CollectionGridCard`에 서비스에만 있는 `hideProgress` prop을 옮긴다. 서비스 코드는 바꾸지 않는다.
- 구현 계획:
  - ① DS `TopNav`는 슬롯만 가진 껍데기이고 동기화는 도메인 결합이라 서비스 래퍼가 `centerSlot`·`rightSlot`을 채운다(`TopNav.d.ts` 주석). 그래서 DS에 `syncStyle`을 만들지 않는다. 서비스가 홈만 글자 알약(`centerSlot`), 나머지는 종 왼쪽 아이콘 서클(`rightSlot`)을 쓰는 두 가지 배치를 Story와 prompt 예시로만 남긴다. 서클 규격은 44×44 터치 영역 안 36px 면(`--border`)·16px 아이콘, 종·아바타와 같은 규격이다.
  - ② `CollectionGridCard.jsx`·`.d.ts`·`.stories.tsx`·`.prompt.md`에 `hideProgress`(진행 바와 «수집/전체» 숫자를 숨김, 기본 끔, `completed`가 우선이라 완성이면 «완성» 칩은 그대로)를 서비스 사본과 같은 동작으로 옮긴다.
- 관련 파일(지도):
  - `jam-web/design-system/components/navigation/TopNav.stories.tsx` — 끝에 `SyncIconCircle`(rightSlot에 동기화 서클·종·아바타), 필요하면 기존 `CenterAndRightSlot`(글자 알약) 곁에 둔다
  - `jam-web/design-system/components/navigation/TopNav.prompt.md` — 「3분할 확장」 절 다음에 동기화 모양 두 가지(알약=centerSlot, 서클=rightSlot) 한 절
  - `jam-web/design-system/components/patterns/CollectionGridCard.jsx` 약 44행 prop 목록, 약 124~130행 맨 아래 행(`completed ? … : <ProgressBar …>`)
  - `jam-web/design-system/components/patterns/CollectionGridCard.d.ts` 5~25행 `CollectionGridCardProps`
  - `jam-web/design-system/components/patterns/CollectionGridCard.stories.tsx`, `CollectionGridCard.prompt.md`
  - 기준(서비스 사본): `jam-web/src/components/ui/CollectionGridCard.tsx` 25·45·85행, `jam-web/src/components/ui/SyncIconButton.tsx`, `jam-web/src/components/ui/TopNav.tsx` 131~148행
  - 검사: `npm run ds:check`의 `TopNav`·`CollectionGridCard` `PROPS_DRIFT`가 `hideProgress` 줄만 사라지는지 본다(TopNav는 서비스 전용 prop이라 남는 것이 정상)

## 배경 / 문제 정의

세션 DS 검토에서 `ds:check`가 `CollectionGridCard`의 `hideProgress`(서비스에만)와 `TopNav`의 `PROPS_DRIFT`를 짚었다. 확인해 보니 TopNav는 DS가 슬롯 껍데기라 기능 누락이 아니라 사용 예시가 빠진 것이고, `hideProgress`는 어드민 미리보기용으로 서비스에만 넣어 DS가 따라가지 못했다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 서비스 코드(`src/`)는 바꾸지 않는다. 변경은 `jam-web/design-system/` 안에서만 한다.
- `hideProgress` 동작은 서비스 사본과 같다: 켜면 맨 아래 행(진행 바와 숫자)을 그리지 않는다. 단 `completed`이면 «완성» 칩 행은 그대로 둔다(서비스 85행 `(completed || !hideProgress)`).
- 새 색·새 토큰 없음. 변경 후 `_ds_manifest.json`이 어긋나면 `node scripts/ds-manifest-sync.mjs`로 맞춘다.

### UI/UX 관점
- Story 문구와 이름은 UX Writing 가이드를 따른다(해요체, 마침표 없는 제목).

## 구현 계획
위 「관련 파일」을 따른다. 채원 판정이 TopNav에 새 prop이 필요하다고 보면 멈추고 사용자에게 알린다(이 티켓은 prop을 더하지 않는 것이 전제다).

## 완료 조건
### 구현 범위 (게이트 판정 대상)
- DS `CollectionGridCard`가 `hideProgress`를 받고 서비스 사본과 같은 동작을 하며, `.d.ts`·Story·prompt에 설명과 예시가 있다.
- DS `TopNav`에 동기화 서클 배치 Story와 prompt 설명이 있다.
- `ds:check` 오류 0건이고 `CollectionGridCard`의 `hideProgress` PROPS_DRIFT가 사라진다. tsc·eslint 0건.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤)
- Storybook에서 두 Story가 의도대로 보이는지 눈으로 확인한다.

## 주요 의사결정
- DS TopNav에 `syncStyle`을 만들지 않는다(도메인 결합이라 서비스 래퍼 몫, `TopNav.d.ts` `centerSlot` 주석). 서클 규격의 공통 컴포넌트 승격은 티켓 20261114_1413이 맡는다.

## 완료 기록

### 구현 내용 요약
- DS `CollectionGridCard`에 서비스 사본과 같은 `hideProgress`(기본 끔, 켜면 진행 바와 «수집/전체» 숫자 행을 그리지 않음, `completed`이면 «완성» 칩 행은 유지)를 옮겼다. `.jsx`·`.d.ts`·Story(`HideProgress`, `HideProgressCompleted`)·prompt에 반영했다.
- DS `TopNav`는 코드와 prop을 바꾸지 않고, `SyncIconCircle` Story와 prompt의 「동기화 모양 두 가지」 절(홈 글자 알약=centerSlot, 나머지 아이콘 서클=rightSlot, DS에 `syncStyle` 없음)만 더했다. 서비스 코드(`src/`)는 0줄이다.
- 채원① 판정: 재사용, 새 토큰·새 컴포넌트·새 prop 없음, 승인 불필요. 채원② 중대 문제 없음.

### 변경된 파일
```
jam-web/design-system/components/navigation/TopNav.stories.tsx
jam-web/design-system/components/navigation/TopNav.prompt.md
jam-web/design-system/components/patterns/CollectionGridCard.jsx
jam-web/design-system/components/patterns/CollectionGridCard.d.ts
jam-web/design-system/components/patterns/CollectionGridCard.stories.tsx
jam-web/design-system/components/patterns/CollectionGridCard.prompt.md
```

### 테스트 결과
- [x] 게이트(민지) WARN: CI 없음(push 금지), Storybook 실렌더 미확인. 재작업 없음
- [x] 머지 뒤 메인 트리: `ds:check` 오류 0건(경고 46→44, `CollectionGridCard`의 `hideProgress` PROPS_DRIFT 사라짐, `TopNav`의 PROPS_DRIFT는 서비스 전용 prop이라 남음), tsc 오류 없음, 카드 시험 2개 파일 34건 통과
- [ ] 사용자 확인 필요: Storybook에서 `SyncIconCircle`·`HideProgress` 실렌더, 360px에서 제목 말줄임과 서클·종·아바타 12px 간격

### 배포 정보
- 배포일: (로컬 staging에 머지만 했고 push·배포는 하지 않았다)
- 환경: staging (로컬)
- 커밋: 머지 `7bb1ac422`(구현 `b40717a5d`·`01eedde12`), 브랜치 `claude/jamwork-20261114_1706-ds-sync-hideprogress`

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 4 | 233,160 | 12,577 / 8,340 | 12분 29초 | 63 |
| 합계 | 4 | 233,160 | 20,917 | 12분 29초 | 63 |

### 주요 의사결정 / 핵심 메모
- 처음에는 «TopNav 동기화 서클이 DS에 빠졌다»고 보았으나, DS `TopNav`가 슬롯 껍데기이고 동기화는 서비스 래퍼 몫이라 기능 누락이 아니라 예시 누락임을 확인해 prop을 만들지 않았다.
- 아현의 review 브랜치 push가 자동 모드 분류기에 거부되어 CI 실행이 없다. 우회하지 않고 로컬 브랜치로 머지했다.

### 잔여 이슈
- 서클 아이콘 버튼(`SyncIconButton`·`NotificationBell`)과 `SyncIcon`의 DS 승격은 티켓 20261114_1413이 맡는다.
- `TopNav.prompt.md` 마지막 불릿의 «같은 구조다» 가리킴이 모호하다는 채원 지적이 있다(판정 영향 없음).
