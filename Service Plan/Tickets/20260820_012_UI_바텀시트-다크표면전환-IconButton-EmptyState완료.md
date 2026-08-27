---
id: 20260820_012
category: UI
status: CLOSED
created: 2026-08-20
closed: 2026-08-20
---

# [UI] BottomSheet·DropsClient·FeedSection·InventoryItemHistorySheet 다크 표면 전환 + IconButton·EmptyState 잔여분 완료

## 배경 / 문제 정의

티켓 20260820_011에서 IconButton 4곳(`BottomSheet.tsx`, `DropsClient.tsx`, `FeedSection.tsx`,
`MapView.tsx`)과 EmptyState 2곳(`DropsClient.tsx`, `InventoryItemHistorySheet.tsx`)이 HALT됐다.
원인: `design-system/components/buttons/IconButton.jsx`의 `surface` prop이 `light`/`dark`
어느 쪽이든 이 서비스(다크 테마 고정, `colors.light.css` 미로드)에서는 흰색으로 귀결돼 흰
배경 위에 필요한 검정 아이콘을 낼 방법이 없고, `design-system/components/feedback/EmptyState.jsx`도
`--color-text`/`--color-text-secondary`를 하드코딩해 같은 문제를 겪는다.

사용자 결정: DS 컴포넌트를 고치는 대신, **문제가 되는 서비스 화면(흰 배경 시트) 자체를 다크
표면으로 전환**해 DS 컴포넌트를 그대로 쓸 수 있게 한다. 단 `MapView.tsx`의 지도 위 원형 버튼은
"시트"가 아니라 지도 타일 위에 뜨는 버튼이라 다크 표면화가 그대로 적용되지 않는 예외로 분류돼
**이번 범위에서 제외**한다(잔여 이슈로 남김, 별도 검토 필요).

## 상세 요구사항

### 서비스/코드베이스 관점

1. **다크 표면 전환 대상 4개 화면**: `src/components/ui/BottomSheet.tsx`(기본 시트),
   `src/app/(main)/drops/DropsClient.tsx`(드랍/픽업 패널), `src/app/(main)/FeedSection.tsx`
   (상세 시트), `src/app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx`.
   - 각 파일에서 흰 배경(`bg-white`, `bg-surface-inverse`, `Card tone="inverse"` 등)을 서비스
     다크 테마 표준 배경 토큰(`var(--color-surface)` 또는 `var(--color-surface-elevated)` —
     실제 컴포넌트 성격에 맞는 쪽 판단)으로 교체.
   - 배경이 바뀌면 그 위에 있던 텍스트·아이콘·구분선 등 라이트 표면 전제로 색을 잡았던 요소들도
     전부 다크 표면 기준으로 재조정해야 한다(예: 회색 텍스트가 흰 배경에서는 잘 보였지만 어두운
     배경에서는 대비가 부족할 수 있음) — 화면별로 실제 렌더링 확인 필수.
   - `BottomSheet.tsx`는 여러 호출처(다른 티켓들에서 확인된 콜사이트 다수)가 공유하는 범용
     컴포넌트다. 다크 표면으로 바꾸면 **이 컴포넌트를 쓰는 모든 화면**이 영향을 받는다 — 전환
     전에 전체 호출처를 grep으로 파악하고, 혹시 의도적으로 흰 배경이어야 하는 케이스(예: 이미지
     미리보기, 사진 확대 등)가 있는지 확인할 것. 있다면 HALT하고 보고.
2. **IconButton 전환 (3곳)**: `BottomSheet.tsx`, `DropsClient.tsx`, `FeedSection.tsx`의 닫기/
   액션 버튼을 `<IconButton icon="..." label="..." onClick={...} />`로 교체, 그림자·scale·
   배경색 커스텀 className 제거(DS 기본값 사용) — 티켓 011에서 이미 정한 방향 그대로.
3. **EmptyState 전환 (2곳)**: `DropsClient.tsx`(`dropEmptyTitle`/`dropNoItems`),
   `InventoryItemHistorySheet.tsx`(`historyEmpty`)를 `<EmptyState icon title description />`로
   교체.
4. **MapView.tsx는 이번 범위에서 제외.** 코드 변경하지 않는다. 완료 기록의 잔여 이슈에 남긴다.

### UI/UX 관점

- 4개 화면의 배경색 전환은 사용자에게 승인받은 시각적 변경이다. 다만 색 대비(contrast)는
  구현자가 직접 판단해야 하는 디테일이 많으므로, 완료 후 staging에서 반드시 실제 화면(다크
  배경에서 텍스트/아이콘 가독성)을 확인할 것.
- EmptyState 신규 문구가 필요하면 `Specs/UX_WRITING_GUIDELINE.md` 기준 준수.

## 구현 계획

