import fs from 'node:fs';
import path from 'node:path';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';

export function createSchemaValidators(root) {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema/ui-ir.schema.json'), 'utf8'));
  const appConfigSchema = JSON.parse(fs.readFileSync(path.join(root, 'schema/app-config.schema.json'), 'utf8'));
  const pluginSchema = JSON.parse(fs.readFileSync(path.join(root, 'schema/plugin.schema.json'), 'utf8'));
  const runtimeBundleSchema = JSON.parse(fs.readFileSync(path.join(root, 'schema/runtime-bundle.schema.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, discriminator: true });

  return {
    validateSchema: ajv.compile(schema),
    validateAppConfigSchema: ajv.compile(appConfigSchema),
    validatePluginSchema: ajv.compile(pluginSchema),
    validateRuntimeBundleSchema: ajv.compile(runtimeBundleSchema),
  };
}
