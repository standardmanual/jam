---
id: "20261001_1249"
category: UI
priority: P3
status: OPEN
created: 2026-10-01
closed:
---

# [UI] LabelChip 도입 뒤 디자인 시스템 문서·Story 정리 3건

## 핵심 요약

- 요구사항: 티켓 20261001_1204 채원② 사후 리뷰 제안(참고·낮음) 3건을 정리한다.
  1. `LabelChip.stories.tsx`의 `SelfStartCompare` Story가 컨테이너에 Tailwind 클래스(`flex flex-col gap-2`)를 쓴다. design-system Story 중 처음 보는
     패턴이다. 컨테이너만 인라인 style로 바꾼다(칩의 `className="self-start"`는 호출부 사용법 예시라 둔다).
  2. `jam-web/src/components/transitions.css` 「프로젝트 확장」 절 머리말이 「새 트랜지션을 여기에 직접 작성하지 마세요」인데 `.jam-quest-pulse`·`.jam-press`가
     들어와 있다. 「JAM! 고유 토큰을 쓰는 프로젝트 전용 클래스는 예외, reduced-motion 절을 함께 둔다」를 한 줄 더한다.
  3. `.claude/skills/jam-work/references/ds-connection-scope.md` 40줄의 연결 컴포넌트 수 「21종(09-14 실측)」이 낡았다. 실측해 수치와 날짜를 고친다.
- 관련 파일: 위 세 파일
- 구현 계획: 문서·Story만 바꾸는 가벼운 작업이다(경로 ② 가벼운 UI 또는 경미 수정).

## 완료 조건

- Story가 Tailwind 없이 같은 비교를 보이고 `npm run ds:check`가 통과한다.
- 머리말이 실제 내용과 맞는다.
- 연결 컴포넌트 수가 실측값과 날짜로 적혀 있다(명령으로 확인한 결과만, CLAUDE.md 규칙 5).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

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

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
