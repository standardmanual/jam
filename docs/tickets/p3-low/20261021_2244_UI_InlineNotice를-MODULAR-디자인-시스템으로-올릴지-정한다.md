---
id: "20261021_2244"
category: UI
priority: P3
status: OPEN
created: 2026-10-21
parent: "20261021_1249"
---

# [UI] InlineNotice를 MODULAR 디자인 시스템으로 올릴지 정한다

## 핵심 요약

- 요구사항: 서비스 전용 컴포넌트 `src/components/ui/InlineNotice.tsx`(오류색 없이 문구로 심각도를 전하는 안내 블록, `role="status"`)를 쓰는 곳이 티켓 `20261021_1249` 3회로 3곳을 넘었다(탈퇴 시트의 실패 안내, 로그인 화면의 «탈퇴가 끝났어요» 안내, 기존 사용처). 채원 사후 리뷰가 MODULAR 승격 후보로 제안했다. 승격할지, 서비스 전용으로 남길지 정한다.
- 구현 계획: ① 사용처 목록과 props를 정리한다. ② 승격하기로 하면 `jam-web/design-system/components/`에 컴포넌트와 Story를 더하고 `_ds_manifest.json`을 `ds-manifest-sync`로 맞추며 서비스 쪽을 `@ds` import로 바꾼다(MODULAR 쌍 시험 `*Pairs.test.tsx` 규칙). ③ 남기기로 하면 «서비스 전용, 사유»로 닫는다.
- 관련 파일: `jam-web/src/components/ui/InlineNotice.tsx`, `jam-web/src/components/account/WithdrawSheet.tsx`, `jam-web/src/app/(auth)/login/page.tsx`. 줄 위치는 채원 보고이며 카리나가 직접 확인하지는 않았다.

## 배경 / 문제 정의

티켓 20261021_1249 3회 채원 사후 리뷰가 «3곳 이상 사용 기준 도달»로 승격 후보를 제안했다. 같은 리뷰가 «확인 문구 입력 블록»(`ConfirmPhraseField`)은 6-3 4회(그래도 연결하기)에서 다시 쓰는지 본 뒤에 판단하자고 했다. 그 판단은 4회 때 이 티켓이나 새 티켓으로 한다.

발견: 2026-10-21 티켓 20261021_1249 3회 채원 사후 리뷰.

## 상세 요구사항

### UI/UX 관점

- 승격해도 서비스 화면의 모양이 바뀌지 않는다.

## 완료 조건

- [ ] 승격 또는 남김을 정했다
- [ ] 승격했다면 `ds:check`와 `ds-manifest-sync`가 통과한다

## 진행 기록

## 잔여 이슈
