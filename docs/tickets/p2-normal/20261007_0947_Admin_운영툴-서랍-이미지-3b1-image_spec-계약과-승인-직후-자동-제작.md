---
id: "20261007_0947"
category: Admin
priority: P2
status: CLOSED
created: 2026-10-07
closed: 2026-10-07
parent: "20261007_0946"
specs:
  - "docs/plan/vision/07 JAM! 라이브 운영 블루프린트.md"
  - "docs/service/prd/ops-tool/PRD.md"
---

# [Admin] 운영툴 서랍 이미지 ③-b1 image_spec 계약과 승인 직후 자동 제작

## 핵심 요약

- 요구사항: 기획안의 `image_spec`(`{ preset_id, bg, end, values }`)을 읽고, **승인 직후** 운영자 브라우저가 ③-a 엔진으로 이미지를 만들어 저장 API에 올린다. 실패해도 승인은 유지되고 토스트로 알린다(「이미지 제작 필요」로 남기는 표시와 서랍 버튼은 ③-b2). 시험 묶음·이미지 칸 없는 종류·지시 없음은 건너뛴다. 일괄 승인은 제외한다.
- 선행: ③-a 20261007_0945(CLOSED). 결정 정본은 0946 「착수 결정」.
- 화면 변화: 승인 뒤 토스트(만드는 중·완료·실패) 외에는 없다.
- 관련 파일: 아래 표. 작업 유형 `admin`.

## 카리나 가정

1. 제출 검사(`validate.ts`)에는 경고 장치가 없어 건드리지 않는다. 형식이 틀린 `image_spec`은 읽는 쪽(`readImageSpec`)이 「이미지 지시가 올바르지 않아요」로 처리하고 자동 제작을 건너뛴다(0946 「착수 결정」 1의 「경고만」을 이렇게 구현한다).
2. 시드는 `makeHomeFeedCardArgs.mjs`의 `seedFromBundleId`와 같은 값이어야 한다. TS로 옮겨 쓰고 `.mjs`와의 대조 테스트를 둔다(.mjs는 고치지 않는다).
3. 제작 상태는 승인 뒤 사라지는 `OpsItemActions`가 아니라 두 화면이 공유하는 `useOpsItemResultHandlers`(`OpsItemFooter.tsx` 38~95줄) 쪽 상태에 둔다. 제작 중에는 탭을 닫으면 경고한다(`beforeunload`).
4. 이미지 흐름은 순수 비동기 함수(`itemImageFlow.ts`, 렌더와 업로드를 주입받음)로 만들어 jsdom 없이 테스트한다(이 프로젝트에는 jsdom이 없다).
5. `imageKeyOfKind`는 서버 전용 `opsInbox/image.ts`(`@supabase` 계열 import)에 있어 클라이언트가 못 쓴다. 순수 파일 `imageTarget.ts`로 옮기고 `image.ts`는 거기서 다시 내보낸다(이름·동작 불변).
6. 승인 응답 뒤 `router.refresh()`로 항목이 `approved`가 된 상태에서 제작 요청을 보낸다(서버는 승인됨을 받는다). 업로드가 끝나면 한 번 더 새로고침해 미리보기에 이미지가 보이게 한다.

## 구현 계획

> 2026-10-07 카리나 규모 사전 판정: 파일 9~10개(신규 5, 수정 3, 문서 1~2), 코드 약 300줄·테스트 약 260줄. 임계값(5개 초과 또는 100줄 이상)을 넘기므로 파일 단위 계획과 사용자 승인(2026-10-07 「제안대로 실행해」, ③-b를 b1·b2로 나눔)으로 첫 호출부터 계획 반환 면제로 진행한다.

