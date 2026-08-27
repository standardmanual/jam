---
id: 20260827_013
category: Admin
status: OPEN
created: 2026-08-27
---

> **재번호**: 최초 `20260827_011`로 배정됐으나 `20260827_012`로 1차 재번호(구현 착수 시점
> 확인 결과 `011`이 이미 두 티켓에 사용 중이었음). 그런데 머지 전 오케스트레이터가
> origin/staging을 재확인한 결과 이번엔 `20260827_012`마저 다른 병렬 세션(`API_배지관리API-
> DELETE-PATCH-404처리불일치수정`)이 먼저 CLOSED·병합 완료한 상태였다 — staging 병렬 세션
> 번호 충돌이 20260827_007부터 이 티켓까지 연쇄적으로 반복되고 있다. 최신 origin/staging
> 위로 리베이스 후 `20260827_013`으로 2차 재번호했다 — 본문 내용은 변경 없음.

# [Admin] 콘텐츠 관리 Data Table 선택 UI 보강 + 필터 버튼 흰색 복원 + 이모지 아이콘 전면 제거

## 배경 / 문제 정의

`20260826_014`(Data Table 파일럿)·`015`(9개 화면 롤아웃)·`20260827_001~002`(하드코딩 색상
제거)로 어드민 shadcn 전환 4단계가 전부 CLOSED됐다. 그런데 사용자가 다시 확인해보니
`콘텐츠 관리` 메뉴 6개 화면(배지·POI·컬렉션(아이템북)·세계관·믹스 레시피·투데이) 중
POI·믹스 레시피 두 화면만 배지 관리와 달리 행 선택(체크박스)·일괄 액션이 빠져 있고,
필터 버튼이 정렬(sort) 버튼과 달리 진한 회색으로 보이며, 어드민 전역에 이모지 아이콘이
여전히 많이 남아있다. 이 세 가지를 이번 티켓에서 정리한다.

**원인 조사 결과**:

1. **POI·믹스 레시피 선택 UI 부재는 의도적 설계였다.** `015` 완료 기록에 따르면 두 화면은
   소프트 삭제 개념 없이 하드 `DELETE`만 있어서, "일괄 비활성화"라는 이름으로 실제로는
   되돌릴 수 없는 일괄 삭제를 노출하는 게 위험하다고 판단해 행 선택 UI 자체를 뺐다.
   이번 요청으로 사용자에게 재확인한 결과 **일괄 하드 삭제를 명시적 경고와 함께 추가하기로
   결정**했다 (이전 판단을 뒤집는 것이므로 완료 기록에 이 경위를 남길 것).
2. **필터 버튼이 회색인 원인은 `button.tsx`의 `outline` variant 재정의다.** shadcn 표준
   `outline`은 흰 배경+테두리인데, 이 프로젝트는 `bg-neutral-700 text-white`(진한 회색 채움)로
   덮어써져 있다(`src/components/admin/ui/button.tsx:14`). `DataTableFacetedFilter`(필터
   버튼)가 이 variant를 쓰는 반면 `DataTableColumnHeader`(정렬 버튼)는 `ghost` variant를
   써서 색이 갈렸다. 사용자 확인 결과 **`outline` variant 자체를 전역으로 수정**하기로
   했다 — 필터 버튼 외에도 취소 버튼·상세 화면 보조 버튼 등 어드민 전역 22곳이 함께 바뀐다.
3. **이모지 아이콘**은 사이드바 메뉴(`adminNavItems.ts`, 전체 그룹·대시보드 포함)와
   배지 관련 화면 다수에 남아있다. 어드민은 이미 `@tabler/icons-react`를 표준 아이콘
   라이브러리로 쓰고 있다(`data-table-column-header.tsx`·`data-table-faceted-filter.tsx` 등).

## 상세 요구사항

### 1. POI·믹스 레시피에 선택 + 일괄 삭제 추가

- 두 화면의 목록 테이블(`src/components/admin/poi/PoiTable.tsx`, `src/app/admin/recipes/
  RecipeTable.tsx` 또는 `RecipeList.tsx` — 실제 위치는 코드로 재확인)에 배지 관리와 동일한
  체크박스 컬럼 + 전체 선택 + "N개 선택됨" 일괄 액션 바(`data-table-bulk-action-bar.tsx`
  재사용)를 추가한다.
