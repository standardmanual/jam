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
1. **`FeedSection.tsx`의 `DetailSheet`** — 피드 항목 클릭 시 뜨는 상세 바텀시트다. 배경을
   덮고 포커스가 그 안에 갇혀야 하는 명백한 모달로 판단해 `BottomSheet.tsx`(20260908_0040)와
   같은 패턴을 적용했다: `role="dialog"`+`aria-modal="true"`+`aria-labelledby`(제목 `<h2>`),
   포커스 트랩(Tab 순환), 최초 포커스 이동, Escape 닫기, 닫힐 때 이전 포커스 요소로 복귀.
2. **`PoiCarouselModal.tsx`** — 지도 화면에서 POI를 클릭하면 뜨는 화면 전체 캐러셀
   모달이다(배경 탭 닫힘, 카드 안 닫기 버튼, `fixed inset-0` 전체 오버레이). 역시 모달
   성격이 명확해 같은 패턴을 적용했다. 다만 이 모달은 부모가 `open` prop 없이 조건부
   렌더로 마운트/언마운트하므로, 포커스 트랩 effect는 컴포넌트 마운트 시 1회만 등록한다.
   `aria-label`은 시각적으로 노출되지 않는 스크린리더 전용 문구라 `d.drops.poiCarouselAriaLabel`
   (`'지점 드랍·픽업'`)로 `ko.ts`에 추가했다.
3. **`BottomSheet.tsx`의 "FeedSection과 공유" 주석 정정** — 티켓 본문은 이 주석이
   "실제로는 `FeedSection.tsx`에 `.t-panel-backdrop` 사용처가 없다"고 지적했으나, 코드를
   확인한 결과 `FeedSection.tsx`의 `DetailSheet`가 이미 `.t-panel-backdrop`을 쓰고 있었다
   (`git log`로 도입 시점부터 계속 있었음을 확인). `PoiCarouselModal.tsx`도 마찬가지다.
   즉 주석은 사실과 어긋나지 않아 **수정하지 않았다** — 아래 alerts 참조.
4. **DS BottomSheet.jsx ↔ 서비스 BottomSheet.tsx 통합 여부** — 조사 결론만 남긴다.
   `FeedSection.tsx`의 `DetailSheet`와 `PoiCarouselModal.tsx`는 둘 다 `BottomSheet.tsx`를
   쓰지 않는 **독립 오버레이 구현**이라, 이번에 접근성 로직(포커스 트랩·Escape)을 각
   파일에 별도로 추가했다 — 세 곳(서비스 `BottomSheet.tsx` 포함)에 사실상 같은 코드가
   중복된다. 서비스 내부 오버레이 3종의 접근성 로직을 공용 훅(`useDialogA11y` 류)으로
   추출할 가치가 있다고 판단하나, 이번 티켓 범위(속성 확인·주석 정정)를 넘어서므로
   후속 티켓으로 분리를 제안한다(DS `BottomSheet.jsx`와의 병합 여부는 그보다 더 큰
   범위라 이번에는 다루지 않는다).

### 변경된 파일
```
jam-web/src/app/(main)/FeedSection.tsx
jam-web/src/components/PoiCarouselModal.tsx
jam-web/src/lib/i18n/ko.ts
```

### 테스트 결과
- [x] `npm run lint` 전체 실행 — 0 errors, 14 warnings(모두 이번 변경과 무관한 기존 경고,
      변경 파일에는 경고 없음)
- [x] `npx tsc --noEmit` — 통과(출력 없음)
- [ ] 실브라우저 포커스 트랩/Escape 수동 확인 — 미실시(정적 코드 검증만 완료)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 용어 일관성: 신규 문구(`poiCarouselAriaLabel`)는 화면에 노출되지 않는 스크린리더
      전용 aria-label이라 시각 카피가 아니지만, 기존 고정 용어("드랍"·"픽업")만 사용했다.
- [x] 톤앤매너: 해당 없음(비노출 라벨)
- [x] 에러 메시지: 해당 없음(에러 문구 신규/변경 없음)
- [x] 문장 규칙: 해당 없음
- [x] 표기 규칙: 해당 없음

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
- `BottomSheet.tsx`의 기존 주석을 고치지 않은 이유: 티켓이 지적한 "코드-주석 불일치"는
  실제로 존재하지 않았다(`FeedSection.tsx`가 이미 `.t-panel-backdrop`을 쓰고 있음). 코드를
  임의로 "고쳐서" 티켓 서술에 맞추는 대신, 사실을 확인한 대로 두었다.
- `PoiCarouselModal`의 포커스 트랩은 캐러셀 전체(활성+peek 카드)를 대상으로 한다 — 활성
  카드만으로 좁히면 캐러셀 스와이프 중 포커스 이동이 부자연스러워질 수 있어, 화면에
  실제로 존재하는 포커스 가능 요소 전체를 순환 대상으로 삼는 편이 더 안전하다고 판단했다.
- DS/서비스 BottomSheet 통합은 결정하지 않고 후속 검토 필요 사실만 기록했다(위 4번).

### 잔여 이슈
- 서비스 내 오버레이 3종(서비스 `BottomSheet.tsx`, `FeedSection.tsx`의 `DetailSheet`,
  `PoiCarouselModal.tsx`)이 포커스 트랩/Escape 로직을 각자 중복 구현하게 됐다 —
  공용 훅 추출과 DS `BottomSheet.jsx` 통합 여부를 함께 검토할 후속 티켓 필요.
- 실브라우저 수동 QA(포커스 이동·Tab 순환·Escape) 미실시.
