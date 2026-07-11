import { spawnSync } from 'node:child_process';

function command(name) {
  const result = spawnSync('sh', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

const report = {
  platform: process.platform,
  architecture: process.arch,
  node: process.version,
  tools: {
    xcodebuild: command('xcodebuild'),
    xcrun: command('xcrun'),
    adb: command('adb'),
    emulator: command('emulator'),
    java: command('java'),
  },
};

console.log(JSON.stringify(report, null, 2));
console.log('✓ platform environment report completed (missing optional SDK tools do not fail CI)');
