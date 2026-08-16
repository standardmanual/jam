# Storybook Content Audit — UX Writing 준수 검토

> 기준 문서: `Service Plan/Specs/UX_WRITING_GUIDELINE.md`
> 검토일: 2026-08-16
> 검토 범위: `jam-web/design-system/components/**/*.stories.tsx` 전체

---

## 검토 요약

| 구분 | 건수 | 처리 |
|---|---|---|
| A급 — 공식 용어 위반 | 7건 | 전체 수정 |
| B급 — 해요체 위반 (합니다체) | 31건 | 전체 수정 |
| C급 — CTA 규칙 위반 | 3건 | 전체 수정 |
| DECISION REQUIRED | 2건 | 별도 보고 |
| PASS | 나머지 전체 | — |

---

## A급 — 공식 용어 위반

가이드라인 §1.3 "용어 일관성" 기준. **고정 용어 외의 표현은 사용 금지.**

### A-1. `조합` → `믹스 (MIX)` — Accordion.stories.tsx

| 위치 | 수정 전 | 수정 후 |
|---|---|---|
| FAQ 3번 제목 | `배지를 조합할 수 있나요?` | `배지를 믹스할 수 있나요?` |
| FAQ 3번 본문 | `아이템 배지를 조합하면` | `아이템 배지를 믹스하면` |
| FAQ 3번 본문 | `인벤토리에서 조합을 시도해 보세요.` | `인벤에서 믹스해 보세요.` |

**근거**: 가이드라인 §1.3 — `믹스 (MIX)` 고정 용어. `X: 조합, 합성`

### A-2. `인벤토리` → `인벤 (INVENTORY)` — 3개 파일

| 파일 | 위치 | 수정 전 | 수정 후 |
|---|---|---|---|
| `Accordion.stories.tsx` | FAQ 3번 본문 | `인벤토리에서` | `인벤에서` |
| `TopNav.stories.tsx` | `WithMultipleRight` story `title` | `인벤토리` | `인벤` |
| `TabBar.stories.tsx` | `Inventory` story `name` | `인벤토리 활성` | `인벤 활성` |

**근거**: 가이드라인 §1.3 — `인벤 (INVENTORY)` 고정 용어. `X: 인벤토리, 보관함, 창고`

### A-3. `스트라바` → `Strava` (영문 고정) — 2개 파일

| 파일 | 위치 | 수정 전 | 수정 후 |
|---|---|---|---|
| `Accordion.stories.tsx` | FAQ 1번 본문 | `스트라바 활동을 동기화하면` | `Strava 활동을 동기화하면` |
| `EmptyState.stories.tsx` | `WithAction` description | `스트라바 계정을 연결하고` | `Strava를 동기화하고` |

**근거**: 가이드라인 §1.3 — `Strava 동기화 (Strava Sync)`. `X: 스트라바 계정 연결`

### A-4. `스트라바 연결` → `Strava 동기화` — EmptyState.stories.tsx

| 위치 | 수정 전 | 수정 후 |
|---|---|---|
| `WithAction` action label | `스트라바 연결` | `Strava 동기화` |

**근거**: 가이드라인 §1.3 — `Strava 동기화 (Strava Sync)` 고정 용어. `X: 스트라바 계정 연결`

### A-5. TopNav title 의미 오류 — TopNav.stories.tsx

| Story | 수정 전 | 수정 후 | 근거 |
|---|---|---|---|
| `WithRightSlot` | `title: '배지 상세'` | `title: '배지'` | TopNav title = back-label (어디로 돌아가는가). 배지 상세는 현재 화면명이므로 위반. 배지 목록으로 돌아가므로 `'배지'` |

**근거**: 가이드라인 §6 — "TopNav title은 항상 '어디로 돌아가는가'를 뜻하는 back-label이다. 현재 화면명이 아니다."

---

## B급 — 해요체 위반 (합니다체 → 해요체)

가이드라인 §2.1 "대화하듯 자연스러운 '해요체'" 기준.

### Toast.stories.tsx

| Story | 수정 전 | 수정 후 |
|---|---|---|
| `Success` | `배지를 획득했습니다!` | `배지를 획득했어요!` |
| `Error` | `동기화에 실패했습니다. 다시 시도해 주세요.` | `Strava 동기화가 끊겼어요. 다시 동기화해 보세요.` |
| `Info` | `오늘의 미션이 업데이트되었습니다.` | `오늘의 미션이 업데이트됐어요.` |
| `LongMessage` | `네트워크 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.` | `네트워크 연결이 불안정해요. 잠시 후 다시 시도해 보세요.` |
| `Interactive` (success) | `배지를 획득했습니다!` | `배지를 획득했어요!` |
| `Interactive` (error) | `오류가 발생했습니다.` | `오류가 발생했어요.` |
| `Interactive` (info) | `새 미션이 추가되었습니다.` | `새 미션이 추가됐어요.` |

