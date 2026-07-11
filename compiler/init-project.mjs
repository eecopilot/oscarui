import fs from 'node:fs';
import path from 'node:path';

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourceFile = path.join(source, entry.name);
    const targetFile = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(sourceFile, targetFile);
    else fs.copyFileSync(sourceFile, targetFile);
  }
}

function packageName(directory) {
  const normalized = path.basename(directory)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'oscarui-app';
}

function assertEmpty(directory) {
  if (!fs.existsSync(directory)) return;
  const entries = fs.readdirSync(directory).filter(entry => entry !== '.DS_Store');
  if (entries.length) {
    throw new Error(`init: target directory is not empty: ${directory}\nHint: choose an empty directory or move the existing files first.`);
  }
}

export function initProject(toolRoot, targetArgument, version) {
  const target = path.resolve(process.cwd(), targetArgument || '.');
  assertEmpty(target);
  fs.mkdirSync(target, { recursive: true });

  copyDirectory(path.join(toolRoot, 'templates/default/src'), path.join(target, 'src'));
  copyDirectory(path.join(toolRoot, 'schema'), path.join(target, 'schema'));
  copyDirectory(path.join(toolRoot, 'runtime'), path.join(target, 'runtime'));

  const dependency = process.env.OSCARUI_INIT_PACKAGE_SPEC || `^${version}`;
  const manifest = {
    name: packageName(target),
    version: '0.1.0',
    private: true,
    scripts: {
      validate: 'oscarui validate',
      build: 'oscarui build',
      'build:runtime': 'oscarui build:runtime',
      'doctor:ios': 'oscarui doctor:ios',
      'doctor:android': 'oscarui doctor:android',
      'dev:ios': 'oscarui dev:ios',
      'dev:android': 'oscarui dev:android',
      test: 'oscarui test',
    },
    dependencies: { oscarui: dependency },
  };
  fs.writeFileSync(path.join(target, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(target, '.gitignore'), 'node_modules/\n.aic/\n.DS_Store\n*.log\n');

  console.log(`✓ initialized OscarUI project at ${target}`);
  console.log('Next steps:');
  console.log(`  cd ${path.relative(process.cwd(), target) || '.'}`);
  console.log('  npm install');
  console.log('  npm run validate');
  console.log('  npm run dev:ios    # or npm run dev:android');
  return target;
}
