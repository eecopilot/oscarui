import fs from 'node:fs';
import path from 'node:path';
import { comparePngFiles } from '../png-diff.mjs';

export function runtimeSnapshotParity(root, screens) {
  const directory = path.join(root, '.aic/snapshots');
  const reports = [];
  for (const { ir } of screens) {
    for (const platform of ['ios', 'android']) {
      const compileFile = path.join(directory, `${ir.screen}.compile.${platform}.png`);
      const runtimeFile = path.join(directory, `${ir.screen}.runtime.${platform}.png`);
      if (!fs.existsSync(compileFile) || !fs.existsSync(runtimeFile)) continue;
      const comparison = comparePngFiles(compileFile, runtimeFile);
      reports.push({
        screen: ir.screen,
        platform,
        ...comparison,
      });
    }
  }
  const lines = ['# Compile / Runtime Snapshot Parity', ''];
  if (!reports.length) lines.push('No matching compile/runtime screenshot pairs found.', '');
  for (const report of reports) {
    lines.push(`## ${report.screen} — ${report.platform}`, '');
    lines.push(`- Same canvas: ${report.sameCanvas ? 'yes' : 'no'}`);
    lines.push(`- Pixel diff ratio: ${(report.pixelDiffRatio * 100).toFixed(3)}%`);
    lines.push(`- Mean channel delta: ${report.meanChannelDelta.toFixed(3)}`, '');
  }
  const file = path.join(directory, 'runtime-parity.md');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  console.log(`→ ${path.relative(root, file)}`);
  if (!reports.length) process.exitCode = 1;
  return reports;
}
