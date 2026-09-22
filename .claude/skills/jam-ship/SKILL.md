---
name: jam-ship
description: JAM! staging 검증 후 프로덕션(main) 배포. staging 미반영 변경 확인 → 배포 전 점검표 → 롤백 계획 → 병렬 점검(민지 보안·테스트) → main 승격 → Vercel 배포 Ready·alias 검증 → 배포 후 검증 → 결과 보고까지 처리한다. "배포해줘", "프로덕션에 올려줘", "스테이징 확인했어 배포하자", "/jam-ship" 같은 요청에 사용.
---

# /jam-ship — 프로덕션 배포

사용자는 git을 직접 다루지 않는다. **"배포해줘" 한마디로 끝나야 한다.**
아래 절차를 오케스트레이터가 직접 수행하고, 각 관문에서 문제가 있으면 멈추고 보고한다.

## 1. 사전 확인 (배포 전 반드시)

```bash
git -C "<repo>" status --short          # 미커밋 변경이 있으면 먼저 처리
git -C "<repo>" fetch origin
git -C "<repo>" log --oneline origin/main..origin/staging   # 승격될 커밋 목록
```

- **미커밋 변경이 있으면**: 커밋할지 물어본다. 임의로 커밋하지 않는다.
- **승격될 커밋이 없으면**: "이미 최신입니다"라고 보고하고 종료한다.
- **승격될 커밋 목록을 사용자에게 먼저 보여준다** — 무엇이 프로덕션에 나가는지 알 수 있게.

## 2. staging 검증 상태 확인

사용자가 staging 도메인(`stage.j-a-m.app`)에서 확인을 마쳤다는 전제로 진행한다.
확인 여부가 불분명하면 **묻는다** — "스테이징에서 확인하셨나요?"

staging 배포 자체가 실패한 상태면 프로덕션 승격은 의미가 없으므로 먼저 확인한다:

```bash
NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel ls jam-stage --scope standard-manual
```

## 3. 배포 전 점검표

항목마다 확인 명령·방법을 붙인다. JAM에 해당하는 장치가 없는 항목은 건너뛰지 않고 「제외
목록」에 사유를 남긴다.

### 코드 품질
- [ ] `scripts/verify.sh` 통과 — main push는 `.githooks/pre-push`가 `JAM_SHIP=1` 여부만 보고
  lint·typecheck·test를 다시 돌리지 않는다(staging push는 lint와 기준 방어만, 리뷰 브랜치 push는
  전체 verify와 CI를 돈다. staging과 main에는 CI가 없다). 이 단계가 승격 전 유일한 재검증이다.

### 보안
- [ ] 비밀값 미노출·새 API 라우트 인증·마이그레이션 되돌림 SQL(아래 「인프라」·4단계가 같은 결과를
  쓴다) — `node scripts/deploy-gate.mjs check`. `git fetch origin` 뒤에 실행한다. 범위 기본값은
  `origin/main` → `origin/staging`이고 두 팁의 트리 비교라 얕은 복제에서도 돈다. 종료 코드가 0이
  아니면(1 차단 · 2 게이트 실행 오류) 승격을 멈춘다.
  - 비밀값: jam-web에서 추가된 줄의 실제 비밀 형태만 잡는다. 걸리면 실제 값이 커밋된 것이니
    승격을 멈추고, 출력이 알려 주는 파일·줄에서 값을 폐기·교체한다.
  - 새 API 라우트: 인증 확인 호출이 없는 라우트는 의도한 공개 라우트인지 해당 티켓에서 근거를
    확인한다. 근거가 있으면 `docs/agents/contract.json`의 `deploy_gate.public_routes`에 등록해
    staging에 반영한 뒤 다시 실행하고, 근거가 없으면 승격을 멈춘다.
- [ ] 의존성 취약점 — `cd jam-web && npm audit --omit=dev` (critical·high 0건)
- [ ] (해당 시) 새 `SECURITY DEFINER` 함수가 있으면 `REVOKE ... FROM PUBLIC` 처리 여부 확인
  (가드레일 패턴 8)