- 일괄 액션은 기존 단건 `DELETE` API(POI·레시피 각각 존재 확인됨, 예:
  `/api/admin/recipes/{id}` DELETE)를 선택된 행에 대해 순차 호출하는 방식 — 다른 화면들이
  이미 쓰는 "기존 단건 API 순차 호출" 패턴(아이템북·투데이·세계관·어뷰징과 동일)을 그대로
  따른다. **새 API를 만들지 않는다.**
- 확인 다이얼로그(`AlertDialog`)에 **"삭제하면 되돌릴 수 없습니다"** 같은 명시적 경고 문구를
  넣는다 — 다른 화면의 "비활성화" 확인 문구와 톤이 달라야 한다(하드 삭제이므로).
  UX Writing 가이드의 에러/경고 톤(단호하게)을 따를 것.
- 배지·컬렉션(아이템북)·세계관·투데이 4개 화면은 이미 선택 UI가 있으므로 기능 추가 없이
  현재 상태가 배지 관리 기준과 동일한지만 재확인한다(회귀 없는지 확인 목적).

### 2. `outline` 버튼 variant 흰색 복원

- `src/components/admin/ui/button.tsx`의 `outline` variant를 shadcn 표준 패턴(흰 배경 +
  얇은 테두리, 예: `border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50`
  — 다른 화이트 계열 토큰과 이름이 겹치지 않는지 `[data-admin-theme]` 스코프 변수 확인 후
  적용)으로 되돌린다.
- 변경 후 **최소 3~4개 화면**(예: POI 필터, 아이템북 상세 취소 버튼, 배지 관리 필터,
  어뷰징 단건 해제 버튼 등 `outline` 사용처 중 성격이 다른 것들)을 실제 브라우저로 확인해
  의도치 않은 대비 문제(흰 배경 위 흰 글씨 등, `20260827_002`에서 발생했던 것과 유사한
  스코프 문제)가 없는지 검증한다.

### 3. 이모지 아이콘 전면 제거

- 대상(2026-08-27 grep 기준, 재확인 후 진행): `adminNavItems.ts`(사이드바 메뉴 전체·
  대시보드 포함, 최우선), `AdminSidebar.tsx`(렌더링 방식 변경 필요), `badges/BadgeForm.tsx`,
  `admin/page.tsx`(대시보드), `admin/points/page.tsx`, `admin/simulator/page.tsx`,
  `components/admin/BadgeMultiSearchSelect.tsx`, `components/admin/badges/BadgeCard.tsx`,
  `components/admin/badges/BadgeDetail.tsx`. 착수 전
  `grep -rlP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" src/app/admin src/components/admin`로
  최신 목록을 다시 확인할 것(이 티켓 작성 이후 변경 가능).
- 전부 `@tabler/icons-react`(어드민 기존 표준)의 대응 아이콘으로 교체한다.
- **`adminNavItems.ts`의 `NavItem.icon` 타입 변경이 필요하다** — 현재 `icon: string`(이모지
  문자열)이고 `AdminSidebar.tsx`가 `<span className="text-lg">{item.icon}</span>`로 문자열을
  그대로 렌더링한다. 아이콘 컴포넌트(`React.ComponentType<{ className?: string }>` 등)로
  타입을 바꾸고 `AdminSidebar.tsx`의 두 렌더 분기(아이콘-collapse 모드/펼친 모드) 모두와
  `components/admin/__tests__/adminNavItems.test.ts`를 함께 수정한다. 사이드바 접힘 상태에서
  아이콘만 남는 레이아웃(`20260826_013` 산출물)이 깨지지 않는지 반드시 확인.
- 이모지가 아닌 의미 전달용 텍스트(예: 상태 텍스트 "완료"/"대기" 등)는 대상이 아니다 —
  실제 이모지 문자만 제거한다.

## 절대 건드리면 안 되는 것

- 배지·컬렉션(아이템북)·세계관·투데이의 기존 일괄 비활성화 로직·API 계약 — 렌더링·아이콘만 손댐
- 미리보기 프레임 2개(`BadgeDetailPreviewFrame.tsx`, `ItemBookDetailPreviewFrame.tsx`) —
  MODULAR 유지 대상, 하드코딩 색상 예외 그대로 유지