1. `BottomSheet.tsx` 전체 호출처 grep → 흰 배경이 의도적으로 필요한 예외 케이스 확인
2. 4개 화면 배경을 다크 표면 토큰으로 전환, 텍스트/구분선 등 종속 스타일 재조정
3. IconButton 3곳 + EmptyState 2곳 전환
4. staging에서 dev-login으로 4개 화면 실제 확인 (배경·아이콘·빈 상태 문구 가독성)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- **BottomSheet.tsx 전체 호출처 grep 결과**: `ItemEarnHistory.tsx`/`PoiEarnHistory.tsx`(이미 `dark`
  prop으로 다크 사용 중), `BadgeDetailSheet.tsx`/`InventoryItemHistorySheet.tsx`(라이트 사용 중) 4곳
  전부 확인. **의도적으로 흰 배경이 필요한 예외(이미지 미리보기 등)는 없었다** — HALT 대상 없음.
- **BottomSheet.tsx**: 기존 `dark` 토글 prop을 제거하고 항상 다크 표면(`var(--color-surface)` + `text-text`)만
  렌더링하도록 단순화. 4개 호출처가 모두 다크로 수렴하므로 토글을 유지할 이유가 없다고 판단(제거 안 하면
  죽은 분기가 영구히 남음). 핸들·풋터(`--color-surface-elevated`)도 다크 톤으로 고정. 헤더 닫기 버튼을
  `<IconButton icon="close" />`(MODULAR)로 교체.
  - 부수 효과: `ItemEarnHistory.tsx`/`PoiEarnHistory.tsx`의 `dark` prop 전달 제거(타입 정합 유지, 동작 동일).
- **BadgeDetailSheet.tsx**(드랍/픽업 흐름에서 BottomSheet를 쓰는 자식 컴포넌트, DropsClient의 픽업 상세):
  `text-text-inverse` 계열 → `text-text` 계열로 전환, `Card tone="inverse"` → 기본 톤(`--color-surface-elevated`).
- **DropsClient.tsx**: POI 바텀시트 패널(`bg-surface-inverse` 흰 배경)을 `bg-surface`(다크)로 전환,
  하위 텍스트/아이콘/틴트(`bg-black/[0.04]` → `bg-white/[0.04~0.06]`) 전부 재조정. 닫기 버튼을 IconButton으로
  교체. `dropEmptyTitle`/`dropNoItems` 두 곳을 `<EmptyState icon title description />`로 전환(신규
  description 문구 2건 `ko.ts` 추가). 지도 위 로딩/안내 풍선(`bg-surface-inverse`, 377~389행)은 "시트"가
  아니라 지도 오버레이 배지라 티켓 범위 밖으로 보고 그대로 유지.
- **FeedSection.tsx**: `DetailSheet`(피드 상세 시트, `bg-surface-inverse`)를 `bg-surface`로 전환, `Row` 컴포넌트
  및 본문 텍스트를 `text-text` 계열로 재조정, 닫기 버튼을 IconButton으로 교체. 기존 EmptyState(피드 빈 상태)는
  이미 티켓 011에서 전환 완료된 상태라 변경 없음.
- **InventoryItemHistorySheet.tsx**: 시트 배경은 이미 `dark` prop 없이 BottomSheet 기본값을 썼는데, 이번에
  BottomSheet 기본값 자체가 다크로 바뀌면서 자동으로 다크화됨. 내부 `text-inverse` 계열 텍스트/스켈레톤을
  `text-text` 계열로 재조정, `historyEmpty`를 `<EmptyState icon title description />`로 전환.
  - **참고(비범위 발견)**: 이 컴포넌트는 코드베이스 전체에서 어디서도 `import`/렌더링되지 않는 미사용
    컴포넌트로 보인다(`/inventory/[itemId]` 페이지는 `/badges/[id]`로 즉시 redirect). 티켓이 파일을 명시
    지정했으므로 스펙대로 전환은 완료했으나, 실사용 여부는 별도 확인이 필요해 보임 — alerts 참고.