| 경로 | 대상 | 변경 | 코드/테스트(추정) |
|---|---|---|---|
| `jam-web/src/lib/admin/opsInbox/imageTarget.ts`(신규, 순수) | `readImageSpec(item)`, `seedFromBundleId(bundleId)`, `imageKeyOfKind(kind)` | 항목의 `edited ?? original`에서 `image_spec`을 읽어 `{ presetId, bg, end, values }` 또는 사유(`missing`·`invalid`·`no_image_kind`)를 돌려준다. 색은 `#RRGGBB`, `values` 키는 `text01`·`img01` 형식만 허용 | 90/110 |
| `jam-web/src/lib/admin/opsInbox/image.ts` | 33~48줄 `imageKeyOfKind` | 순수 파일에서 가져와 다시 내보내기(동작 불변) | 4/— |
| `jam-web/src/components/admin/ops/itemImageFlow.ts`(신규, 순수) | `makeItemImage({ bundleId, itemId, kind, isSample, item, render, post })` | 시험 묶음·종류·지시 없음 판정 → `render`(③-a `renderPresetToPngBlob`) → `post`(③-a `postItemImage`). 던지지 않고 `{ status: 'done' \| 'skipped' \| 'failed', reason, message }`. 한국어 안내문 | 70/90 |
| `jam-web/src/components/admin/ops/OpsItemFooter.tsx` | `useOpsItemResultHandlers`(38~95줄), `OpsItemFooter` 143줄 `onDecided` | 승인 성공 뒤 이미지 제작 시작(`startItemImage`)·진행 상태·토스트·`beforeunload` 경고·완료 뒤 새로고침. 일괄 승인은 연결하지 않음 | 60/30 |
| `jam-web/src/components/admin/ops/OpsItemActions.tsx` | `run`(185~196줄) | 변경 없음이 목표(`onDecided`에 항목 ID가 이미 있음). 필요하면 확인창 문구에 「이미지도 만들어요」 한 줄 | 0~8/— |
| 테스트(신규 2 + 기존 보강) | `imageTarget.test.ts`, `itemImageFlow.test.ts`, `itemFooter.test.tsx` 보강 | 칸 검사·시드 대조(`.mjs`와 같은 값)·건너뜀 사유·실패 시 던지지 않음·승인 유지 | -/(위 표에 포함) |
| `docs/service/prd/ops-tool/PRD.md` | §3.1 표 78·80줄, §8.8, §13 D행 | `image_spec` 칸 규칙(세 칸, 형식, 칸 없음 처리, 일괄 승인 제외, 같은 시드) | 문서 30 |

## 완료 조건

- [ ] 서랍·기획 상세에서 승인하면 이미지가 만들어져 항목에 붙고, 예약된 뒤에는 자원에도 붙는다(저장 API 경로).
- [ ] 이미지 제작이 실패해도 승인은 유지되고 실패 이유가 토스트로 보인다. 예약 등록은 이미지 때문에 막히지 않는다.
- [ ] 시험 묶음·이미지 칸 없는 종류·`image_spec` 없음·형식 오류는 건너뛰고 이유를 알린다. 일괄 승인은 제작하지 않는다.
- [ ] 같은 항목의 시드가 서버 스크립트와 같다(대조 테스트).
- [ ] 클라이언트 모듈이 서버 전용 코드를 import하지 않는다.

---
## 완료 기록

### 구현 내용 요약

**머지하지 않고 대체됨으로 닫는다(구현물은 폐기).** 브랜치 `claude/jamwork-20261007_0947-image-spec-auto`(커밋 0a3aef377)에는 `imageTarget.ts`(image_spec 읽기·시드 대조), `itemImageFlow.ts`(승인 직후 렌더→업로드, 던지지 않음), `useOpsItemResultHandlers.startItemImage`가 있고 게이트는 PASS였다. 다른 세션이 정본 `imageSpec.ts`(1030, staging 머지)와 1031을 진행해 같은 기능이 두 벌이 되므로 쓰지 않는다. 브랜치는 참고용으로 남긴다.

게이트에서 나온 지적(1031에 참고): ① 업로드가 던진 예외에도 「이미지 지시를 확인하고」라는 렌더 실패 문구가 나온다(`itemImageFlow.ts` 60줄, 원인 구분 필요). ② 서랍을 닫아 훅이 사라지면 제작 완료 뒤 새로고침이 낡은 상태일 수 있다. ③ 순수 비동기 흐름 함수(렌더·업로드 주입)로 만들면 jsdom 없이 단위 테스트가 된다.

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/service/writing/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | 아현·민지 | 109,206 | 24,719 / 3,226 | 13분 36초 | 43 |
| 합계 | 2 | 109,206 | 24,719 / 3,226 | 13분 36초 | 43 |

### 주요 의사결정 / 핵심 메모
- 대체됨: 같은 ③-b를 다른 세션이 1030·1031·1032로 먼저 나눠 올려 중복이 생겼다. 사용자 결정(2026-10-07)으로 이 티켓은 머지하지 않고 닫는다.

### 잔여 이슈
-