### 성능
- [ ] Vercel 빌드 로그에 경고 없음 — 8단계 `vercel inspect <url> --logs`에서 겸해 확인한다.
- [ ] (해당 시) 새 쿼리에 인덱스가 필요하면 Supabase 성능 어드바이저로 확인

### 접근성
- [ ] (해당 시) MODULAR 컴포넌트를 변경했으면 Storybook `@storybook/addon-a11y` 패널에서
  확인한다 (전체 페이지 자동 검사는 없음 — 「제외 목록」 참고).

### 인프라
- [ ] 환경변수 —
  `NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel env ls production --scope standard-manual`을
  `jam-web/.env.example` 항목과 대조한다.
- [ ] 마이그레이션 적용 여부 — `jam-web/supabase/migrations/`의 신규 파일이 실제 운영 DB에
  적용됐는지 확인한다(가드레일 패턴 2). `supabase_migrations.schema_migrations`는 전수 기록이
  아니므로 의심되면 Supabase MCP로 실물을 대조한다. 되돌림 SQL의 동반 여부는 「보안」의
  `deploy-gate.mjs check`가 확인한다.
- [ ] 루트 응답(DNS·SSL 겸함) — 8단계의 `curl https://j-a-m.app` 확인으로 겸한다.

### 문서
- [ ] 이번에 승격되는 티켓들의 완료 기록·문서 갱신안이 커밋에 반영됐는지 확인한다
  (`docs/tickets/`).
- [ ] 이번 변경이 건드리는 PRD·컨텐츠·배지엔진 문서(`CLAUDE.md` 문서 체계 ①~⑤)가 최신인지
  확인한다.

### 제외 목록 (JAM에 해당 없음)

| 항목 | 사유 |
|---|---|
| 번들 크기 예산 | 정의된 기준이 없다 |
| Core Web Vitals 수치 게이트 | Lighthouse CI 등 자동 측정 도구를 도입하지 않았다 |
| 전체 페이지 자동 접근성 검사(axe-core·Lighthouse CI) | 미도입 — a11y addon은 Storybook 컴포넌트 단위만 커버한다 |
| 전용 헬스체크 엔드포인트 | 없다 — 루트 `curl` 응답 확인이 그 역할을 대신한다 |
| CDN 설정 | Vercel이 자동 처리하고 JAM이 별도로 설정하는 값이 없다 |
| 캐싱 설정 | Vercel·Next.js 기본값을 쓰고 JAM 자체 캐시 정책이 없다 |
| Changelog 파일 갱신 | 연속 배포 구조라 changelog를 두지 않는다 — 티켓이 이력을 대신한다 |

> 이식 출처: `shipping-and-launch` skill §The Pre-Launch Checklist.

## 4. 롤백 계획 (main 승격 전 필수)

아래 네 칸이 채워지지 않으면 7단계(main 승격)로 진행하지 않는다.

- **트리거 조건**: 8단계에서 프로덕션 루트 응답이 200이 아니거나 타임아웃 / 9단계에서 배포
  시각 이후 오류성 이벤트나 동기화 실패가 새로 나타났고 이번 배포의 변경과 관련이 있어 보임 /
  사용자가 특정 기능 오류를 신고. 에러율 기준선이 아직 없으므로(「하지 않는 것」의 오류 예산
  항목) "기준 대비 몇 배" 같은 수치 조건은 쓰지 않는다.
- **절차**: 트리거 조건이 충족되면 먼저 사용자에게 상황을 보고하고 롤백 승인을 받는다(승인 없는
  롤백은 「하지 않는 것」에 해당한다). 승인되면 직전 Ready 배포 URL을
  `vercel ls --scope standard-manual`(8단계와 같은 명령)으로 확인한 뒤
  `NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel rollback <그 URL> --scope standard-manual`로
  alias를 되돌린다(확인 프롬프트가 없어 `--yes`는 필요 없다). 새 커밋·재빌드 없이 되돌리므로 main에
  `git revert`를 만들지 않는다. 되돌린 뒤 8단계를 다시 확인하고(`node scripts/deploy-gate.mjs served`가
  읽는 서빙 배포 id가 되돌린 배포의 id로 바뀌었는지 포함) 롤백 사실과 원인을 보고한다.
