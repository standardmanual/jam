---
id: "20261102_1711"
category: UI
priority: P2
status: IN_PROGRESS
created: 2026-11-02
---

# [UI] 본문 문단의 text-pretty를 text-balance로 통일해 전 텍스트에 줄바꿈 기본값을 적용한다

## 핵심 요약

- 요구사항: 디자인시스템과 서비스(어드민 포함)의 모든 텍스트에 `word-break: keep-all`과 `text-wrap: balance`가 적용된다. 전역 기본값은 이미 있으므로, 이 값을 덮어쓰는 `text-pretty`(81개 파일, 142줄)를 `text-balance`로 통일하고 규칙 문서를 맞춘다.
- 구현 계획: ① 81개 파일의 `text-pretty` 토큰을 `text-balance`로 치환 ② 디자인시스템 안의 옛 값(`word-break: break-word`) 3곳을 `keep-all` + `overflow-wrap: break-word`로 교체 ③ 규칙 문서 6곳에서 «본문 = pretty» 서술을 걷어냄 ④ 재발 방지 시험 1개를 추가
- 관련 파일: 아래 「구현 계획」의 파일 단위 목록 참조. 전역 기본값 위치는 `jam-web/src/app/globals.css:418-437`(`body`, `h1~h6`, `p`)와 `jam-web/design-system/styles.css:11-24`다.

## 배경 / 문제 정의

- 전역 기본값은 2026-10-27에 `body`, `h1`~`h6`, `p`에 반영되었다. 두 속성 모두 상속되므로 `span`, `li`, `td`, `button` 같은 요소에도 대부분 적용된다.
- 그러나 여러 줄 본문 문단 약 140곳이 `text-pretty`를 따로 달고 있어 `balance`가 적용되지 않는다. UX 라이팅 가이드 §3.2가 «여러 줄 본문 문단은 `text-pretty`»로 정한 결과이며, 2026-11-02 사용자가 «모든 텍스트에 balance 적용»으로 방향을 바꿨다(문답: 본문 문단도 전부 balance로 통일).
- 디자인시스템 안에는 한국어를 글자 단위로 끊는 옛 값 `word-break: break-word`가 3곳 남아 있다(`support.js:104`, `IconCatalog.jsx:352`, `BadgeFrame.stories.tsx:69`).

## 상세 요구사항

### 서비스/코드베이스 관점

- `jam-web` 아래 `text-pretty`(Tailwind 클래스)는 시험·스토리 파일까지 모두 `text-balance`로 바꾼다. 같은 `className`에 `text-balance`가 이미 있으면 한 번만 남긴다.
- `src/app/globals.css`와 `design-system/styles.css`의 기본값 선언은 그대로 둔다(이미 `body`, `h1~h6`, `p`에 있다). 다만 «상속으로 모든 요소에 적용된다»는 설명 주석을 한 줄 더한다.
- 의도적으로 남기는 예외: `break-all`이 걸린 오류 메시지·URL·식별자 표시 5곳(`src/app/error.tsx:49`, `src/app/admin/error.tsx:47`, `src/app/admin/activity-badge-image/page.tsx:621`, `src/components/admin/ops/OpsPatternDetail.tsx:148`, `OpsPatternList.tsx:140`), 디자인시스템 안내 스토리의 `Fonts.stories.tsx:39`. 한국어 문장이 아니라 원문 문자열이기 때문이다.
- 범위 밖: 공유 이미지를 그리는 캔버스(`src/app/(main)/badges/[id]/buildBadgeShareBlob.ts`의 `fillText`)는 CSS를 받지 않는다. 별도 티켓 후보로 남긴다.

### UI/UX 관점

- 본문 문단의 줄 길이가 고르게 맞춰진다. 단, 브라우저가 `balance`를 6줄(Chrome 계열)까지만 적용하므로 그보다 긴 문단은 평소처럼 채워진다.

## 구현 계획

