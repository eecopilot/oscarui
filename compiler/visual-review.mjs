import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { comparePngFiles } from './png-diff.mjs';

function baselineDirectory(root) { return path.join(root, 'snapshots/baseline'); }

function likelyCauses(root) {
  let files = [];
  try { files = execFileSync('git', ['diff', '--name-only'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch {}
  const causes = [];
  if (files.some(file => file === 'src/theme/tokens.yaml')) causes.push('design token values changed');
  if (files.some(file => file.startsWith('src/screens/') || file.startsWith('src/components/'))) causes.push('screen or component IR changed');
  if (files.some(file => file.startsWith('schema/') || file.startsWith('compiler/'))) causes.push('schema or renderer behavior changed');
  return causes.length ? causes : ['rendering environment or asynchronous content changed'];
}

function currentScreens(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(file => file.endsWith('.compile.ios.png'))
    .map(file => file.slice(0, -'.compile.ios.png'.length));
}

export function acceptVisualBaselines(root) {
  const directory = path.join(root, '.aic/snapshots');
  const baseline = baselineDirectory(root);
  fs.mkdirSync(baseline, { recursive: true });
  let copied = 0;
  for (const screen of currentScreens(directory)) {
    for (const platform of ['ios', 'android']) {
      const source = path.join(directory, `${screen}.compile.${platform}.png`);
      if (!fs.existsSync(source)) continue;
      fs.copyFileSync(source, path.join(baseline, `${screen}.${platform}.png`));
      copied += 1;
    }
  }
  if (!copied) throw new Error('visual baseline: no compile screenshots found; run npm run snapshots first');
  console.log(`→ accepted ${copied} visual baseline image(s)`);
}

export function reviewVisualBaselines(root) {
  const directory = path.join(root, '.aic/snapshots');
  const baseline = baselineDirectory(root);
  const reports = [];
  for (const screen of currentScreens(directory)) {
    for (const platform of ['ios', 'android']) {
      const currentFile = path.join(directory, `${screen}.compile.${platform}.png`);
      const baselineFile = path.join(baseline, `${screen}.${platform}.png`);
      if (!fs.existsSync(currentFile) || !fs.existsSync(baselineFile)) continue;
      const comparison = comparePngFiles(baselineFile, currentFile);
      const changed = comparison.pixelDiffRatio > 0.001;
      reports.push({ screen, platform, changed, ...comparison, highRisk: !comparison.sameCanvas || comparison.pixelDiffRatio > 0.05 });
    }
  }
  const highRisk = reports.some(report => report.changed && report.highRisk);
  const causes = likelyCauses(root);
  const lines = ['# OscarUI Visual Regression Review', ''];
  if (!reports.length) lines.push('No current/baseline screenshot pairs found. Capture and accept a baseline before gating visual changes.', '');
  for (const report of reports) {
    lines.push(`## ${report.screen} — ${report.platform}`, '');
    lines.push(`- Changed: ${report.changed ? 'yes' : 'no'}`);
    lines.push(`- Same canvas: ${report.sameCanvas ? 'yes' : 'no'}`);
    lines.push(`- Pixel diff ratio: ${(report.pixelDiffRatio * 100).toFixed(3)}%`);
    lines.push(`- Mean channel delta: ${report.meanChannelDelta.toFixed(3)}`);
    lines.push(`- Risk: ${report.changed && report.highRisk ? 'high' : report.changed ? 'review' : 'none'}`, '');
  }
  lines.push('## Likely causes', '');
  for (const cause of causes) lines.push(`- ${cause}`);
  lines.push('');
  const file = path.join(directory, 'visual-diff.md');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  console.log(`→ ${path.relative(root, file)}`);
  for (const report of reports) {
    console.log(`${report.changed ? '△' : '✓'} ${report.screen}.${report.platform}: ${(report.pixelDiffRatio * 100).toFixed(3)}% pixels differ${report.highRisk ? ' (high risk)' : ''}`);
  }
  if (!reports.length || highRisk) process.exitCode = 1;
  return { reports, highRisk, file };
}