- POI·레시피의 CRUD API 자체 — 순차 호출 방식으로만 일괄화, 새 API 없음
- `button.tsx`의 다른 variant(`default`/`destructive`/`secondary`/`ghost`/`link`) — `outline`만 수정

## 구현 계획

1. `button.tsx`의 `outline` variant부터 수정 → 어드민 전역에서 실제 렌더링 확인
   (필터 버튼이 정렬 버튼과 같은 흰색 톤인지, 다른 22곳에서 대비 문제 없는지)
2. POI·레시피에 체크박스 선택 + 일괄 하드 삭제 액션 추가 (다른 화면의 일괄 액션 구현 패턴
   그대로 재사용)
3. 이모지 아이콘 grep 재실행 → `adminNavItems.ts` 타입 변경 + `AdminSidebar.tsx` 렌더링
   방식 변경 → 나머지 파일 순차 교체
4. 로컬 dev 서버 + 임시 `ADMIN_EMAILS` 오버라이드로 실제 확인 — **1440px 데스크탑**에서
   콘텐츠 관리 6개 화면 전부(선택·필터·페이징) + 사이드바 접힘/펼침 두 모드 + `outline`
   버튼 대비 확인
5. `npx tsc --noEmit` / `npm test` / `npx next build` 통과 확인
6. `grep -rlP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" src/app/admin src/components/admin`
   결과 0건 확인(완료 기준)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

1. **`button.tsx` `outline` variant 흰색 복원**: `bg-neutral-700 text-white hover:bg-neutral-600`
   (진한 회색 채움) → `border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50`
   (shadcn 표준 흰 배경 + 얇은 테두리)로 전역 수정. 이름 겹치지 않는 리터럴 Tailwind 색상
   클래스를 써서 `[data-admin-theme]` 스코프 토큰 오버라이드 문제(20260827_002 유형)를
   원천적으로 피했다. 어드민 전역 16개 Button 사용처(취소 버튼·필터 버튼·상세 보조 버튼·
   토글 버튼 등)가 함께 바뀐다 — `Badge` 컴포넌트의 `outline` variant는 별도 파일(`badge.tsx`)로
   이미 흰 배경 톤이라 손대지 않았다.
2. **POI·믹스 레시피에 체크박스 선택 + 일괄 하드 삭제 추가**: `PoiTable.tsx`·`RecipeTable.tsx`에
   배지 관리(`BadgesTable.tsx`)와 동일한 `select` 컬럼(전체 선택 포함) + `DataTableBulkActionBar`
   + `AlertDialog` 확인 다이얼로그를 추가했다. 기존 단건 `DELETE` API(`/api/admin/poi/{id}`,
   `/api/admin/recipes/{id}`)를 선택된 행에 순차 호출하는 패턴을 그대로 재사용했다(새 API
   없음). 확인 다이얼로그 문구는 "선택한 N개 [POI|레시피]를 삭제합니다. 삭제하면 되돌릴 수
   없습니다."로, 기존 소프트 비활성화 다이얼로그("계속하시겠습니까?")와 톤을 구분하고 확정
   버튼 라벨도 "계속" 대신 "삭제"로 명확히 했다(UX 가이드 5절 "예측 가능한 행동 동사").
   배지·컬렉션·세계관·투데이 4개 화면은 이미 동일 패턴을 갖추고 있어(회귀 확인만 진행,
   `RowSelectionState` grep으로 확인) 코드 변경 없음.
3. **이모지 아이콘 전면 제거**: 착수 전 grep 재실행 결과 티켓 작성 시점 목록과 대부분 일치했고,
   완전탐색 결과 `✓`/`✗`/`○`/`⚠` 등 그림 문자(그레프 범위 U+2600–27BF 포함)도 함께 제거
   대상으로 판단해(완료 기준이 grep 0건이므로) `@tabler/icons-react`의 `IconCheck`/`IconX`/
   `IconAlertTriangle` 등으로 교체했다. `adminNavItems.ts`의 `NavItem.icon` 타입을
   `string`(이모지 문자열) → `ComponentType<{ className?: string }>`로 바꾸고,
   `AdminSidebar.tsx`의 두 렌더 분기(아이콘-collapse 모드/펼친 모드) 모두 `<item.icon />`
   직접 렌더링으로 변경했다 — `SidebarMenuButton`이 이미 `[&>svg]:size-4 [&>svg]:shrink-0`을
   갖고 있어 별도 wrapper span 없이 자동으로 크기가 맞춰진다(shadcn `IconLayoutSidebar` 렌더
   패턴과 동일). `adminNavItems.test.ts`도 아이콘 컴포넌트 참조로 갱신.

