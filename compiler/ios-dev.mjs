import { formatCommand, iosCommandPlan, prepareIosHost } from './ios-host.mjs';
import {
  availableIosSimulators,
  bootSimulator,
  cleanInstalledApp,
  firstLine,
  run,
  runIosLogged,
  selectIosSimulator,
} from './dev/ios-simulators.mjs';

export function doctorIos() {
  const checks = [];

  const developerDir = run('xcode-select', ['-p']);
  checks.push({
    name: 'Developer directory',
    ok: developerDir.ok,
    detail: developerDir.ok ? developerDir.stdout : developerDir.stderr,
  });

  const xcodebuild = run('xcodebuild', ['-version']);
  checks.push({
    name: 'xcodebuild',
    ok: xcodebuild.ok && xcodebuild.stdout.includes('Xcode'),
    detail: xcodebuild.ok ? firstLine(xcodebuild.stdout) : xcodebuild.stderr,
  });

  const simctl = run('xcrun', ['--find', 'simctl']);
  checks.push({
    name: 'simctl',
    ok: simctl.ok,
    detail: simctl.ok ? simctl.stdout : simctl.stderr,
  });

  const devices = simctl.ok ? run('xcrun', ['simctl', 'list', 'devices', 'available']) : { ok: false, stdout: '' };
  const simulators = simctl.ok ? availableIosSimulators() : { ok: false, devices: [] };
  checks.push({
    name: 'iOS simulators',
    ok: devices.ok && simulators.ok && simulators.devices.length > 0,
    detail: devices.ok ? firstLine(devices.stdout) : 'simctl is unavailable',
  });

  for (const check of checks) {
    console.log(`${check.ok ? '✓' : '✗'} ${check.name}${check.detail ? `: ${check.detail}` : ''}`);
  }

  const failed = checks.filter(check => !check.ok);
  if (failed.length) {
    console.error('');
    console.error('iOS CLI development requires full Xcode, not only CommandLineTools.');
    console.error('After installing Xcode, select it with: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer');
    return false;
  }

  return true;
}

export function dryRunIos(root, config) {
  const host = prepareIosHost(root, config);
  const commands = iosCommandPlan(root, undefined, config);

  console.log(`→ ${host.project}`);
  console.log(`→ .aic/ios/${host.appName}/*.swift`);
  console.log(`→ iOS host template: ${host.template}`);
  console.log('');
  console.log('iOS dry run command plan:');
  for (const command of commands) {
    console.log(`$ ${formatCommand(command, root)}`);
  }
}

export function devIos(root, config) {
  const host = prepareIosHost(root, config);
  console.log(`→ ${host.project}`);
  console.log(`→ .aic/ios/${host.appName}/*.swift`);
  console.log(`→ iOS host template: ${host.template}`);

  if (!doctorIos()) {
    process.exit(1);
  }

  const selected = selectIosSimulator();
  if (!selected.ok) {
    console.error(selected.error);
    process.exit(1);
  }
  const simulator = selected.device;
  const commands = iosCommandPlan(root, { udid: simulator.udid }, config);

  console.log('');
  console.log(`Using simulator: ${simulator.name} (${simulator.udid})`);

  runIosLogged(commands[0][0], commands[0][1], root);
  bootSimulator(simulator, root);
  cleanInstalledApp(simulator, host.bundleId);
  runIosLogged(commands[4][0], commands[4][1], root);
  runIosLogged(commands[5][0], commands[5][1], root);

  console.log('');
  console.log('iOS app is running in Simulator.');
}
