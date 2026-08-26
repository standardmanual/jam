---
id: 20260826_008
category: UI
status: OPEN
created: 2026-08-26
closed:
---

# [UI] 바텀시트 X 닫기 버튼 누락 지점 — FeedSection DetailSheet

## 배경 / 문제 정의
> 왜 이 작업이 필요한가. 현재 상태와 기대 상태의 차이.

[[20260826_007]](20260826_007_UI_바텀시트-X닫기버튼-전체제거.md)에서 `src/components/ui/BottomSheet.tsx`
공용 컴포넌트를 쓰는 5개 사용처의 X 버튼을 제거했다. 그러나 사용자가 프로필 > 최근 피드에서
항목을 눌렀을 때 나오는 바텀시트에는 X가 남아있다고 재보고했다.

원인: `src/app/(main)/FeedSection.tsx`의 `DetailSheet`는 공용 `BottomSheet.tsx`를 쓰지 않는
**독립 구현체**다. 화면 하단에서 올라오는 패널(`fixed inset-x-0 bottom-0`, `rounded-t-*`,
`.t-panel-slide`)이라 시각적으로는 명백한 바텀시트이지만, 007 조사 범위(공용 컴포넌트 사용처)에
잡히지 않았다. 이 파일은 007 조사 당시에도 "바텀시트와 동일한 패널 슬라이드 패턴을 공유하는
별도 구현체"로 존재가 확인됐으나, 요청이 `BottomSheet` 컴포넌트로 한정된다고 판단해 범위에서
제외했었다 — 이번 사용자 재보고로 그 판단이 틀렸음이 확인됨.

## 상세 요구사항

### 서비스/코드베이스 관점
- `src/app/(main)/FeedSection.tsx`의 `DetailSheet` 컴포넌트(161~281행)에서 X 닫기 버튼
  (`IconButton icon="close"`, 214~216행)과 그 버튼만 담고 있던 wrapper `<div className="absolute
  top-8 right-8">`를 통째로 제거한다 — X만 있고 다른 콘텐츠가 없는 행/컨테이너이므로 빈 채로
  남기지 않는다.
- 백드롭 클릭 닫기(`onClick={onClose}`, 202행)와 하단 버튼(비배지 이벤트의 "닫기" 버튼,
  264~276행)은 X 버튼과 무관하게 그대로 유지한다.
- **참고**: 이 시트는 007에서 확인된 다른 사용처들과 달리 드래그-투-클로즈가 없다. 배지 이벤트인
  경우 하단 버튼은 "닫기"가 아니라 "자세히"(상세 페이지 이동)라서, X 제거 후 명시적 닫기 수단은
  백드롭 클릭뿐이다. 사용자 지시("사용성 문제는 고려하지마")에 따라 새 닫기 수단을 추가하지 않는다.
- 같은 grep 전수 조사에서 발견된 다른 X 버튼 후보(`PoiCarouselModal.tsx:429`,
  `BadgeRevealOverlay.tsx`/`BadgeRevealSpikeClient.tsx`의 `closeLabel`)는 바텀시트가 아닌
  별도 UI 패턴(화면 중앙 모달, 풀스크린 배지 리빌 캐러셀)이라 이번 범위에서 제외한다
  (`PoiCarouselModal`은 직전 대화에서 사용자가 명시적으로 제외 확정).

### UI/UX 관점 (해당 시)
- 사용성 저하는 사용자가 명시적으로 고려 대상에서 제외함(007과 동일 방침 계승)

## 구현 계획
> 어떻게 구현할지. 접근 방법, 영향 범위, 주요 변경 포인트.

1. jam-developer가 `FeedSection.tsx`의 `DetailSheet`에서 X 버튼 + wrapper div 제거
2. 게이트 리뷰로 백드롭 클릭 닫기·하단 버튼 로직 회귀 없는지, 다른 X 버튼 누락 지점이 더 없는지
   (전수 grep 재확인) 검증
3. 개선 리뷰 + 인터랙션 리뷰(제안형)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `FeedSection.tsx`의 `DetailSheet`에서 X 닫기 버튼(`IconButton icon="close"`)과 그 버튼만 담고
  있던 wrapper `<div className="absolute top-[var(--spacing-8)] right-[var(--spacing-8)]">`를
  통째로 제거. 더 이상 쓰이지 않게 된 `IconButton` import도 함께 제거.
- 백드롭 클릭 닫기(202행)와 하단 "닫기"/"자세히" 버튼(263~276행)은 변경 없음.
- 전수 재확인(grep): `icon="close"`, lucide-react `X` import, `closeLabel` prop을 코드베이스
  전체에서 재검색. `PoiCarouselModal.tsx:429`(화면 중앙 모달), `BadgeRevealOverlay.tsx` /
  `BadgeRevealSpikeClient.tsx`의 `closeLabel`(풀스크린 배지 리빌 캐러셀) 외 신규 후보 없음.
  추가로 `inset-x-0 bottom-0`/`rounded-t-[var(--radius` 패턴으로 바텀시트 유사 컴포넌트를
  넓게 재조사(`TodayCardStack.tsx`, `src/components/ui/sheet.tsx`) — `TodayCardStack.tsx`는
  닫기 버튼 자체가 없고, `sheet.tsx`는 어드민(`AdminNav.tsx`)에서 `side="left"` 좌측 드로어로만
  쓰여 바텀시트 패턴이 아니라 이번 범위와 무관.

### 변경된 파일
```
jam-web/src/app/(main)/FeedSection.tsx
```

### 테스트 결과
- [x] `npx tsc --noEmit` 통과 (FeedSection.tsx 관련 에러 없음)
- [ ] 실기기/브라우저 육안 확인 — staging 배포 후 `jam-stage.vercel.app`에서 확인 필요

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- 해당 없음: 신규/변경 노출 텍스트 없음(버튼 제거만 수행)

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·JAM 포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 2026-08-26
- 환경: staging
- 커밋: review 브랜치 `claude/jamwork-20260826_008-feedsection-x-remove` (커밋 81617386) staging 병합

### 주요 의사결정 / 핵심 메모
- 게이트 리뷰에서 배지 이벤트 케이스는 X 제거 후 하단 버튼이 "자세히"(닫기 아님)라 백드롭 클릭만
  유일한 닫기 수단이 되는 점, 드래그 핸들 바가 실제 드래그 기능 없는 장식이라는 점이 인터랙션
  리뷰에서 제안형으로 지적됨 — 사용자가 사용성 저하를 명시적으로 감수하기로 한 작업이라 이번
  범위에서는 되돌리지 않고 참고용으로만 남김.

### 잔여 이슈
-