- **롤백 이후의 복구**: Vercel은 롤백을 실행한 뒤 프로덕션 도메인 자동 할당을 끈다. 그 상태에서는
  main에 push한 새 배포가 Ready가 돼도 공개되지 않는다. 원인을 고친 새 배포를 공개할 때는
  `NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel promote <새 배포 URL> --scope standard-manual`로
  승격한다. 이 명령이 자동 할당도 다시 켠다. 되돌린 배포는 그 배포를 만들 때의 환경변수와 cron
  설정으로 돌아간다는 점도 함께 보고한다(Vercel 문서 「Performing an Instant Rollback」). 승격 뒤
  서빙 배포가 원래 배포로 돌아온 것은 스테이징 연습에서 확인했다. 다만 **자동 할당 플래그 자체는
  CLI와 프로젝트 조회 어디에도 노출되지 않아 직접 확인하지 못했다**(문서 근거). 복구 뒤 처음 만드는
  배포가 자동으로 공개되는지 8단계로 확인한다.
- **목표 복구 시간**: 코드는 롤백 승인 후 1분 이내. 스테이징(`jam-stage`) 실측(2026-09-22, 티켓
  20260922_0002)에서 `vercel rollback` 명령이 약 5초에 끝났고(npx 기동 0.7초 포함) 페이지가 서빙하는
  배포는 명령이 끝난 지 1초 뒤에 바뀌었다. 복구(`vercel promote`)도 명령 약 5.6초에 반영 1.2초였다.
  프로덕션 프로젝트는 실사용자가 있어 연습하지 않았고, 같은 팀의 같은 기능이라 같다고 본다.
  DB는 되돌림 SQL이 있으면 사용자 승인 후 즉시, 없으면 원래 이번 배포에 포함하지 않았어야 한다.
- **DB 고려**: Supabase는 staging·프로덕션 공용 단일 DB라 코드 롤백이 DB 변경을 되돌리지
  않는다. 이번 배포에 새 번호 마이그레이션이 있으면 되돌림 SQL이 동반돼 있는지는 3단계
  「보안」의 `node scripts/deploy-gate.mjs check`가 확인한다(`jam-developer.md`의 `db` 규칙과 같은
  기준이다. `seed_*.sql`은 1회성 데이터 스크립트라 요구하지 않는다).

> 이식 출처: `shipping-and-launch` skill §Rollback Strategy 양식.

## 5. 병렬 점검

4단계 롤백 계획 뒤, 6단계 완료 기준 전에 돈다. 카리나가 민지(`jam-reviewer`)를 **한 턴에 모드
②(배포 전 보안 점검)·③(배포 전 테스트 공백 점검)으로 동시에** 호출한다(순차 호출 금지 — 원본
`ship.toml`의 제약). 커밋 범위는 1단계에서 이미 확인한 `origin/main..origin/staging`을 그대로
넘긴다.

### 생략 조건
`git diff --numstat origin/main origin/staging -- jam-web`의 추가+삭제 합계가 0줄이면(문서만
바뀐 배포) 병렬 점검을 건너뛰고 10단계 보고에 "해당 없음(jam-web 변경 0줄)"이라고 적는다. 그
밖의 유인 배포는 항상 돌린다 — 원본의 "2파일 이하·50줄 미만" 같은 규모 기준은 쓰지 않는다(인증
관련 변경은 한 줄이어도 위험할 수 있다).

### 병합 규칙
- **보안 중단급 발견** → 승격을 차단한다. 사용자에게 보고하고 진행 여부는 사용자가 결정한다.
- **보안 주의급 발견** → 보고한다. 진행 여부는 사용자가 결정한다(차단하지 않는다).
- **테스트 공백** → 주의로 보고한다. 차단하지 않는다.
- 이번 배포에서 처리하지 않는 발견물은 `.claude/skills/jam-work/SKILL.md` 3.2절(범위 밖 발견물
  처리 — 자동 티켓화)과 같은 방식으로 티켓이 된다.