### 재번호
최초 `20260827_011`로 배정됐으나 구현 착수 시점 `origin/staging`에 동일 번호의 CLOSED 티켓이
이미 2건 존재해(`API_배지수정API...`, `Admin_shadcn어드민-테마컨테이너...`) `20260827_012`로
재번호했다. 파일명·`id` 필드만 변경, 본문 내용 변경 없음.

### 변경된 파일
```
jam-web/src/components/admin/ui/button.tsx
jam-web/src/components/admin/poi/PoiTable.tsx
jam-web/src/app/admin/recipes/RecipeTable.tsx
jam-web/src/components/admin/adminNavItems.ts
jam-web/src/components/admin/AdminSidebar.tsx
jam-web/src/components/admin/__tests__/adminNavItems.test.ts
jam-web/src/app/admin/page.tsx
jam-web/src/app/admin/points/page.tsx
jam-web/src/app/admin/simulator/page.tsx
jam-web/src/app/admin/badges/BadgeForm.tsx
jam-web/src/components/admin/BadgeMultiSearchSelect.tsx
jam-web/src/components/admin/badges/BadgeCard.tsx
jam-web/src/components/admin/badges/BadgeDetail.tsx
Service Plan/History/Migration/Ticket/20260827_011_...md → 20260827_012_...md (rename)
```

### 테스트 결과
- [x] `npx tsc --noEmit` 통과 (에러 0건)
- [x] `npx vitest run` 62 files / 570 tests 전부 통과 (기존 실패 없음)
- [x] `npm run test:node` (today/missions 로직 테스트) 전부 통과
- [x] `npx next build` 정상 완료 (에러 없음)
- [x] `grep -rlP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" src/app/admin src/components/admin`
      결과 0건 (완료 기준 충족)
- [x] 1440px 데스크탑 실브라우저 확인 — 게이트 리뷰 WARN 사유를 받아 오케스트레이터가
      머지 전 직접 수행(아래 "승인 처리" 참고).

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 용어 일관성: 어드민 내부 화면이라 "POI"·"레시피" 등 기존 어드민 표기를 그대로 유지
      (사용자 노출 화면이 아니므로 "지점" 등 유저向 고정 용어 표로 치환하지 않음 — 기존
      어드민 화면 전체가 이미 이 표기를 쓰고 있어 일관성 유지 목적)
- [x] 톤앤매너: POI·레시피 일괄 삭제 경고는 "삭제하면 되돌릴 수 없습니다"로 단호하게 명시,
      기존 단건 삭제 다이얼로그(`PoiForm.tsx`: "이 작업은 되돌릴 수 없습니다")와 같은 톤으로
      맞추되 비활성화 다이얼로그("계속하시겠습니까?")와는 구분
- [x] 에러 메시지: 일괄 삭제 실패 시 "N개 [POI|레시피] 삭제에 실패했습니다. 다시 시도해주세요."
      (기존 배지 일괄 비활성화 실패 메시지와 동일 패턴)
- [x] 문장 규칙: 해요체 대신 어드민 기존 관습인 습니다체 유지(어드민 전 화면 통일 표기,
      배지/컬렉션 등 기존 다이얼로그와 동일)
- [x] 표기 규칙: 해당 없음(날짜/금액 문구 변경 없음)

### 배포 정보
- 배포일: (미배포 — staging 병합 후 오케스트레이터가 진행)
- 환경: production
- 커밋: (아래 "push한 브랜치명" 참고, main 승격 전)

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

- POI·레시피 일괄 삭제 노출 여부와 `outline` variant 전역/국소 수정 범위는 오케스트레이터가
  사용자에게 사전 확인(AskUserQuestion) 후 확정한 값이다 — "일괄 하드 삭제까지 추가",
  "전역 outline variant 수정". 재판단하지 않고 그대로 구현했다.
