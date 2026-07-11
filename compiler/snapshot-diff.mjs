import fs from 'node:fs';
import path from 'node:path';

function readPngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('snapshot diff: expected PNG input');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function comparePair(iosFile, androidFile) {
  const ios = fs.readFileSync(iosFile);
  const android = fs.readFileSync(androidFile);
  const iosSize = readPngSize(ios);
  const androidSize = readPngSize(android);
  const byteDelta = Math.abs(ios.length - android.length);
  const pixelDelta = Math.abs((iosSize.width * iosSize.height) - (androidSize.width * androidSize.height));

  return {
    iosFile,
    androidFile,
    iosSize,
    androidSize,
    byteDelta,
    pixelDelta,
    sameCanvas: iosSize.width === androidSize.width && iosSize.height === androidSize.height,
  };
}

export function diffSnapshots(root, screens, variant = 'compile') {
  const outDir = path.join(root, '.aic/snapshots');
  const reports = [];

  for (const { ir } of screens) {
    const iosFile = path.join(outDir, `${ir.screen}.${variant}.ios.png`);
    const androidFile = path.join(outDir, `${ir.screen}.${variant}.android.png`);
    if (!fs.existsSync(iosFile) || !fs.existsSync(androidFile)) continue;
    reports.push(comparePair(iosFile, androidFile));
  }

  const lines = [
    '# OscarUI Snapshot Diff',
    '',
    reports.length ? '' : 'No matching iOS/Android snapshot pairs found.',
  ];

  for (const report of reports) {
    lines.push(`## ${path.basename(report.iosFile, '.ios.png')}`);
    lines.push('');
    lines.push(`- iOS: ${report.iosSize.width}x${report.iosSize.height}`);
    lines.push(`- Android: ${report.androidSize.width}x${report.androidSize.height}`);
    lines.push(`- Same canvas: ${report.sameCanvas ? 'yes' : 'no'}`);
    lines.push(`- Pixel-count delta: ${report.pixelDelta}`);
    lines.push(`- PNG byte-size delta: ${report.byteDelta}`);
    lines.push('');
  }

  const reportFile = path.join(outDir, 'diff.md');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(reportFile, `${lines.filter((line, index) => index !== 2 || line).join('\n')}\n`);
  console.log(`→ ${path.relative(root, reportFile)}`);
  if (!reports.length) process.exitCode = 1;
  return reports;
}