### `deploy-gate.mjs`와의 역할 구분
`node scripts/deploy-gate.mjs check`(3단계 「보안」)는 비밀값·신규 API 라우트 인증·되돌림 SQL을
기계로 잡는다. 민지 모드 ②·③은 그 기계 검사가 못 잡는, 판단이 필요한 위협 모델링·테스트
공백을 본다 — 서로 대체하지 않는다.

무인 배포 경로에는 적용하지 않는다 — 「주간 무인 배포와의 관계」 참고.

결과는 10단계 보고에 「병렬 점검」 항목으로 남긴다.

> 이식 출처: agent-skills 플러그인 `commands/ship.toml` Phase A·B(티켓 20260922_1523).

## 6. 완료 기준(Definition of Done) — 마지막 관문

7단계(main 승격) 직전, `definition-of-done.md`의 「배포 준비」 네 항목이 전부 충족돼야
진행한다. 하나라도 비어 있으면 멈추고 보고한다.

→ `.claude/skills/jam-work/references/definition-of-done.md` 「배포 준비」

## 7. main 승격

6단계 완료 기준을 통과한 뒤에만 진행한다.

```bash
git -C "<repo>" checkout main
git -C "<repo>" merge --ff-only origin/staging   # ff 불가 시 상태를 보고하고 판단을 구한다
JAM_SHIP=1 git -C "<repo>" push origin main      # pre-push 훅 통과용 환경변수
git -C "<repo>" checkout staging                 # 작업 브랜치로 복귀
```

`.githooks/pre-push`는 `JAM_SHIP=1`이 없는 main push를 차단한다. 이 스킬이 유일한 승인 경로다.
끝 커밋 작성자가 `@example.com`이면 같은 훅이 push를 차단한다(티켓 20260921_1231).

## 8. 배포 검증 (여기까지 해야 "배포 완료"다)

```bash
NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel ls --scope standard-manual
NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel inspect <최신-배포-url> --scope standard-manual
```

확인 항목:
- 최신 배포 상태가 **Ready**인가 (Building이면 완료까지 기다린다)
- **alias가 그 배포를 가리키는가** (`j-a-m.app` 등 프로덕션 도메인). 최신 배포가 Ready인데
  alias가 옛 배포에 머물러 있으면 이전 롤백으로 자동 할당이 꺼져 있는 상태다(4단계 「롤백
  이후의 복구」).
