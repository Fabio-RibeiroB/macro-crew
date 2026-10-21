import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkStatic } from '../../scripts/check-static.mjs';

test('public allowlist rejects local config and symlinked private files', () => {
  const root = mkdtempSync(join(tmpdir(), 'finstats-static-'));
  try {
    writeFileSync(join(root, '.env.production'), 'dummy');
    assert.throws(() => checkStatic(root, true), /Unreviewed public file/);
    rmSync(join(root, '.env.production'));
    symlinkSync('/does/not/need/to/exist', join(root, 'research_report.json'));
    assert.throws(() => checkStatic(root, true), /Symlink/);
  } finally { rmSync(root, { recursive: true }); }
});
test('credential-shaped build content is rejected without leaking it in errors', () => {
  const root = mkdtempSync(join(tmpdir(), 'finstats-static-'));
  const fake = 'sk-' + 'notARealCredential'.repeat(3);
  try {
    writeFileSync(join(root, 'index.html'), fake);
    assert.throws(() => checkStatic(root), e => /Possible credential/.test(e.message) && !e.message.includes(fake));
    writeFileSync(join(root, 'index.html'), '<h1>FinStats</h1>');
    checkStatic(root);
  } finally { rmSync(root, { recursive: true }); }
});
