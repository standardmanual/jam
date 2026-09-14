# 이슈 트래커: JAM! 자체 티켓 체계

이 저장소는 GitHub Issues를 쓰지 않는다. 이슈·작업 계획은 `Service Plan/Tickets/`에 마크다운
파일로 기록하며, 파일명·frontmatter·상태값 규칙은 `/jam-docs` 스킬이 정의하고
`.githooks/pre-commit`이 형식을 기계적으로 검증한다.

## 규칙

- **티켓 생성**: 파일명은 `P{우선순위}-{기한}/{YYYYMMDD}_{HHMM}_{제목}-{작업자}-{상태}.md` 형식을
  따른다. 정확한 규칙은 `/jam-docs` 스킬 참조. 새 티켓 생성 요청은 `/jam-work` 또는 `/jam-docs`로
  라우팅한다.
- **티켓 조회**: `Service Plan/Tickets/` 하위를 파일명·frontmatter(status 필드 등)로 검색한다.
- **티켓 상태 변경**: frontmatter의 status 필드를 갱신하고, CLOSED 처리는 `/jam-docs` 절차를
  따른다(원격 staging 기준 브랜치에서 커밋).
- **작업 파이프라인**: 티켓 검토 → 구현 → 게이트 리뷰(conservative-reviewer) → 개선 리뷰
  (progressive-reviewer) → 승인 후 머지·문서 갱신까지는 `/jam-work` 스킬이 전체를 처리한다.

## PR을 트리아지 대상으로 볼지

**PR을 요청 표면으로 사용하지 않음.** 이 저장소는 외부 PR을 통한 기능 요청 흐름을 쓰지 않는다.
모든 변경은 `staging` 브랜치로 병합되고, `main`으로의 승격은 사용자 승인 후 `/jam-ship`으로만
진행한다.

## 스킬이 "이슈 트래커에 발행"이라고 말할 때

`Service Plan/Tickets/`에 규칙에 맞는 새 마크다운 티켓 파일을 만드는 것으로 해석한다.

## 스킬이 "관련 티켓을 가져오라"고 말할 때

`Service Plan/Tickets/`에서 관련 파일을 찾아 읽는 것으로 해석한다.
