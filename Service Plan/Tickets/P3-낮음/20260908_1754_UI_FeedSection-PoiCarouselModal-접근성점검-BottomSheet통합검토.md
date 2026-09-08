---
id: 20260908_1754
category: UI
priority: P3
status: OPEN
created: 2026-09-08
closed:
---

# [UI] FeedSection·PoiCarouselModal 접근성 점검 및 BottomSheet 병존 구현 통합 검토

## 배경 / 문제 정의
> 왜 이 작업이 필요한가. 현재 상태와 기대 상태의 차이.

티켓 [20260908_0040(BottomSheet)](20260908_0040_UI_BottomSheet-접근성-모션-결함.md) 게이트·개선
리뷰에서 범위 밖으로 지적된 두 건이다.

**1) `FeedSection.tsx`·`PoiCarouselModal.tsx` 접근성 미확인**
두 컴포넌트가 `BottomSheet.tsx`와 `.t-panel-backdrop` 클래스를 공유해, 이번 티켓의
`pointer-events` 수정(닫힘 트랜지션 중 뒷화면 탭 먹힘 방지)의 혜택을 우연히 함께 받았을
가능성이 있다. 다만 `role="dialog"`·`aria-modal`·포커스 트랩·Escape 닫기 같은 접근성 속성은
이번 범위에서 확인되지 않았다 — `BottomSheet.tsx`가 원래 갖고 있던 것과 같은 결함이 이
두 컴포넌트에도 남아있을 수 있다.

부수적으로, `BottomSheet.tsx`의 기존 주석이 "`.t-panel-backdrop`을 `FeedSection`·
`PoiCarouselModal`과 공유한다"고 적고 있는데 실제로는 `FeedSection.tsx`에 그 클래스 사용처가
없다(주석과 실제 코드가 어긋남) — 확인 과정에서 함께 바로잡을 수 있다.

**2) DS BottomSheet.jsx ↔ 서비스 BottomSheet.tsx 병존 구현 수렴**
이번 수정으로 서비스 쪽 `BottomSheet.tsx`가 DS(`design-system/components/navigation/
BottomSheet.jsx`)와 사실상 동일한 접근성 패턴(role/aria/포커스 트랩/Escape)으로 수렴했다.
장기적으로 서비스 특화 로직(드래그-투-클로즈·footer 분리·`uiOverlay` 연동)을 DS 쪽에 옵션으로
흡수해 두 구현을 하나로 합칠지 검토할 만하다 — 지금 당장 필요한 작업은 아니다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `FeedSection.tsx`·`PoiCarouselModal.tsx`가 각각 어떤 오버레이/패널 UI를 그리는지 확인하고,
  모달 성격이 있다면(포커스가 거기 갇혀야 하는 UI라면) `role="dialog"`+`aria-modal`+포커스
  트랩+Escape 닫기를 20260908_0040과 같은 패턴으로 적용할지 판단한다. 모달이 아니라면(예:
  인라인 확장 섹션) 적용 불필요 — 그 판단 근거를 완료 기록에 남긴다.
- `BottomSheet.tsx`의 "`.t-panel-backdrop`을 FeedSection과 공유"라는 잘못된 주석을 실제 코드에
  맞게 정정하거나 삭제한다.
- DS/서비스 BottomSheet 통합 여부는 이번 티켓에서 결정하지 않아도 된다 — 조사만 하고, 통합이
  필요하다고 판단되면 별도 티켓으로 분리해서 기록한다(코드 변경 없이 결론만 남겨도 됨).

### UI/UX 관점 (해당 시)
- 해당 없음(1번 항목의 판단에 따라 달라짐).

### 컨텐츠 관점 (해당 시)
- 해당 없음.

## 구현 계획
> 어떻게 구현할지. 접근 방법, 영향 범위, 주요 변경 포인트.

1. `FeedSection.tsx`·`PoiCarouselModal.tsx`를 읽고 모달 성격 여부를 판단한다.
2. 모달이면 20260908_0040의 패턴(role/aria-modal/aria-labelledby/포커스 트랩/Escape)을 적용,
   아니면 판단 근거만 기록한다.
3. 주석 오류를 정정한다.
4. DS/서비스 BottomSheet 통합은 조사 결론만 남기고, 필요 시 후속 티켓으로 분리한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

### 잔여 이슈
-