1. **치환**: `cd jam-web && git grep -l 'text-pretty' -- . | xargs sed -i '' 's/text-pretty/text-balance/g'`로 아래 81개 파일을 바꾼다. 치환 뒤 같은 `className`에 `text-balance`가 두 번 나온 곳은 하나로 합친다(`git grep -nE 'text-balance.*text-balance'`로 확인).
2. **주석 정리**: `src/app/(main)/combine/TierUpPanel.tsx:30`의 주석(«문단은 `text-pretty`, 짧은 안내는 `text-balance`»)을 «문단과 짧은 안내 모두 `text-balance`»로 고친다.
3. **시험 단언 갱신**: 아래 7개 시험 파일은 `text-pretty` 단언을 `text-balance`로 바꾼다(치환에 포함).
4. **디자인시스템 옛 값 교체**: `design-system/support.js:104`는 `word-break:break-word`를 `word-break:keep-all;overflow-wrap:break-word`로, `design-system/components/icons/IconCatalog.jsx:352`와 `design-system/components/cards/BadgeFrame.stories.tsx:69`는 `wordBreak: 'break-word'`를 `wordBreak: 'keep-all', overflowWrap: 'break-word'`로 바꾼다.
5. **규칙 문서**: `docs/service/writing/UX_WRITING_GUIDELINE.md` §3.2에서 «여러 줄 본문 문단 = `text-pretty`» 행과 관련 서술을 걷어내고 «모든 텍스트에 balance가 기본이며 6줄을 넘는 문단은 브라우저가 평소처럼 채운다»를 적는다. `jam-web/DESIGN.md:61`, `jam-web/design-system/readme.md:20`, `jam-web/design-system/tokens/typography.css:10` 주석, `jam-web/design-system/foundations/Typography.stories.tsx:110`의 설명, `.claude/agents/jam-developer.md:60`, `.claude/skills/jam-design/references/ui-review-checklist.md:91`에서 `text-pretty` 서술을 걷어낸다.
6. **재발 방지 시험**: `jam-web/src/app/__tests__/korean-wrap-global.test.ts`를 새로 만든다. (가) `globals.css`와 `design-system/styles.css`의 `body`와 `h1~h6, p` 블록에 `text-wrap: balance`와 `word-break: keep-all`이 모두 있다. (나) `jam-web/src`와 `jam-web/design-system`(시험·`uploads` 제외)에 `text-pretty`, `text-wrap: pretty`, `textWrap: 'pretty'`, `word-break: break-word`, `wordBreak: 'break-word'`가 없다.
7. **검사**: `cd jam-web && npm run lint && npm run typecheck && npx vitest run <바뀐 시험 7개 + 신규 시험>` 후 `npm run ds:check`. 디자인시스템 파일을 건드리므로 `UPLOAD_STALE` 경고는 예상되며 업로드는 티켓 20261016_2220(대기)이 맡는다.

### 변경 대상 파일 (`git grep -l text-pretty`)

총 81개(시험 7개 포함).

