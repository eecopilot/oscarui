import { execFileSync } from 'node:child_process';

export function run(command, args = [], options = {}) {
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

export function runLogged(command, args, root, options = {}) {
  console.log(`$ ${options.formatCommand([command, args], root)}`);
  execFileSync(command, args, {
    stdio: 'inherit',
    cwd: root,
    ...options.execOptions,
  });
}

export function firstLine(text) {
  return text.split('\n').find(Boolean) ?? '';
}

