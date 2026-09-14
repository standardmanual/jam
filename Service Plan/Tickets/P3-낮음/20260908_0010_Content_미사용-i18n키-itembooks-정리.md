---
id: 20260908_0010
category: Content
priority: P3
status: OPEN
created: 2026-09-08
closed:
---

# [Content] 참조가 사라진 i18n 키 정리 (itembooks)

## 배경 / 문제 정의

티켓 [20260907_2221](20260907_2221_UI_장착개체-선택시트-ListRowCard-재구성.md) 게이트
리뷰에서 발견된 범위 밖 항목이다.

`jam-web/src/lib/i18n/ko.ts`의 `itembooks` 묶음에 **코드베이스 어디에서도 참조되지 않는 키**가
남아 있다 (2026-09-08 grep 확인).

- `d.itembooks.processing`
- `d.itembooks.ownedPrefix`

20260907_2221에서 `selectItemTitle`은 쓰임이 사라지며 함께 정리했지만, 위 두 키는 그 티켓이
지목한 대상이 아니어서 손대지 않았다.

쓰이지 않는 문구가 남아 있으면 UX Writing 점검 대상이 실제 화면보다 부풀고, 다음 작업자가
"어딘가에서 쓰이는 문구"로 오해해 고치려 든다.

## 상세 요구사항

### 컨텐츠 관점
- 두 키의 참조가 정말 0건인지 재확인한다 (동적 접근 `d.itembooks[key]` 형태가 없는지도 함께 확인)
- 참조가 없으면 삭제한다
- 같은 김에 `itembooks` 외 다른 묶음에도 같은 상태의 키가 있는지 훑어본다 — 개별 키를 하나씩
  쫓기보다 **전수 점검 한 번**이 낫다

## 구현 계획

1. `ko.ts`의 `ko` 객체 리터럴을 파싱해 모든 leaf 키(628개)를 추출한다.
2. `ko.ts`를 제외한 `src/**/*.{ts,tsx}` 전체에서 식별자 토큰 집합을 한 번만 수집한다
   (`rg -o -w '[A-Za-z_][A-Za-z0-9_]*'`).
3. 각 leaf 키 이름이 그 식별자 집합에 없으면 "참조 0건" 후보로 표시한다.
4. 동적 접근 패턴(`d.itembooks[key]`, `dict[key]` 형태)이 코드베이스에 있는지 별도로
   확인한다 — 없음을 확인(관리자 조건 폼의 `cond[key]` 류만 존재, i18n과 무관).
5. 후보마다 `rg -w`로 실제 사용처를 재확인해 오탐(동명이인 식별자로 인한 오검출 가능성)을
   배제한 뒤 삭제한다.

### 컨텐츠 관점

- 티켓이 지목한 `itembooks.processing`은 재확인 결과 `SlotGrid.tsx`에서 실제 사용 중이라
  **삭제하지 않았다** (배경 서술과 달리 참조가 있었음 — 아래 alerts 참고).
- `itembooks.ownedPrefix`는 참조 0건 확인, 삭제.
- 전수 점검 결과 `itembooks` 외 9개 네임스페이스(`profile`, `feed`, `badges`, `inventory`,
  `drops`, `missions`, `onboarding`, `social`, `combine`)에서도 참조가 사라진 키 다수를
  추가로 발견해 함께 정리했다. 대부분 UI 리뉴얼·필터 기능 축소·탭 제거 과정에서 남겨진
  잔재로 보인다(예: `badges.tabItem`은 "아이템" 탭이 화면에서 빠졌는데 키만 남은 경우,
  `missions.filterButton`/`filterReset`/`missionType*` 등은 미션 필터 UI가 축소되며
  남은 경우).
- 삭제 전후 모두 `npm run lint` 0 에러를 확인했고, 삭제 후 동일한 전수 스캔을 재실행해
  잔여 미사용 키가 0건임을 확인했다.

## 완료 기록

### 구현 내용 요약

`jam-web/src/lib/i18n/ko.ts`에서 코드베이스 어디에서도 참조되지 않는 키 63개를 삭제했다
(628개 → 565개). 네임스페이스별 삭제 개수: `profile` 2, `feed` 1, `badges` 13, `inventory`
8, `drops` 4, `missions` 20, `onboarding` 1, `social` 1, `itembooks` 11, `combine` 1.
문구 값·주석·네임스페이스 구조는 건드리지 않았고, 참조가 없는 키만 제거했다.

### 변경된 파일
```
jam-web/src/lib/i18n/ko.ts
```

### 테스트 결과
- [x] `npm run lint` 전체 실행 — 0 에러, 14 경고 (모두 이번 변경과 무관한 기존 이슈:
  design-system stories/컴포넌트의 미사용 변수·img 태그 경고, scripts/recraft 스크립트 경고)
- [x] 삭제 후 동일한 전수 스캔(식별자 토큰 집합 대조) 재실행 — 잔여 미사용 키 0건
- [x] 각 삭제 후보를 `rg -w`로 개별 재확인해 동명이인 오탐 배제

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [x] 삭제만 수행, 신규 노출 문구 없음

### 배포 정보
- 배포일:
- 환경:
- 커밋:

### 주요 의사결정 / 핵심 메모

- 티켓 배경에 적힌 "`d.itembooks.processing`이 미사용"이라는 서술은 2026-09-08 시점의
  grep 결과였을 것으로 보이나, 재확인 시점(2026-09-14)에는 `SlotGrid.tsx:431`에서 실제
  참조 중이었다. 삭제 대상에서 제외했다.
- 개별 키 추적 대신 스크립트 기반 전수 스캔을 택했다 — 628개 키를 그레핑 방식(`grep -r`)
  으로 하나씩 훑으면 수 분 이상 걸려(1차 시도 시 `grep -rn`으로 4분 넘게 걸림), `rg`로
  코드베이스 식별자 토큰을 한 번만 수집해 집합 대조하는 방식으로 전환했다.

### 잔여 이슈
- 없음

### alerts
- [INFO] 티켓 배경 서술(`itembooks.processing` 미사용)과 실제 코드 상태(사용 중)가
  어긋나 있었다. 이 문서를 근거로 다른 작업을 판단할 때 참고.
- [INFO] 미사용 키가 `itembooks` 외에도 9개 네임스페이스에 걸쳐 63개나 남아 있었다.
  UI 리뉴얼·기능 축소 시 관련 i18n 키를 함께 정리하는 습관이 있으면 재발을 줄일 수 있다.