- `jam-web/src/app/(legal)/probability/page.tsx`
- `jam-web/src/app/(main)/OnboardingQuestCard.tsx`
- `jam-web/src/app/(main)/OnboardingQuestSkipSheet.tsx`
- `jam-web/src/app/(main)/SuspensionBanner.test.tsx`
- `jam-web/src/app/(main)/SuspensionBanner.tsx`
- `jam-web/src/app/(main)/collections/[id]/UnslotAllSheet.tsx`
- `jam-web/src/app/(main)/combine/CombineClient.tierUp.test.tsx`
- `jam-web/src/app/(main)/combine/CombineClient.tsx`
- `jam-web/src/app/(main)/combine/PendingResultsSheet.test.tsx`
- `jam-web/src/app/(main)/combine/PendingResultsSheet.tsx`
- `jam-web/src/app/(main)/combine/TierUpCollectionPicker.tsx`
- `jam-web/src/app/(main)/combine/TierUpPanel.tsx`
- `jam-web/src/app/(main)/drops/BadgeDetailSheet.tsx`
- `jam-web/src/app/(main)/inventory/[itemId]/LockedItemDetail.tsx`
- `jam-web/src/app/(main)/missions/[id]/MissionDetailClient.tsx`
- `jam-web/src/app/(onboarding)/onboarding/TribeStep.tsx`
- `jam-web/src/app/admin/ambient-drop/AmbientDropForm.tsx`
- `jam-web/src/app/admin/ambient-drop/__tests__/ambient-form.test.tsx`
- `jam-web/src/app/admin/ambient-drop/page.tsx`
- `jam-web/src/app/admin/assets/ShapeStudioPanel.tsx`
- `jam-web/src/app/admin/badge-metric-labels/page.tsx`
- `jam-web/src/app/admin/badges/BadgeConditionSection.tsx`
- `jam-web/src/app/admin/balance/dashboard/page.tsx`
- `jam-web/src/app/admin/balance/page.tsx`
- `jam-web/src/app/admin/dev-board/page.tsx`
- `jam-web/src/app/admin/drop-policy/exclusions/page.tsx`
- `jam-web/src/app/admin/ecosystem/page.tsx`
- `jam-web/src/app/admin/itembooks/ItemBookForm.tsx`
- `jam-web/src/app/admin/missions/MissionConditionSection.tsx`
- `jam-web/src/app/admin/missions/MissionForm.tsx`
- `jam-web/src/app/admin/ops-trends/page.tsx`
- `jam-web/src/app/admin/policy-dashboard/page.tsx`
- `jam-web/src/app/admin/recipes/RecipeForm.tsx`
- `jam-web/src/app/admin/today/TodayCardPreview.tsx`
- `jam-web/src/app/admin/today/TodayPreviewModal.tsx`
- `jam-web/src/app/admin/users/[id]/UserChapterSection.tsx`
- `jam-web/src/app/admin/users/[id]/UserTribeChangeForm.tsx`
- `jam-web/src/app/admin/users/[id]/UserTribeSection.tsx`
- `jam-web/src/components/account/WithdrawSheet.tsx`
- `jam-web/src/components/account/__tests__/WithdrawSheet.test.tsx`
- `jam-web/src/components/admin/ConditionSimulationPanel.tsx`
- `jam-web/src/components/admin/balance/AmbientSection.tsx`
- `jam-web/src/components/admin/balance/BadgePointsSection.tsx`
- `jam-web/src/components/admin/balance/BalanceHistory.tsx`
- `jam-web/src/components/admin/balance/BalanceProbabilityConfirm.tsx`
- `jam-web/src/components/admin/balance/BalanceSectionBody.tsx`
- `jam-web/src/components/admin/balance/BalanceSectionForm.tsx`
- `jam-web/src/components/admin/balance/CapsuleSection.tsx`
- `jam-web/src/components/admin/balance/ChapterSection.tsx`
- `jam-web/src/components/admin/balance/CollectionSection.tsx`
- `jam-web/src/components/admin/balance/InventorySection.tsx`
- `jam-web/src/components/admin/balance/LockedSection.tsx`
- `jam-web/src/components/admin/balanceDashboard/AdjustLinks.tsx`
- `jam-web/src/components/admin/balanceDashboard/CollectionPaths.tsx`
- `jam-web/src/components/admin/devBoard/BoardCardItem.tsx`
- `jam-web/src/components/admin/devBoard/BoardColumns.tsx`
- `jam-web/src/components/admin/devBoard/BundleProgressList.tsx`
- `jam-web/src/components/admin/devBoard/DeployStatusCards.tsx`
- `jam-web/src/components/admin/devBoard/ReadNotices.tsx`
- `jam-web/src/components/admin/ecosystem/DevRequestButton.tsx`
- `jam-web/src/components/admin/ecosystem/EcosystemGoalRows.tsx`
- `jam-web/src/components/admin/ecosystem/EcosystemLoopMap.tsx`
- `jam-web/src/components/admin/ecosystem/EcosystemPolicyPanel.tsx`
- `jam-web/src/components/admin/itembooks/ItemBookTierPanel.tsx`
- `jam-web/src/components/admin/itembooks/ItemBookTierRewards.tsx`
- `jam-web/src/components/admin/itembooks/__tests__/ItemBookTierRewards.test.tsx`
- `jam-web/src/components/admin/ops/OpsCommonRuleEditor.tsx`
- `jam-web/src/components/admin/ops/OpsEvidencePicker.tsx`
- `jam-web/src/components/admin/ops/OpsTasteSignalEditor.tsx`
- `jam-web/src/components/admin/ops/preview/HomePreviewConditions.tsx`
- `jam-web/src/components/admin/ops/preview/OpsHomeFeedPreviewRow.tsx`
- `jam-web/src/components/admin/ops/trends/OpsTrendRadar.tsx`
- `jam-web/src/components/admin/ops/trends/OpsTrendSources.tsx`
- `jam-web/src/components/capsule/CapsuleWidget.tsx`
- `jam-web/src/components/strava/PendingItemsPick.test.tsx`
- `jam-web/src/components/strava/PendingItemsPickOverlay.tsx`
- `jam-web/src/components/strava/StravaDisconnectSheet.tsx`
- `jam-web/src/components/strava/StravaDisconnectedCard.tsx`
- `jam-web/src/components/strava/StravaDuplicateSheet.tsx`
- `jam-web/src/components/strava/StravaSettingsSection.tsx`
- `jam-web/src/components/ui/InlineNotice.tsx`

