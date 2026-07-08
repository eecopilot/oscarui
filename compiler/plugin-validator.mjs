import fs from 'node:fs';
import path from 'node:path';

export function validatePlugins(root, validatePluginSchema) {
  const dir = path.join(root, 'plugins');
  if (!fs.existsSync(dir)) {
    console.log('no plugins/ directory found');
    return [];
  }

  const manifests = fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(dir, entry.name, 'plugin.json'))
    .filter(file => fs.existsSync(file))
    .sort();

  if (!manifests.length) {
    console.log('no plugin manifests found');
    return [];
  }

  let failed = false;
  for (const manifest of manifests) {
    const plugin = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (!validatePluginSchema(plugin)) {
      failed = true;
      console.error(`✗ ${path.relative(root, manifest)}`);
      for (const e of validatePluginSchema.errors)
        console.error(`    ${e.instancePath || '/'} ${e.message}`);
    } else {
      console.log(`✓ ${path.relative(root, manifest)}`);
    }
  }

  if (failed) process.exit(1);
  return manifests;
}

