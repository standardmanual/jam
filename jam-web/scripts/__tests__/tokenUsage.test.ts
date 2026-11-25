import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scan } from '../token-usage.mjs';

type Result = {
  files: Record<string, Record<string, number>>;
  totals: Record<string, number>;
};

let root: string;

function write(rel: string, content: string) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'token-usage-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const classes = (r: Result) => r.files['src/app/globals.css'];

describe('token-usage 스캐너', () => {
  it('네 분류를 나눈다', () => {
    write(
      'src/app/globals.css',
      ':root { --a-used: 1px; --b-test: 2px; --c-unused: 3px; }\n@theme inline { --color-jam-dyn: red; }'
    );
    write('src/app/Page.tsx', "export const s = { padding: 'var(--a-used)' };\nexport const c = (k: string) => `bg-jam-${k}`;");
    write('src/app/Page.test.tsx', "expect(x).toBe('var(--b-test)');");
    const r = scan(root) as unknown as Result;
    expect(classes(r)).toMatchObject({ total: 4, used: 1, 'test-only': 1, unused: 1, 'needs-review': 1 });
  });

  it('@theme 변수는 Tailwind 유틸리티 사용도 사용으로 센다', () => {
    write('src/app/globals.css', '@theme inline { --color-surface: #fff; --radius-card: 8px; --color-never: #000; }');
    write('src/app/Card.tsx', "export const C = () => <div className=\"bg-surface/50 hover:rounded-card\" />;");
    const r = scan(root) as unknown as Result;
    expect(classes(r)).toMatchObject({ total: 3, used: 2, unused: 1 });
  });

  it('값에서 참조되는 변수는 참조하는 쪽이 살아 있을 때만 산다', () => {
    write(
      'src/app/globals.css',
      ':root { --base: 1px; --mid: var(--base); --top: var(--mid); --dead-base: 2px; --dead: var(--dead-base); }'
    );
    write('src/app/Page.tsx', "export const s = 'var(--top)';");
    const r = scan(root) as unknown as Result;
    expect(classes(r)).toMatchObject({ total: 5, used: 3, unused: 2 });
  });

  it('정의 자리는 사용으로 세지 않는다', () => {
    write('src/app/globals.css', ':root { --only-defined: 1px; }');
    const r = scan(root) as unknown as Result;
    expect(r.totals).toMatchObject({ total: 1, unused: 1 });
  });
});
