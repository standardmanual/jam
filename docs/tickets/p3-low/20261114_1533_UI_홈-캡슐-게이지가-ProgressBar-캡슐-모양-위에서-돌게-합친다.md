---
id: "20261114_1533"
category: UI
priority: P3
status: OPEN
created: 2026-11-14
---

# [UI] 홈 캡슐 게이지가 ProgressBar 캡슐 모양 위에서 돌게 합친다

## 핵심 요약
- 요구사항: 홈 `CapsuleGauge`가 DS `ProgressBar shape="capsule"`을 바탕으로 쓰고 숫자·이름표는 덮개 슬롯으로 얹게 한다. 티켓 20261114_1502에서 두 부품은 트랙·채움 토큰만 같게 묶고(시험 한 줄) 부품은 합치지 않았다.
- 구현 계획: ProgressBar에 `children`(덮개) 슬롯을 먼저 더한 뒤 CapsuleGauge의 트랙·채움 그리기를 ProgressBar로 바꾼다. CapsuleGauge의 진입 모션(IntersectionObserver)·숫자 팝인·이름표 두 겹 글자·테두리(`--capsule-ring`)·점 4개는 서비스 전용 연출이라 덮개와 래퍼에 남긴다. 채원 판정과 민지 게이트를 거친다.
- 관련 파일(jam-web): `src/components/capsule/CapsuleGauge.tsx`, `src/components/capsule/CapsuleWidget.tsx`, `design-system/components/feedback/ProgressBar.jsx`·`.d.ts`·`.stories.tsx`·`.prompt.md`

## 배경 / 문제 정의
홈 캡슐 게이지와 컬렉션·인벤토리의 진행 바가 같은 모양(어두운 트랙 위 둥근 채움)이 됐지만 코드는 둘로 나뉘어 있다. 합치면 두 모양이 어긋나지 않는다. 홈의 핵심 모션·시험이 흔들릴 수 있어 별도 티켓으로 둔다(채원 판정, 티켓 20261114_1502).

## 완료 조건
- CapsuleGauge의 트랙·채움이 ProgressBar `shape="capsule"`로 그려지고 홈 화면의 모양과 모션이 그대로다.
- CapsuleGauge 시험과 ProgressBar 시험이 통과하고 `scripts/verify.sh`(`ds:check` 포함)에서 이번 변경 시험이 통과한다.

## 완료 기록
(작업 후 작성)
