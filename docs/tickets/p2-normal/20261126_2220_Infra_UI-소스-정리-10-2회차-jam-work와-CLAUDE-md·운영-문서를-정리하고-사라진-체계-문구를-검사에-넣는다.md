---
id: "20261126_2220"
category: Infra
priority: P2
status: OPEN
created: 2026-11-26
parent: "20261125_1923"
---

# [Infra] UI 소스 정리 10-2회차: jam-work와 CLAUDE.md·운영 문서를 정리하고 사라진 체계 문구를 검사에 넣는다

## 핵심 요약

- 요구사항: 상위 티켓 20261125_1923 10회차 조각(10-1·10-3 뒤). jam-work 스킬 본문·references, `CLAUDE.md`, `docs/agents/` 운영 규칙 5개에서 장치가 대신하게 된 규칙 문장, 중복, 사라진 체계 전제, 경위 혼입, 낡은 사실을 걷어낸다. 10-1·10-3이 모아 둔 경위를 `rationale.md`로 옮기고, 사라진 체계 문구가 다시 들어오지 않게 `contract.json`의 `stale_phrases`에 넣는다.
- 사용자 승인: 2026-11-26 — 10회차 분할안과 문서 쟁점 추천안(판단 근거가 되는 실측·사고만 rationale로, push 금지 대상은 staging·main, 단일 원천 배분, 사라진 체계 문구를 `stale_phrases`로).
- 관련 파일: `CLAUDE.md`, `.claude/skills/jam-work/SKILL.md`(4단계 5번 «push origin staging 한 번», 352-353행 부근), `.claude/skills/jam-work/references/`(`team-composition.md`·`loop-improvements.md`·`common-rules.md`·`automation-list.md`·`stop-conditions.md`·`definition-of-done.md`·`handling-rules.md`·`scheduled-jobs.md`·`rationale.md`·`forms/` 등), `docs/agents/DEV_PROCESS_GUARDRAILS.md`·`domain.md`·`issue-tracker.md`·`orchestrator.md`·`team-operations.md`, `docs/agents/contract.json`(`stale_phrases`). 장치 파일(`.githooks/`·`scripts/verify.sh`)의 낡은 주석은 같은 파일을 고치는 10-6이 맡으므로 이 조각은 건드리지 않는다.
- 측정 근거: 세션 노트 `10회차-측정-B.md`(줄 단위 표), 경위 이관 노트 `10-1-rationale-이관.md`(2건)·`10-3-rationale-이관.md`(11건). 커밋하지 않는 노트다. 감소 추정 약 −520줄(rationale 수신분 제외).
- 화면 변화: 없음.

## 구현 계획

1. push 정합: `CLAUDE.md` 규칙 3과 jam-work 4단계·4.1절, 아현 정의의 리뷰 브랜치 push 문장을 «금지 대상은 staging·main, 리뷰 브랜치 push는 빌드가 돌지 않아 허용»으로 맞춘다(근거 `jam-web/scripts/vercel-ignore.sh`). 4단계 5번 «push origin staging 한 번»을 고친다.
2. 중복 정리: 팀 구성(`team-composition.md`는 통째로 중복), 티켓 생성 권한 표, 새 세션 읽기 순서, 처음 보는 유형 절차를 한 곳에만 두고 나머지는 참조로 바꾼다. `CLAUDE.md`는 서브에이전트 전원에게 실리므로 전원 규칙만 남기고 메인 세션 전용 세부는 `orchestrator.md`로 보낸다.
3. 경위: 10-1·10-3 이관 노트와 측정 B의 ④ 항목 중 판단 근거가 되는 실측·사고만 `rationale.md`로 옮기고 머리말의 범위를 jam-work 밖 규칙 문서까지 넓힌다. 단순 이력·인라인 티켓 번호는 지운다. `team-operations.md` §8(사고 원장)은 `CLAUDE.md`가 가리키므로 유지하되 규칙과 섞인 경위만 정리한다.
4. 낡은 사실(측정 B ⑤): «staging에는 CI가 돌지 않는다», 경로 ② 서술, `stop-conditions.md` 19행 DB 실행 «사용자 승인 필수»(DB는 실행 전 점검 뒤 메인 세션 실행, 외부 발행·프로덕션 배포는 승인 유지), 판정 양식 점검표 12번 누락, 주간 브리핑 요일, issue-tracker 티켓 파일명 형식, `db:types`, 채원 생략 조건 오기, 가드레일의 파일 수, 문서가 적은 verify 단계 수, `CLAUDE.md`의 «latest.md는 월간 루틴»·폴더 규칙 중복 문장(10-3 넘김), `scheduled-jobs.md:474` 월간 절차의 «윈터·윤진이 트렌드 수집»(수집 주체는 월요일 루틴, 10-3 민지 발견).
5. 예약 루틴 상태: 실제 상태를 확인해 `scheduled-jobs.md` 한 곳에 맞춰 적고, 머리말 «모두 꺼짐»과 상태 칸이 어긋나지 않게 한다. 「무인 경로에 적용하는 점검」 표에 «5단계 병렬 점검(민지 모드 ②·③) 미적용 — 무인 실행은 승인 주체가 없고 비용 상한이 있다» 행을 더한다(10-3 민지 WARN: 지운 jam-ship 대응표에만 있던 판단).
6. 재발 방지: `docs/agents/contract.json`의 `stale_phrases`에 `_ds_manifest`·`ds:check`·`design-system/components`·`.design-sync`·`claude.ai/design`·«MODULAR 확장»을 넣는다(예외 경로: 티켓·아카이브·동결 폴더·리포트). `node scripts/check-contract.mjs`가 이 문구를 잡는지 시험으로 보인다.

## 완료 조건

- 대상 파일의 줄 수 전후를 완료 기록에 남긴다. `CLAUDE.md`는 글자 수도 남긴다.
- `node scripts/check-contract.mjs`(새 `stale_phrases` 포함), `check-skills`, `gen-team-doc --check`, `gen-team-map --check`, 루트 `scripts` 시험, 바뀐 문서의 `doc-check`가 통과한다.
- 민지 판정: 지운 규칙이 장치나 다른 문서에 실제로 있는가, 바꾼 문장이 사실과 맞는가.

## 완료 기록 *(작업 완료 후 작성)*
