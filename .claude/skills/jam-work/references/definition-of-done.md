# 완료 기준(Definition of Done) 단일 원천

> 신설 문서 (티켓 20260922_1521). 티켓의 **완료 조건**과 이 문서의 **완료 기준(DoD)**은 다른
> 것이다 — 완료 조건은 "이것을 만들었나"(티켓마다 다름), DoD는 "끝낼 기준을 지켰나"(모든
> 변경에 동일하게 적용, 매 스프린트 재협상하지 않는다)를 묻는다. 두 층 모두 통과해야 끝난
> 것이다. 이 문서를 유일한 정의로 두고, 나머지 문서는 참조만 한다.

## 정확성

- [ ] 티켓의 완료 조건(구현 범위)이 전부 충족됐다 — 확인: 민지 점검표 2번(스펙 대조)
- [ ] 코드가 실행 시점에 의도대로 동작한다(컴파일·타입체크만으로 끝내지 않는다) — 확인:
  `scripts/verify.sh`의 typecheck·test 단계, 필요하면 로컬 실행이나 `curl` 검증(격리 워크트리에서는 `next dev`가 뜨지 않으므로 어드민 화면은 실렌더를 시도하지 말고 단위 테스트로 확인한다 — 화면 확인은 카리나 몫, `DEV_PROCESS_GUARDRAILS.md` 패턴 13)
- [ ] 새 동작은 변경 전엔 실패하고 변경 후엔 통과하는 테스트로 덮여 있다 — 확인:
  `scripts/verify.sh`의 test 단계(`bug` 유형은 `bug-procedure.md`의 재현 테스트 5단계)
- [ ] 기존 테스트가 전부 통과하고 회귀가 없다 — 확인: `scripts/verify.sh`의 test 단계 +
  GitHub Actions `verify`
- [ ] 행복 경로만이 아니라 예외·오류 경로도 처리돼 있다 — 확인: 민지 점검표 10번(오류 처리)
- [ ] 시스템의 나머지 부분과 맞물려 동작하고, DB 마이그레이션·설정 변경이 있으면 반영되어
  있다 — 확인: 민지 점검표 3번(회귀 위험)·8번(SQL 마이그레이션)

## 품질

- [ ] 이름과 구조로 의도가 드러나 동작을 설명하는 주석이 필요 없다 — 확인: 민지
  `sideFindings`의 [가독성] 축
- [ ] 비즈니스 로직이 중복되지 않는다 — 확인: 민지 `sideFindings`의 [구조] 축
- [ ] 죽은 코드·디버그 출력·주석 처리된 블록이 남아있지 않다 — 확인: `scripts/verify.sh`의
  lint 단계
- [ ] 변경이 티켓 범위에 한정되고 무관한 리팩터링이 섞이지 않는다 — 확인: 민지 점검표
  5번(범위 이탈)
- [ ] Lint·포맷이 통과하고, 가드레일을 우회하지 않는다(사유 없는 eslint-disable, 테스트
  skip/only, `max-warnings` 상향 등) — 확인: 기준 방어 — `scripts/verify.sh`의 lint 단계 +
  `.githooks/pre-push` 통과
- [ ] 이 변경이 실제로 영향을 주는 문서가 갱신됐다 — 확인: 민지 점검표 11번(문서 반영)

## 배포 준비

`/jam-ship` 7단계(main 승격) 직전, 아래 네 가지가 전부 충족돼야 진행한다. 하나라도 비어
있으면 멈추고 보고한다.

- [ ] 보안 검토 — 확인: `/jam-ship` 3단계 「보안」 항목
- [ ] 관측 — 확인: 이번 배포로 새로 생기는 실패 경로가 로그·`engine_decision_log`·기존 KPI
  중 하나로 보이는지 (`/jam-ship` 3단계)
- [ ] 롤백 경로 — 확인: `/jam-ship` 4단계 롤백 계획의 네 칸이 채워졌는지
- [ ] 사람 승인 — 확인: 사용자가 staging에서 확인을 마쳤는지 (`/jam-ship` 2단계)

> 이식 출처: `definition-of-done.md` Ship-readiness 절.

## 참조하는 곳

- `.claude/skills/jam-ship/SKILL.md` 6단계
- `.claude/agents/jam-reviewer.md` Principles(판정 기준 두 층)
- `.claude/agents/jam-developer.md` Verification before handing off(제출 전 자기 점검)
- `.claude/skills/jam-work/references/forms/review-verdict-format.md` 「확인 사항」(판정 기준 두 층)
- `.claude/skills/jam-work/references/forms/implementation-summary-format.md` `checks` 칸(자기 점검 결과)

이 다섯 곳 중 하나를 고치면, 서술이 아니라 **이 문서로의 참조**만 남아 있는지 확인한다.
서술을 다시 옮겨 적으면 원본이 두 곳이 되어 드리프트가 재발한다(`CLAUDE.md` 규칙 5).

<!-- 되돌림 기록: 이 파일은 신규 문서라 삭제만 하면 되돌려진다. 삭제 시 위 "참조하는 곳" 다섯
곳의 참조를 이전 서술로 되돌리는 작업이 함께 필요하다(git revert 권장). -->
