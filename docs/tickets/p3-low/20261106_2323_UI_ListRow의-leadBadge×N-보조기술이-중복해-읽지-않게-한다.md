---
id: "20261106_2323"
category: UI
priority: P3
status: OPEN
created: 2026-11-06
parent: "20261106_1750"
---

# [UI] ListRow의 leadBadge(×N)를 보조기술이 중복해 읽지 않게 한다

## 핵심 요약

- 요구사항: DS 원본 `ListRow.jsx`와 서비스 사본 `ListRow.tsx`의 `Lead`에서 `leadBadge` 칸에 `aria-hidden`을 걸어, 같은 정보를 담은 «N번째 …» 문장과 ×N을 스크린리더가 두 번 읽지 않게 한다.
- 구현 계획: 미정(착수 전 규모 판정).
- 관련 파일: `jam-web/design-system/components/patterns/ListRow.jsx`(`Lead` 함수), `jam-web/src/components/ui/ListRow.tsx`(`Lead`), `ListRow.prompt.md`

## 배경 / 문제 정의

티켓 20261106_2252 게이트 리뷰 참고 발견. 다만 leadBadge가 ×N 말고 정보를 단독으로 전하는 쓰임이 있으면 일괄 `aria-hidden`이 맞지 않을 수 있어, 호출부가 정하게 할지 채원이 판정한다.

## 완료 조건

- 프로필 피드의 ×N이 스크린리더에서 한 번만 읽힌다.
- 원본과 사본이 같은 값이고 `npm run ds:check`가 오류 0이다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
