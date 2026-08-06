# 배지 이미지 자동 생성 프레임워크

Figma 디자인(배경 + 텍스트 자리)을 기반으로, DB row(POI/아이템 등)마다 텍스트만 바꿔
배지 이미지를 대량 생성하는 재사용 가능한 엔진.

## 구조

```
scripts/badge-image-gen/
├── generate.js              엔진 본체 — 디자인이 달라져도 수정하지 않음
├── configs/
│   └── *.config.js          디자인별 설정 (배경 SVG, 텍스트 위치/폰트, DB 조회, UPDATE SQL)
├── fonts/                   폰트 캐시 (자동 다운로드, git 커밋됨)
└── backgrounds/             배경 SVG 캐시 (자동 다운로드, git 커밋됨)
```

## 새 디자인 추가하는 법

1. Figma MCP로 새 디자인의 `get_design_context` / `get_screenshot`을 확인해 배경 SVG URL,
   텍스트 x/y/width/height/fontSize/color/align 값을 얻는다.
2. `configs/{design-name}.config.js`를 새로 작성한다 (`configs/subway-poi-badge.config.js` 참고).
   - `dataSource(supabase)`: 이미지를 만들 대상 row를 supabase-js 쿼리 빌더로 조회.
     반환하는 각 row의 `id`는 반드시 `badges.id`(PK)여야 한다 — 파일명과 UPDATE 매칭 키로 쓰인다.
   - `updateSqlTemplate`: `badges.image_url`을 반영할 SQL. `{{imagePathPrefix}}`가 치환된다.
3. 실행:
   ```bash
   node scripts/badge-image-gen/generate.js {design-name} --limit 5 --dry-run   # 먼저 소량 검증
   node scripts/badge-image-gen/generate.js {design-name}                       # 전체 실행
   ```
4. 실행 후 `supabase/seed/update_{design-name}_images.sql`이 생성된다 — 이 SQL을 Supabase에
   직접 실행해 `image_url`을 반영한다 ([[feedback_direct_sql_deploy]] 컨벤션).
5. 생성된 PNG(`public/{outputDir}/*.png`) + config + SQL 파일을 커밋한다.

## 필요 환경변수 (.env.local)
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## 실행 시 TLS 에러가 나는 경우
샌드박스 환경은 Node 기본 CA 스토어 문제로 `unable to get local issuer certificate` 에러가 날 수 있다.
```bash
security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > /tmp/system-ca.pem
NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem node scripts/badge-image-gen/generate.js {design-name}
```