## 완료 조건

### 구현 범위 (게이트 판정 대상)

- `cd jam-web && git grep -nE "text-pretty|text-wrap: ?pretty|textWrap: ?.pretty|word-break: ?break-word|wordBreak: ?.break-word" -- src design-system ':!design-system/uploads'`의 결과가 없다.
- 같은 `className`에 `text-balance`가 두 번 나오는 줄이 없다.
- 바뀐 시험 7개와 신규 `korean-wrap-global.test.ts`가 통과하고 `npm run lint`, `npm run typecheck`가 통과한다.
- `UX_WRITING_GUIDELINE.md` §3.2, `DESIGN.md`, `design-system/readme.md`, `jam-developer.md`, `ui-review-checklist.md`에 «본문 문단 = pretty» 서술이 남아 있지 않다.
- 표시 위치(DOM 구조·`break-keep`·`wrap-break-word`·`whitespace-nowrap`)는 바뀌지 않는다. diff는 클래스 토큰 치환과 위 문서·시험 변경으로만 이루어진다.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤 push 전)

- 메인 트리에서 `next dev`를 띄우고 서비스 화면 1곳 이상에서 `text-pretty`가 걸려 있던 문단의 `getComputedStyle`이 `text-wrap-style: balance`, `word-break: keep-all`인지 확인한다.
- 티켓 완료 기록과 실행 지표를 채우고 CLOSED 처리한다.

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
**가이드:** `docs/service/writing/UX_WRITING_GUIDELINE.md` 참조

해당 없음(문구는 바뀌지 않고 줄바꿈 규칙만 바뀐다).

### 배포 정보
- 배포일: 
- 환경: staging
- 커밋: 

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

- 2026-11-02 사용자 결정: 본문 문단의 `text-pretty`도 전부 `text-balance`로 통일한다(대안: 제목·짧은 안내만 balance / 서비스만 통일하고 어드민은 유지). 이유: «모든 서비스의 텍스트에 balance»라는 요청 문구.
- `text-pretty`를 걷어 전역 상속에 맡기는 대신 `text-balance`로 명시 치환한 이유: 부모가 다른 `text-wrap`을 지정해도 해당 요소의 값이 보장되고, 기존 제목·카드 쪽 표기와 같아져 시험 단언도 일관된다.
- 경로 ②(가벼운 UI, `route: 'light'`): 로직 변경이 없고 고칠 내용이 이 티켓에 확정되어 있어 채원 사전·사후 판정을 생략한다. 규모(81개 파일·142줄)는 `plan_only` 임계값을 넘기지만 기계적 치환이라 파일 단위 목록으로 면제를 부여한다.

### 잔여 이슈
- 공유 이미지 캔버스(`buildBadgeShareBlob.ts`)의 글자 줄바꿈은 CSS 범위 밖이다. 별도 티켓 후보.
