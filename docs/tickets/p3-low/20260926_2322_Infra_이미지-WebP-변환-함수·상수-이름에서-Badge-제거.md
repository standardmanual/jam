---
id: "20260926_2322"
category: Infra
priority: P3
status: OPEN
created: 2026-09-26
parent: "20260926_2312"
---

# [Infra] 이미지 WebP 변환 함수·상수 이름에서 Badge 제거

## 핵심 요약

- 요구사항: `convertBadgeImageToWebp`와 `BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX`가 배지 전용처럼 보이지만 실제로는 배지·미션·컬렉션·홈피드 전부에 쓰인다. 이름을 실제 범위에 맞게 바꾼다.
- 구현 계획: 함수·상수·파일 이름을 범용 이름(예: `convertImageToWebp`, `IMAGE_WEBP_MAX_LONG_SIDE_PX`, `imageWebp.ts`)으로 바꾸고 참조를 모두 갱신한다.
- 관련 파일: `jam-web/src/lib/admin/badgeImageWebp.ts`와 이를 참조하는 jam-web 파일 14곳(`git grep -lE "convertBadgeImageToWebp|BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX" -- jam-web`). 적용 API `jam-web/src/app/api/admin/asset-generator/apply/route.ts`, CLI `jam-web/scripts/asset-generator/register-*.mjs`·`make-home-feed-card.mjs`·`*Flow.mjs`와 그 테스트, PRD asset-generator §9 서술.

## 배경 / 문제 정의

티켓 20260926_2312에서 WebP 규격을 1280px로 통일하면서 이 이름이 실제 범위(모든 콘텐츠 유형)와 어긋난 것이 확인됐다. 범위가 커서 그 티켓에서는 이름을 바꾸지 않았다(민지 범위 밖 발견물, 참고).

## 완료 조건

- `git grep -nE "convertBadgeImageToWebp|BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX|badgeImageWebp"`이 코드·문서에서 결과가 없다(과거 티켓 제외).
- `scripts/verify.sh`가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*