> **추가 수정** — `Error` 스토리: "동기화에 실패했습니다"는 시스템 언어(§1.1 위반). 사용자 언어로 교체 → "Strava 동기화가 끊겼어요."

### ModalToast.stories.tsx

| Story | 수정 전 | 수정 후 |
|---|---|---|
| `Success` | `배지를 획득했습니다!` | `배지를 획득했어요!` |
| `Error` | `오류가 발생했습니다. 다시 시도해 주세요.` | `오류가 발생했어요. 다시 시도해 보세요.` |
| `Info` | `새로운 미션이 추가되었습니다.` | `새로운 미션이 추가됐어요.` |
| `WithBadgeFrame` | `새로운 배지를 획득했습니다!` | `새로운 배지를 획득했어요!` |
| `WithMythicBadge` | `신화 등급 배지를 획득했습니다!` | `신화 등급 배지를 획득했어요!` |
| `Interactive` | `작업이 완료되었습니다.` | `완료됐어요.` (시스템 언어→사용자 언어도 함께 수정) |

### Accordion.stories.tsx

| 항목 | 수정 전 | 수정 후 |
|---|---|---|
| FAQ 1번 본문 | `배지가 지급됩니다.` | `배지를 획득해요.` (합니다체 + 공급자 언어 동시 위반) |
| FAQ 2번 본문 | `아이템 배지입니다.` | `아이템 배지예요.` |
| FAQ 2번 본문 | `달라집니다.` | `달라져요.` |
| FAQ 3번 본문 | `만들 수 있습니다.` | `만들 수 있어요.` |

### BottomSheet.stories.tsx

| Story | 항목 | 수정 전 | 수정 후 |
|---|---|---|---|
| `WithActions` | title | `삭제하시겠습니까?` | `정말 삭제할까요?` |
| `WithActions` | description | `이 작업은 되돌릴 수 없습니다.` | `이 작업은 되돌릴 수 없어요.` |
| `Interactive` | title | `확인이 필요합니다` | `확인이 필요해요` |
| `Interactive` | description | `오버레이 클릭 또는 Escape 키로 닫을 수 있습니다.` | `배경을 누르거나 Escape 키를 누르면 닫혀요.` |

### Card.stories.tsx

| Story | 항목 | 수정 전 | 수정 후 |
|---|---|---|---|
| `WithContent` (미션 카드) | description | `5km 달리기를 완료하면 배지를 획득합니다.` | `5km 달리기를 완료하면 배지를 획득해요.` |

### EmptyState.stories.tsx

| Story | 항목 | 수정 전 | 수정 후 |
|---|---|---|---|
| `Default` | title | `아직 배지가 없습니다` | `아직 배지가 없어요` |
| `Default` | description | `배지를 획득할 수 있습니다.` | `배지를 획득할 수 있어요.` |
| `WithAction` | title | `아직 배지가 없습니다` | `아직 배지가 없어요` |
| `NoIcon` | title | `검색 결과가 없습니다` | `검색 결과가 없어요` |
| `TitleOnly` | title | `미션이 없습니다` | `미션이 없어요` |
| `WithCustomIcon` | title | `아직 기록이 없습니다` | `아직 기록이 없어요` |
| `WithCustomIcon` | description | `기록이 표시됩니다.` | `기록이 표시돼요.` |
| `SearchEmpty` | title | `검색 결과가 없습니다` | `검색 결과가 없어요` |

### Textarea.stories.tsx

| Story | 항목 | 수정 전 | 수정 후 |
|---|---|---|---|
| `WithValue` | value | `10km 달렸습니다.` | `10km 달렸어요.` |
| `SuccessState` | value | `내용이 저장되었습니다.` | `저장됐어요.` |
| `Disabled` | value | `수정할 수 없는 내용입니다.` | `수정할 수 없는 내용이에요.` |

### Checkbox.stories.tsx

| Story | 항목 | 수정 전 | 수정 후 |
|---|---|---|---|
| `SuccessState` | label | `인증되었습니다` | `인증됐어요` |

---

## C급 — CTA 규칙 위반

가이드라인 §5.1 "예측 가능한 행동 동사 사용". **Bad: 확인, 다음, 실행, 완료**

### BottomSheet.stories.tsx

| Story | 수정 전 | 수정 후 | 근거 |
|---|---|---|---|
| `Open` | `<Button>확인</Button>` | `<Button>닫기</Button>` | "확인"은 Bad CTA. 닫기 동작이므로 `닫기`로 명확화 |
| `Interactive` (dismiss) | `<Button>확인</Button>` | `<Button>닫기</Button>` | 동일 |

---

## DECISION REQUIRED

규칙상 판단이 불가능한 항목. 서비스 담당자 확인 필요.

### DR-1. Checkbox label의 해요체 — Checkbox.stories.tsx

**현황**: `label: '동의합니다'` (Unchecked, Checked 스토리)

