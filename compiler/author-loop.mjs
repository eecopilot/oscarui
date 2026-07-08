import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function runStep(root, label, args) {
  const result = spawnSync(process.execPath, [path.join(root, 'compiler/aic.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
  });

  return {
    label,
    ok: result.status === 0,
    command: `node compiler/aic.mjs ${args.join(' ')}`,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function renderFeedback(results) {
  const lines = [
    '# OscarUI AI Feedback',
    '',
    'Use this file as deterministic context for the next IR edit pass. Fix source files, then run `npm run author:loop` again.',
    '',
  ];

  for (const result of results) {
    lines.push(`## ${result.ok ? 'PASS' : 'FAIL'}: ${result.label}`);
    lines.push('');
    lines.push(`Command: \`${result.command}\``);
    lines.push('');
    if (result.stdout) {
      lines.push('Stdout:', '');
      lines.push('```text', result.stdout, '```', '');
    }
    if (result.stderr) {
      lines.push('Stderr:', '');
      lines.push('```text', result.stderr, '```', '');
    }
  }

  return `${lines.join('\n')}\n`;
}

export function runAuthorLoop(root) {
  const results = [
    runStep(root, 'validate IR and semantic constraints', ['validate']),
  ];

  if (results[0].ok) {
    results.push(runStep(root, 'build generated native output', ['build']));
  }

  const outDir = path.join(root, '.aic');
  const outFile = path.join(outDir, 'ai-feedback.md');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, renderFeedback(results));

  console.log(`→ ${path.relative(root, outFile)}`);
  if (results.some(result => !result.ok)) {
    process.exitCode = 1;
  }
  return results;
}
