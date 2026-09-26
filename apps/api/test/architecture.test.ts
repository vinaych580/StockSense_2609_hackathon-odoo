/** Only src/inventory/posting.ts may write stock_move or stock_quant. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../src');
const ALLOWED = path.join(SRC, 'inventory', 'posting.ts');
const WRITES =
  /INSERT\s+INTO\s+"?stock_(move|quant)|UPDATE\s+"?stock_(move|quant)|DELETE\s+FROM\s+"?stock_(move|quant)|stock(Move|Quant)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('architecture', () => {
  it('writes stock only through posting.ts', () => {
    const offenders = files(SRC).filter((f) => f !== ALLOWED && WRITES.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
