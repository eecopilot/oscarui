import { formatCommand } from '../ios-host.mjs';
import { firstLine, run, runLogged } from './process.mjs';

export function runIosLogged(command, args, root) {
  runLogged(command, args, root, { formatCommand });
}

export function cleanInstalledApp(simulator, bundleId) {
  console.log(`→ Removing any previously installed ${bundleId}`);
  run('xcrun', ['simctl', 'terminate', simulator.udid, bundleId]);
  run('xcrun', ['simctl', 'uninstall', simulator.udid, bundleId]);
}

export function availableIosSimulators() {
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

export function selectIosSimulator(preferred = process.env.AIC_IOS_SIMULATOR) {
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

export function bootSimulator(device, root) {
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

  runIosLogged('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], root);

  const opened = run('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', device.udid]);
  if (!opened.ok) {
    console.warn(`warning: could not bring Simulator to front: ${opened.stderr || opened.stdout}`);
  }
}

export { firstLine, run };