**배경**: 가이드라인 §2.1은 전반적으로 해요체를 규정하지만, 체크박스 동의 레이블은 서비스마다 관례가 다름. "동의해요"는 한국어 어감상 어색할 수 있고, "동의합니다"는 약관 동의의 법적 명확성에 더 적합할 수 있음.

**선택지**:
- `동의해요` — 가이드라인 해요체 원칙 적용 (약간 어색하나 일관성 확보)
- `동의합니다` — 현행 유지 (약관 체크박스 관례 존중)
- `약관에 동의해요` — 해요체이면서 명확성 확보

**권장**: 실제 서비스의 약관 화면 copy 기준으로 결정. Storybook 데모는 현행 `동의합니다` 유지 가능 (단, 실제 서비스 화면에는 가이드라인 적용 필수).

---

### DR-2. RarityBadge "전설의 배지" 명칭 — RarityBadge.stories.tsx

**현황**: `'전설의 배지'` (OnCard 스토리에서 배지 이름으로 사용)

**배경**: 가이드라인 §1.3 희귀도 등급명은 `Legend` (영문 고정). 그러나 `'전설의 배지'`는 배지의 *이름*이지 희귀도 *등급 레이블*이 아님. 배지 이름에 "전설"을 쓰는 것이 Legend 등급과의 혼동을 일으키는지 판단 필요.

**선택지**:
- 현행 유지 — 배지 이름은 자유롭게 지을 수 있으며, 이 경우는 데모 예시임
- 변경 — Legend 등급 혼동 방지를 위해 `'100km 러너'` 등 다른 이름 사용

**권장**: 배지 이름은 콘텐츠 영역으로, 희귀도 레이블 표시와 구분되면 문제 없음. 데모용으로 현행 유지 가능.

---

## PASS 항목 (이슈 없음)

| 컴포넌트 | 판단 근거 |
|---|---|
| `Button.stories.tsx` | `'버튼'` — 컴포넌트 데모용 generic placeholder, 서비스 copy 아님 |
| `IconButton.stories.tsx` | `label: '뒤로'` — 가이드라인 §6 `d.common.back` 준수. 나머지 label도 정확한 기능 서술 |
| `RarityBadge.stories.tsx` | `Common / Rare / Legend / Mythic` — 가이드라인 §1.3 영문 표기 준수 |
| `BadgeFrame.stories.tsx` | 희귀도 색상 레이블 영문 고정 준수 |
| `ShapeTag.stories.tsx` | children은 컴포넌트 내부 demo 값 (LABEL, PILL TAG 등), 서비스 copy 아님 |
| `SlidingTabs.stories.tsx` | 탭 레이블 (`전체, 러닝, 사이클링` 등) — 활동 유형명, 가이드라인 위반 없음 |
| `TabBar.stories.tsx` | 탭 key 이름 (today, badges, drops 등) — 내부 식별자 |
| `BottomSheet/LongContent` | `'배지 상세 정보'` — BottomSheet title은 back-label이 아니라 시트 제목. §6은 TopNav에만 적용. 적합 |
| `Input.stories.tsx` | placeholder `'닉네임을 입력하세요'` 등 — 가이드라인 미적용 영역 (placeholder 톤 미규정) |
| `Select.stories.tsx` | placeholder `'활동 유형 선택'` — 간결 OK |
| `Checkbox/Group` | `'서비스 이용약관 (필수)'` 등 — 약관 레이블 정확 |
| `WanderingEyesLoader.stories.tsx` | user-facing copy 없음 (기술 데모) |
| `Skeleton.stories.tsx` | user-facing copy 없음 (기술 데모) |

---

## 수정 파일 목록

총 **10개 파일** 수정 (41건):

```
design-system/components/cards/Card.stories.tsx
design-system/components/navigation/TopNav.stories.tsx
design-system/components/navigation/TabBar.stories.tsx
design-system/components/navigation/Accordion.stories.tsx
design-system/components/navigation/BottomSheet.stories.tsx
design-system/components/feedback/Toast.stories.tsx
design-system/components/feedback/ModalToast.stories.tsx
design-system/components/feedback/EmptyState.stories.tsx
design-system/components/forms/Textarea.stories.tsx
design-system/components/forms/Checkbox.stories.tsx
```

---

## 핵심 패턴 정리

이번 감사에서 반복적으로 나타난 패턴:

1. **합니다체 → 해요체** — `~습니다/합니다/됩니다/있습니다` 전면 대체 필요. 가장 빈번한 위반.
2. **공급자 언어 → 사용자 언어** — `지급됩니다` → `획득해요`, `업데이트되었습니다` → `업데이트됐어요`
3. **Strava 표기** — 한국어 `스트라바`는 금지. 영문 `Strava` 고정.
4. **믹스/인벤** — `조합`, `인벤토리`는 가이드라인 금칙어.
5. **CTA `확인`** — 가이드라인 §5.1 Bad 목록. 동작을 설명하는 동사로 교체.
