import { execFileSync } from 'node:child_process';
import { formatCommand, iosCommandPlan, prepareIosHost } from './ios-host.mjs';

function run(command, args = [], options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout ?? '').trim(),
      stderr: String(error.stderr ?? error.message ?? '').trim(),
    };
  }
}

function firstLine(text) {
  return text.split('\n').find(Boolean) ?? '';
}

function runLogged(command, args, root) {
  console.log(`$ ${formatCommand([command, args], root)}`);
  execFileSync(command, args, { stdio: 'inherit', cwd: root });
}

function cleanInstalledApp(simulator, bundleId, root) {
  console.log(`→ Removing any previously installed ${bundleId}`);
  run('xcrun', ['simctl', 'terminate', simulator.udid, bundleId]);
  run('xcrun', ['simctl', 'uninstall', simulator.udid, bundleId]);
}

function availableIosSimulators() {
  const result = run('xcrun', ['simctl', 'list', 'devices', 'available', '--json']);
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout };

  try {
    const parsed = JSON.parse(result.stdout);
    const devices = Object.entries(parsed.devices ?? {})
      .filter(([runtime]) => runtime.includes('iOS'))
      .flatMap(([runtime, devices]) => devices.map(device => ({ ...device, runtime })))
      .filter(device => device.isAvailable !== false);
    return { ok: true, devices };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function simulatorRank(device) {
  const name = device.name ?? '';
  const version = Number(name.match(/^iPhone\s+(\d+)/)?.[1] ?? 0);
  let rank = 0;
  if (device.state === 'Booted') rank -= 1000;
  if (!name.startsWith('iPhone')) rank += 100;
  if (!/^iPhone\s+\d+[a-z]?$/i.test(name)) rank += 10;
  rank -= version;
  return rank;
}

function selectIosSimulator(preferred = process.env.AIC_IOS_SIMULATOR) {
  const available = availableIosSimulators();
  if (!available.ok) return { ok: false, error: available.error };
  if (!available.devices.length) return { ok: false, error: 'No available iOS simulators found.' };

  if (preferred) {
    const normalized = preferred.toLowerCase();
    const exact = available.devices.find(device =>
      String(device.udid).toLowerCase() === normalized || String(device.name).toLowerCase() === normalized
    );
    if (exact) return { ok: true, device: exact };

    const partial = available.devices.find(device => String(device.name).toLowerCase().includes(normalized));
    if (partial) return { ok: true, device: partial };

    return { ok: false, error: `No available iOS simulator matched AIC_IOS_SIMULATOR="${preferred}".` };
  }

  const [device] = [...available.devices].sort((a, b) => {
    const rank = simulatorRank(a) - simulatorRank(b);
    return rank || String(a.name).localeCompare(String(b.name));
  });
  return { ok: true, device };
}

function bootSimulator(device, root) {
  if (device.state !== 'Booted') {
    console.log(`$ ${formatCommand(['xcrun', ['simctl', 'boot', device.udid]], root)}`);
    const boot = run('xcrun', ['simctl', 'boot', device.udid]);
    const output = `${boot.stdout}\n${boot.stderr}`;
    if (!boot.ok && !/current state:\s*Booted|already booted/i.test(output)) {
      console.error(output.trim());
      process.exit(1);
    }
  } else {
    console.log(`✓ Simulator already booted: ${device.name} (${device.udid})`);
  }

  runLogged('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], root);

  const opened = run('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', device.udid]);
  if (!opened.ok) {
    console.warn(`warning: could not bring Simulator to front: ${opened.stderr || opened.stdout}`);
  }
}

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

  runLogged(commands[0][0], commands[0][1], root);
  bootSimulator(simulator, root);
  cleanInstalledApp(simulator, host.bundleId, root);
  runLogged(commands[4][0], commands[4][1], root);
  runLogged(commands[5][0], commands[5][1], root);

  console.log('');
  console.log('iOS app is running in Simulator.');
}
