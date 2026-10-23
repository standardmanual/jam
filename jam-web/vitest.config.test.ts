// 티켓 20261021_1018 — vitest 제외 목록이 vitest 스위트를 말없이 가리지 않도록 지킨다.
// 폴더 단위 제외(`**/missions/__tests__/**`)는 같은 폴더의 vitest 시험까지 CI에서 빼 버렸다.
// 계약: vitest에서 빠지는 시험 파일 = `package.json`의 `test:node`(tsx)로 도는 시험 파일.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import config from './vitest.config';

const ROOT = __dirname;
// 제외 목록에서 시험 파일을 가리키지 않는 줄: 의존성 폴더와 스토리 파일 패턴
const NON_TEST_PATTERNS = ['**/node_modules/**', '**/*.stories.@(js|jsx|mjs|ts|tsx)'];

const exclude = (config.test?.exclude ?? []) as string[];
const fileExcludes = exclude.filter((p) => !NON_TEST_PATTERNS.includes(p));

// `src` 아래 파일 전체(jam-web 기준 상대 경로, `/` 구분). `fs.globSync`는 @types/node 20에 선언이 없다.
const srcFiles = (fs.readdirSync(path.join(ROOT, 'src'), { encoding: 'utf8', recursive: true }) as string[])
  .map((p) => `src/${p.split(path.sep).join('/')}`)
  .filter((p) => fs.statSync(path.join(ROOT, p)).isFile());

// 제외 패턴 하나가 가리키는 파일(jam-web 기준 상대 경로). 앞의 `**/`만 와일드카드로 푼다.
function resolveExclude(pattern: string): string[] {
  const tail = pattern.replace(/^\*\*\//, '');
  return srcFiles.filter((p) => p === tail || p.endsWith(`/${tail}`));
}

// `test:node` 스크립트의 `for f in <목록>; do` 부분을 파일 경로로 펼친다. 파일 이름 자리의 `*`만 푼다.
function testNodeFiles(): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const listed = /\bin\s+(.+?);\s*do\b/.exec(pkg.scripts['test:node'])?.[1] ?? '';
  return listed
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => {
      if (!token.includes('*')) return [token];
      // 이 저장소의 목록은 `dir/*.test.ts` 꼴(`*` 하나)뿐이다
      const dir = path.posix.dirname(token);
      const [head, tail] = path.posix.basename(token).split('*');
      return fs
        .readdirSync(path.join(ROOT, dir))
        .filter((f) => f.length >= head.length + tail.length && f.startsWith(head) && f.endsWith(tail))
        .map((f) => `${dir}/${f}`);
    });
}

describe('vitest 제외 목록', () => {
  it('폴더나 와일드카드 파일 패턴이 아니라 시험 파일 이름 하나씩만 가리킨다', () => {
    const wide = fileExcludes.filter((p) => !/^\*\*\/[^*]+\.test\.tsx?$/.test(p));
    expect(wide).toEqual([]);
  });

  it('제외 패턴마다 실제 파일 하나가 걸린다 (이름이 바뀌거나 지워진 줄이 남지 않는다)', () => {
    const unmatched = fileExcludes.filter((p) => resolveExclude(p).length !== 1);
    expect(unmatched).toEqual([]);
  });

  it('제외된 시험 파일은 test:node가 도는 파일과 정확히 같다', () => {
    const excluded = fileExcludes.flatMap(resolveExclude).sort();
    expect(excluded).toEqual([...new Set(testNodeFiles())].sort());
  });

  it('test:node가 도는 파일 중에는 vitest 스위트가 없다', () => {
    const vitestSuites = testNodeFiles().filter((f) =>
      /from ['"]vitest['"]|\bvi\.mock\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))
    );
    expect(vitestSuites).toEqual([]);
  });
});