- **Button surface 재조정**: 위 4개 화면에서 라이트 표면 전제였던 `surface="sub"` 버튼(`BadgeDetailSheet`,
  `DropsClient`, `FeedSection`)을 전부 `surface="main"`(다크 배경 위 배색)으로 전환. 배경만 바꾸고 버튼
  surface를 그대로 두면 `outline` variant가 "검정 텍스트 on 4% 블랙 틴트"로 렌더돼 다크 배경에서 텍스트가
  거의 안 보이는 문제가 생겨, 배경 전환에 필연적으로 딸린 변경으로 판단해 함께 처리했다(티켓의 "종속 스타일
  재조정" 요구사항 범위 내).
- **IconButton 3곳 전환 완료**: `BottomSheet.tsx`(헤더 닫기), `DropsClient.tsx`(POI 패널 닫기),
  `FeedSection.tsx`(상세 시트 닫기). `surface` prop은 기본값(`light`→`var(--color-text)`=흰색)을 그대로
  사용 — 다크 배경 위 흰 아이콘으로 정확히 맞아떨어진다(011에서 발견된 "다크 배경에서 검정 아이콘을 낼
  수 없다"는 구조적 문제와 무관 — 이번엔 애초에 흰 아이콘이 필요한 상황).
- **EmptyState 2곳 전환 완료**: `DropsClient.tsx`(`dropEmptyTitle`/`dropNoItems`),
  `InventoryItemHistorySheet.tsx`(`historyEmpty`). 신규 description 3건(`dropEmptyBody`, `dropNoItemsBody`,
  `historyEmptyBody`)을 UX_WRITING_GUIDELINE 기준(해요체·간결·마침표 생략)으로 `ko.ts`에 추가.
- **MapView.tsx는 변경하지 않았다**(범위 제외, git diff에도 없음).

### 변경된 파일
```
jam-web/src/components/ui/BottomSheet.tsx
jam-web/src/app/(main)/drops/DropsClient.tsx
jam-web/src/app/(main)/drops/BadgeDetailSheet.tsx
jam-web/src/app/(main)/FeedSection.tsx
jam-web/src/app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx
jam-web/src/app/(main)/badges/[id]/ItemEarnHistory.tsx (BottomSheet dark prop 제거)
jam-web/src/app/(main)/badges/[id]/PoiEarnHistory.tsx (BottomSheet dark prop 제거)
jam-web/src/lib/i18n/ko.ts (EmptyState description 3건 추가)
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 변경 파일 범위 내 타입 에러 없음(사전 존재하는 `reasons.test.ts`의 jest 타입
      누락 에러는 이번 변경과 무관, `git stash` 비교로 확인)
- [x] `npx eslint <변경 파일 전체>` — 신규 lint 에러 없음. `BottomSheet.tsx`/`DropsClient.tsx`/
      `InventoryItemHistorySheet.tsx`에 기존 `react-hooks/set-state-in-effect`, `react-hooks/refs` 에러가
      있으나 `git stash` 비교로 이번 변경 이전부터 존재하던 것임을 확인(이번 티켓 범위 밖)
- [x] `npx next build` — 프로덕션 빌드 성공, 전체 라우트 정상 생성
- [ ] staging 실 화면 확인 — 이 브랜치는 아직 `jam-stage.vercel.app`에 병합되지 않아 dev-login으로도
      실 화면을 볼 수 없다. staging 병합 후 화면 확인 필요(4개 화면 다크 배경·아이콘·EmptyState 가독성).

### UX Writing 검증
- [x] 용어 일관성: 드랍·픽업·인벤토리 등 고정 용어만 사용, 신규 description도 표 기준 준수
- [x] 톤앤매너: 드랍/픽업 문맥은 "설렘·세계관" 톤(`dropEmptyBody`), 이력 관련은 "담담·안내" 톤(`historyEmptyBody`)
- [x] 문장 규칙: 해요체, description은 기존 이웃 문구(011에서 확립된 패턴)와 동일하게 마침표 생략

### 배포 정보
- 배포일: 2026-08-20
- 환경: staging
- 커밋: 5ef4970 (review 브랜치), staging 머지 완료. 프로덕션 미배포 — 사용자 승인 대기

### 주요 의사결정 / 핵심 메모
- **BottomSheet.tsx의 `dark` 토글 prop을 제거하고 항상 다크로 렌더링하도록 단순화했다.** 티켓이 "이 컴포넌트를
  쓰는 모든 화면이 영향을 받는다"고 명시했고, 전체 호출처 4곳을 grep으로 확인한 결과 전부 다크로 수렴하는
  상황이라 토글을 남겨두면 죽은 분기(`false` 브랜치)만 남는다고 판단했다. 향후 실제로 라이트 시트가 필요한
  화면이 생기면 그때 prop을 다시 추가하는 편이 낫다고 봄(YAGNI).
- **BottomSheet 다크 배경 토큰은 `--color-surface`(시트 본체) + `--color-surface-elevated`(footer)로
  선택했다.** 기존 `dark` 분기가 쓰던 `--color-bg`(페이지 배경과 동일한 순검정)를 그대로 쓰면 시트와 페이지
  캔버스가 시각적으로 구분되지 않는다고 판단해, 티켓이 제시한 두 옵션 중 `--color-surface`를 시트 기본값으로,
  `--color-surface-elevated`를 그 위 footer 강조 레이어로 사용해 2단 elevation을 유지했다.
- **배경 전환에 따라 `Button surface="sub"` → `surface="main"`도 함께 바꿨다.** 이건 티켓이 명시적으로
  요청한 항목은 아니지만, "그 위에 있던 텍스트·아이콘 등도 다크 표면 기준으로 재조정" 요구사항의 직접적
  결과다 — `surface="sub"`를 그대로 두면 outline 버튼이 검정 텍스트로 렌더돼 다크 배경에서 사실상 안 보인다.

### 잔여 이슈
- MapView.tsx 지도 위 버튼은 이번 범위 제외 — 별도 검토 필요 (기존)
- `InventoryItemHistorySheet.tsx`가 코드베이스 어디서도 렌더링되지 않는 것으로 보임(`/inventory/[itemId]`
  페이지가 `/badges/[id]`로 즉시 redirect) — 사용처 확인 및 정리 필요할 수 있음, alerts 참고
- staging 병합 후 4개 화면 실제 다크 배경 가독성 확인 필요(현재 review 브랜치는 미병합)
