---
id: "20260921_2303"
category: Infra
priority: P1
status: IN_PROGRESS
created: 2026-09-21
parent: "20260921_2219"
---

# [Infra] 이식 ① SHIP 보강 — `/jam-ship`에 롤백 계획·배포 전 점검·배포 후 검증, `db` 유형에 확장→전환→축소 절차

## 핵심 요약

- 요구사항: agent-skills의 `shipping-and-launch`와 `deprecation-and-migration` 스킬을 JAM의 배포 관문(`/jam-ship`)과 `db` 유형 규칙에 이식한다. 스킬 원본 전문을 읽고, JAM 환경에 맞지 않는 항목만 제외하되 제외 사유를 문서에 남긴다(사용자 결정 2026-09-21: 각 스킬의 상세 특징·설정·기능을 최대한 이식한다).
- 구현 계획: `/jam-ship` SKILL.md에 「배포 전 점검표」「롤백 계획」「배포 후 검증」 절을 신설하고 보고 양식에 롤백 계획을 필수 항목으로 넣는다. `jam-developer.md`와 `/jam-work` SKILL.md의 `db` 유형에 확장→전환→축소(expand/contract) 순서와 되돌림 SQL 동반 규칙을 넣는다.
- 관련 파일: `.claude/skills/jam-ship/SKILL.md`, `.claude/agents/jam-developer.md`(Hard rules 3·`db` 절), `.claude/skills/jam-work/SKILL.md`(0.2 분기표 `db` 행), `docs/agents/team-operations.md` §3 「머지와 배포의 경계」. 원본 스킬: `~/.claude/plugins/cache/addy-agent-skills/agent-skills/0.6.10/skills/shipping-and-launch/SKILL.md`, `~/.claude/plugins/cache/addy-agent-skills/agent-skills/0.6.10/skills/deprecation-and-migration/SKILL.md`, `~/.claude/plugins/cache/addy-agent-skills/agent-skills/0.6.10/skills/../references/definition-of-done.md` (이 PC 설치 경로. 없으면 https://github.com/addyosmani/agent-skills v0.6.10)
- 상위 티켓: 20260921_2219(이식 분석). 경로: ③ 표준(infra, 채원 없이 아현 → 민지)

## 배경 / 문제 정의

이식 분석(20260921_2219 §1.3)에서 SHIP 단계가 JAM에 가장 비어 있는 곳으로 확인됐다. `/jam-ship`은 staging 확인(사용자) → main 승격 → Vercel Ready·alias 확인까지만 하고, 롤백 계획·배포 전 기계 점검·배포 후 검증이 없다. 또 Supabase는 staging·프로덕션 공용 단일 DB라 마이그레이션 되돌림이 JAM에서 가장 위험한 지점인데, 확장→전환→축소 같은 안전 절차가 규칙으로 없다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. **배포 전 점검표** (`shipping-and-launch` §The Pre-Launch Checklist 기준): 코드 품질·보안·성능·접근성·인프라·문서 여섯 묶음을 JAM 항목으로 옮긴다. 각 항목은 확인 명령 또는 확인 방법을 동반한다(예: 테스트 = `scripts/verify.sh`, 비밀값 = `git grep` 패턴, 마이그레이션 = `jam-web/supabase/migrations/` 신규 파일 여부와 적용 기록). JAM에 해당 없는 항목(예: 번들 예산이 정의되지 않은 항목)은 "해당 없음"이 아니라 「제외 목록」에 사유와 함께 적는다.
2. **롤백 계획** (§Rollback Strategy 양식): 트리거 조건 · 절차 · 목표 복구 시간 · DB 고려. JAM 값으로 채운다: 코드는 Vercel에서 직전 배포를 alias로 되돌리는 명령, DB는 해당 마이그레이션의 되돌림 SQL 존재 여부. 배포 보고 양식에 롤백 계획이 없으면 배포를 진행하지 않는다.
3. **배포 후 검증** (§Post-Launch Verification): 배포 직후 카리나가 확인할 항목(스테이징 자동 로그인 경로로 핵심 화면 응답, `engine_decision_log` 오류 증가 여부, Strava 동기화 실패 건수)과, 주간 브리핑에서 카즈하가 이어서 볼 항목을 나눈다.
4. **단계 배포·오류 예산** (§Staged Rollout·§Error Budget): Vercel 단일 배포 구조라 단계 배포는 제외하되 사유를 남긴다. 오류 예산은 카즈하의 정상 범위(07_루프보완 #7)가 정해진 뒤 도입하도록 후속 항목으로 적는다.
5. **`db` 유형 규칙** (`deprecation-and-migration` expand/contract): 컬럼·함수 변경은 ① 새 것을 추가(확장) → ② 코드가 새 것을 쓰게 전환 → ③ 옛 것을 제거(축소)의 세 마이그레이션으로 나눈다. 한 마이그레이션에서 삭제와 추가를 함께 하지 않는다. 모든 마이그레이션 파일에 되돌림 SQL(주석 블록 또는 `_down.sql`)을 동반한다. 가드레일 패턴 2·14와 연결한다.
6. **완료 기준(DoD)**: `definition-of-done.md`의 Ship-readiness 항목(보안 검토·관측·롤백 경로·사람 승인)을 `/jam-ship` 절차의 마지막 관문으로 넣는다.
7. 문서에는 "무엇을 하는가"만 적고 이식 출처는 절 끝에 한 줄로 남긴다. 원본 스킬 전문을 복사해 넣지 않는다.
8. **관련 문서 전수 갱신** (사용자 추가 지시, 2026-09-21 착수 직후): 구현이 게이트를 통과하면 `docs/`와 `jam-doc/` 안에서 배포 절차·롤백·DB 마이그레이션 규칙을 서술하는 현재 상태 문서를 새 내용에 맞춘다.
   - 담당: 카리나(`docs` 유형으로 직접 처리). 시점은 review 브랜치를 staging에 머지한 뒤, push하기 전이다. 아현의 구현 범위(1~7번)에는 넣지 않는다.
   - 방식: 같은 사실을 옮겨 적지 않는다. 절차의 단일 원천은 `/jam-ship` SKILL.md와 `jam-developer.md`로 두고, 다른 문서는 낡은 서술을 고치거나 단일 원천을 가리키게 바꾼다(`CLAUDE.md` 규칙 5).
   - 확인 후보(2026-09-21 `grep`으로 추린 목록): `docs/agents/team-operations.md`, `docs/agents/orchestrator.md`, `docs/agents/issue-tracker.md`, `docs/specs/DEV_PROCESS_GUARDRAILS.md`, `docs/specs/SERVICE_OPERATIONS.md`, `docs/specs/prd/04_PROJECT_SPEC.md`, `docs/specs/prd/02_DATA_MODEL.md`, `docs/specs/prd/README.md`, `jam-doc/planning/business-plan/02 JAM! 서비스 플랜.md`, `CLAUDE.md`, `.claude/skills/jam-work/references/`의 `handling-rules.md`·`scheduled-jobs.md`·`team-composition.md`·`forms/weekly-briefing-format.md`·`forms/implementation-summary-format.md`.
   - 제외: `docs/tickets/`(작업 이력), `jam-doc/archive/`(읽기 전용), `jam-doc/operations/reports/`(시점별 기록), `docs/agents/workflow/`(티켓 20260921_2311에서 기록으로 동결할 예정인 설계 원본).

## 구현 계획

1. 원본 스킬 두 개와 DoD 참조를 전문으로 읽고, 항목별로 「이식 / 조정 / 제외(사유)」 표를 먼저 만든다.
2. `/jam-ship` SKILL.md를 고치고 보고 양식을 갱신한다.
3. `jam-developer.md`·`jam-work/SKILL.md`의 `db` 규칙을 고친다.
4. `team-operations.md` §3의 배포 경계 서술이 바뀌면 함께 고친다(생성 구간이면 생성기 실행).
5. `scripts/verify.sh` 통과, `doc-check`·`check-contract` 통과.

## 완료 조건

- `/jam-ship` SKILL.md에 「배포 전 점검표」「롤백 계획」「배포 후 검증」 절이 있고, 점검표의 모든 항목에 확인 명령 또는 방법이 붙어 있다.
- 배포 보고 양식에 롤백 계획(트리거·절차·목표 시간·DB)이 필수 항목으로 있고, 롤백 계획이 비어 있으면 배포하지 않는다는 문장이 있다.
- `jam-developer.md`에 `db` 유형의 확장→전환→축소 규칙과 되돌림 SQL 동반 규칙이 있고, `/jam-work` 분기표 `db` 행이 그 규칙을 가리킨다.
- 원본 스킬 항목 중 제외한 것이 「제외 목록」에 사유와 함께 적혀 있다.
- `scripts/verify.sh`가 통과한다.
- 요구사항 8번의 확인 후보를 전부 확인했고, 고친 문서와 고칠 필요가 없던 문서가 완료 기록에 나뉘어 적혀 있다.

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
- 환경: staging (빌드 없음)
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