- 이모지 제거 범위: 티켓 3절 마지막 문단("이모지가 아닌 의미 전달용 텍스트는 대상이 아니다")과
  완료 기준(`grep -rlP ... 0건`)이 `✓`/`✗`/`○`/`⚠` 같은 기호 문자에 대해 서로 다르게 읽힐 수
  있었다 — "그림 이모지가 아니다"로 볼 여지와 "grep 범위 안이라 제거 대상"으로 볼 여지가
  공존했다. grep 0건이 명시적 완료 기준으로 못박혀 있어 이를 우선해 전부 아이콘 컴포넌트로
  교체했다(재판단 아님, 완료 기준 문구를 그대로 따른 것).
- POI·레시피 일괄 삭제 확인 문구는 기존 단건 삭제(`PoiForm.tsx`)의 "이 작업은 되돌릴 수
  없습니다" 표현을 그대로 재사용해 톤 일관성을 유지했다.

### 잔여 이슈
- 없음 (게이트 리뷰 WARN 사유 2건 모두 오케스트레이터가 머지 전 해소 — 아래 "승인 처리" 참고)

## 승인 처리 (2026-08-27)

게이트 리뷰 **WARN** — 핵심 요구사항 3건(POI·레시피 선택+일괄삭제, `outline` 버튼 흰색 복원,
이모지 전면 제거)은 정확히 구현됐다고 확인했으나, 두 가지 우려사항이 남았다:
1. 신규 작성된 `PoiTable.tsx`·`RecipeTable.tsx`에 `react-hooks/set-state-in-effect` 린트
   에러(직전 티켓 `20260827_010`에서 고친 것과 동일 패턴의 재발) 재확인됨
2. 1440px 데스크탑 실브라우저 검증 미수행

오케스트레이터가 머지 전 둘 다 직접 처리했다:

**린트 회귀 수정**: 두 파일의 `useEffect`+`setState` 패턴을 `BadgesTable.tsx`와 동일한
`useState` lazy initializer로 교체, `useEffect` import 제거. `npx eslint`·`npx tsc --noEmit`
재실행 모두 에러 0건 확인.

**실브라우저 검증(로컬 `npm run dev`, 1440px, `ADMIN_EMAILS` 임시 오버라이드 + `/api/dev-login`)**:
- POI 관리: "카테고리" 필터 버튼이 흰 배경+테두리로 정상 렌더링(정렬 버튼과 동일 톤),
  전체 선택 → "30개 선택됨" 일괄 액션 바 노출 확인
- 믹스 레시피: 체크박스 선택 → "선택 항목 삭제" → 확인 다이얼로그에 "선택한 33개 레시피를
  삭제합니다. 삭제하면 되돌릴 수 없습니다." 경고 문구 정확히 노출, 흰 배경 위 텍스트 가시성
  정상(`20260827_002`류 스코프 회귀 없음), **취소로 종료해 실제 데이터는 삭제하지 않음**
- 대시보드·사이드바: 이모지 없이 `@tabler/icons-react` 아이콘으로 전부 렌더링, 사이드바
  접힘(아이콘 전용)/펼침 두 모드 모두 정상 — `20260826_013` 레이아웃 붕괴 없음
- 검증 후 임시 `ADMIN_EMAILS` 오버라이드 원복, 로컬 dev 서버 종료

**2차 재번호(011→012→013)**: 머지 전 `origin/staging`을 재확인한 결과, jam-developer가
구현 착수 시점에 이미 011→012로 1차 재번호했음에도 그 사이 다른 병렬 세션이
`20260827_012`(배지 관리 API DELETE·PATCH 404 처리 수정)를 먼저 CLOSED·병합했다. 최신
`origin/staging` 위로 리베이스(충돌 없음) 후 `20260827_013`으로 2차 재번호했다 — 파일명·
`id` 필드만 변경, 본문 불변.

병합 승인은 사용자에게 별도 요청.

### 배포 정보
- 배포일: (staging 반영 대기 — 사용자 승인 후 진행)
- 환경: staging
- 커밋: `claude/jamwork-20260827_012-admin-datatable-select-icons` → staging 병합 예정