- Error면 빌드 로그를 확인해 원인을 보고한다 (`vercel inspect <url> --logs`)

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://j-a-m.app
node scripts/deploy-gate.mjs served
```

`served`는 프로덕션 도메인이 **실제로 서빙 중인 배포 id**를 출력한다(공개 페이지 응답 HTML의
`?dpl=dpl_…`, Vercel 인증 불필요). 이 id를 위 `vercel inspect`가 알려 주는 최신 배포의 id와
대조한다. 같으면 새 배포가 공개된 것이다. 다르면 아직 전환 전이거나 자동 할당이 꺼진 상태이므로
보고하고, 롤백 뒤라면 4단계 「롤백 이후의 복구」의 `vercel promote`가 필요한지 판단한다. `curl`의
200 응답은 옛 배포도 내므로 새 배포가 공개됐다는 증거가 되지 못한다. 종료 코드 2(네트워크 오류·
시간 초과)·3(응답은 왔으나 식별자 없음)이면 대조하지 못한 것이므로 "확인 불가"로 보고한다.

> TLS 오류(`unable to get local issuer certificate`)가 나면:
> `security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > /tmp/system-ca.pem`

## 9. 배포 후 검증 (배포 직후)

카리나가 배포 직후 확인한다:
- 스테이징 자동 로그인 경로(`stage.j-a-m.app`, `/api/dev-login`)로 핵심 화면(홈피드·프로필
  등) 응답을 확인한다 — 프로덕션은 구글 로그인이 필수라 로그인 후 화면을 직접 볼 수 없으므로,
  같은 코드가 올라간 staging에서 대신 확인한다(`jam-developer.md` 규칙 10).
- `engine_decision_log`에서 배포 시각 이후 오류성 이벤트(`point_award_failed`·
  `tribe_constant_missing`·`drop_state_last_activity_mismatch`)가 급증했는지 확인한다.
- `strava_sync_failures` 테이블에서 배포 시각 이후 건수를 확인한다.

이후의 지속 관찰(Strava 동기화 실패율, 핵심 플로우 일일 점검)은 카즈하의 「① 실행 점검」
(`jam-ops.md`)이 매일·주 1회 종합으로 이미 돈다 — 여기서 새 루틴을 만들지 않는다.

> 이식 출처: `shipping-and-launch` skill §Post-Launch Verification.

## 10. 보고

배포 완료 후 사용자에게:
- 프로덕션에 올라간 커밋 목록 (한국어 요약)
- 배포 URL과 Ready 확인 결과, alias 연결 상태
- 이번 배포에 포함된 DB 마이그레이션이 있으면 **실행 여부를 명시**
- **롤백 계획 요약** (4단계에서 정한 트리거·절차·목표 시간·DB 고려) — 롤백 계획이 없으면
  7단계로 진행하지 않았어야 한다.
- **병렬 점검 결과** (5단계) — 민지 모드 ②·③의 발견물 개수·신호 분포, 생략했으면 사유
  ("해당 없음(jam-web 변경 0줄)"), 범위 밖 발견물로 만든 티켓 경로

## 주간 무인 배포와의 관계

목요일 23:59 KST 무인 배포는 이 스킬의 일부만 수행한다. 범위·사유·절차의 단일 원천은
`.claude/skills/jam-work/references/scheduled-jobs.md` 「주간 배포 승인」 절(「무인 경로에 적용하는
점검」 표와 「배포 실행」)이다. 여기에는 단계별 대응만 적는다(티켓 20260922_0001).

| 이 스킬의 단계 | 무인 경로 |
|---|---|
| 1 사전 확인 | 수행 |
| 2 staging 검증 상태 | 수행 (스테이징 `curl` 확인) |
| 3 배포 전 점검표 | 일부 수행 — `node scripts/deploy-gate.mjs check`가 보는 비밀값·마이그레이션 되돌림 SQL·새 API 라우트 인증. 그 밖의 항목(`verify.sh`·`npm audit`·환경변수·마이그레이션 적용 여부)은 미수행 |
| 4 롤백 계획 | 롤백은 하지 않는다(이상이 보이면 `#jam-alert`) |
| 5 병렬 점검 | 미수행 — 무인 실행은 승인 주체가 없고 비용 상한이 있어 민지 모드 ②·③을 호출하지 않는다 |
| 6 완료 기준 | 미수행 |
| 7 main 승격 | 수행 |
| 8 배포 검증 | 수행 — 헬스체크에 더해 `node scripts/deploy-gate.mjs served`로 서빙 배포 id가 바뀌었는지 확인 |
| 9 배포 후 검증 | 미수행 |

## 하지 않는 것

- 로그인이 필요한 화면의 육안 확인 (구글 로그인 필수라 불가 — 사용자 몫)
- 사용자 승인 없는 재배포·롤백
- staging을 건너뛴 main 직접 커밋
- 규모 기준(파일 수·줄 수)으로 병렬 점검(5단계)을 생략하지 않는다 — `jam-web` 변경이 0줄일
  때만 건너뛴다
- 단계 배포(카나리·퍼센트 롤아웃)와 기능 플래그 단계 전략 — Vercel은 프로덕션 별칭(alias)이
  하나뿐이라 트래픽을 퍼센트로 나눠 배포할 수 없다. 9단계 배포 후 검증과 4단계 롤백 계획으로
  대신한다.
- 오류 예산(Error Budget) 게이트 — 정상 에러율 기준선이 있어야 성립하는데, 카즈하의 지표 정상
  범위 정의가 아직 도입 후 과제로 남아 있다
  (`.claude/skills/jam-work/references/loop-improvements.md` 항목 7). 정해진 뒤 후속 티켓에서
  도입한다.
