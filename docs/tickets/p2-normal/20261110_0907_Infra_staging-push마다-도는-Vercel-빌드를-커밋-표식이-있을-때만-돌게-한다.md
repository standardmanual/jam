---
id: "20261110_0907"
category: Infra
priority: P2
status: CLOSED
created: 2026-11-10
closed: 2026-11-10
specs: []
---

# [Infra] staging push마다 도는 Vercel 빌드를 커밋 표식이 있을 때만 돌게 한다

## 핵심 요약

- 요구사항(사용자 지시, 2026-11-10): push할 때마다 빌드가 돌아 Vercel 비용이 많이 나간다. 사용자가 확인하고 싶을 때만 빌드한다. 요청 전에는 GitHub로 push하지 않는다.
- 선택한 방식(사용자 결정): 커밋 표식 방식. 저장소의 빌드 건너뛰기 스크립트에 규칙을 더하고 Vercel 설정은 건드리지 않는다.
- 구현 계획: `vercel-ignore.sh`에 규칙 ③을 더해 staging 브랜치 push는 커밋 메시지에 `[배포]`(또는 `[deploy]`)가 있을 때만 빌드한다. 표식이 있으면 기존 규칙 ②(직전 빌드 이후 `jam-web/` 변경이 있는지)로 이어진다. push는 사용자가 요청할 때만 하도록 CLAUDE.md 절대 규칙 3과 jam-work 4.1절을 고친다.
- 관련 파일: `jam-web/scripts/vercel-ignore.sh`(규칙 ③, 머리 주석), `jam-web/scripts/__tests__/vercelIgnore.test.ts`(신규), `CLAUDE.md` 절대 규칙 3, `.claude/skills/jam-work/SKILL.md` 4.1절, `docs/agents/team-operations.md` 사고 표.
- 담당 에이전트: 오케스트레이터.

## 완료 조건

- 표식이 없는 staging push는 빌드하지 않는다. 표식이 있는 push는 기존 규칙 ②로 판정해 빌드한다.
- main(프로덕션)과 review 브랜치 규칙은 바뀌지 않는다.
- push는 사용자 요청이 있을 때만 한다는 규칙이 문서에 있다.

---
## 완료 기록

- **변경**: 규칙 ③은 `VERCEL_GIT_COMMIT_REF`가 `staging`일 때만 적용한다. 커밋 메시지는 `VERCEL_GIT_COMMIT_MESSAGE`에서 읽고, 비어 있으면 `git log -1`로 읽는다. 표식이 없으면 종료 코드 0으로 건너뛰고, 있으면 ②로 이어간다. main은 대상이 아니라서 `/jam-ship`의 프로덕션 배포는 그대로다.
- **운영 방법**: 평소에는 로컬 커밋만 쌓고 push하지 않는다. 사용자가 push를 요청하면 쌓인 커밋을 올리되 빌드는 돌지 않는다. staging 화면 확인이 필요하면 빈 커밋 `[배포] …`를 더해 올린다. 그 빌드가 쌓인 변경을 한 번에 배포한다.
- **알아 둘 점**: 이 규칙은 저장소의 스크립트라서 **push해야 적용된다**. 이 커밋을 올리는 push 자체에 표식이 없으면 빌드는 돌지 않는다. 표식 없는 push가 많아도 «직전 빌드 커밋» 마커는 빌드 때만 갱신되므로, 다음 표식 빌드가 그동안의 `jam-web/` 변경을 모두 포함한다.
- **검증**: 스크립트를 실제로 실행하는 시험 6건 통과(표식 없음 → 종료 코드 0, `[배포]`·`[deploy]`·여러 줄 메시지의 표식 → 건너뛰지 않음, main·review 브랜치는 대상 아님). eslint, 슬롭 검사 통과.
- **확인하지 못한 것**: 실제 Vercel에서의 동작. Vercel 대시보드의 수동 재배포와 API 수동 배포(`create_deployment`)가 이 건너뛰기 스크립트를 거치는지는 확인하지 못했다. 표식 없는 수동 배포가 건너뛰어지면 빈 `[배포]` 커밋을 쓰면 된다.
