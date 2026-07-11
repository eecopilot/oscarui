import assert from 'node:assert/strict';

import { loadAppConfig } from '../app-config.mjs';
import { COMPONENT_DIR, ROOT, SCREEN_DIR, SRC_ROOT } from '../project-paths.mjs';
import { loadComponents, loadScreens, loadTokens } from '../source-loader.mjs';
import { createRuntimeBundle, verifyRuntimeBundle } from './bundle.mjs';
import { canonicalStringify } from './canonical-json.mjs';
import { runtimeCompatibilityProblems } from './validation.mjs';
import { createSchemaValidators } from '../schema-validators.mjs';

const project = {
  screens: loadScreens(ROOT, SCREEN_DIR, SRC_ROOT),
  components: loadComponents(ROOT, COMPONENT_DIR, SRC_ROOT),
  tokens: loadTokens(SRC_ROOT),
  appConfig: loadAppConfig(ROOT),
};

const first = createRuntimeBundle(ROOT, project);
const second = createRuntimeBundle(ROOT, project);
const { validateRuntimeBundleSchema } = createSchemaValidators(ROOT);
assert.equal(canonicalStringify(first), canonicalStringify(second), 'runtime bundle must be deterministic');
assert.equal(validateRuntimeBundleSchema(first), true, 'runtime bundle envelope must satisfy its schema');
assert.equal(verifyRuntimeBundle(first).ok, true, 'fresh runtime bundle must verify');
assert.equal(verifyRuntimeBundle({ ...first, content: `${first.content} ` }).ok, false, 'tampered content must fail verification');

const smokeScreen = {
  file: 'runtime/smoke.ui.yaml',
  ir: {
    screen: 'RuntimeSmoke',
    body: [{
      type: 'column', children: [
        { type: 'row', children: [{ type: 'text', value: 'text' }, { type: 'spacer' }] },
        { type: 'image', url: 'https://example.com/image.png' },
        { type: 'button', label: 'button', action: 'tap' },
        { type: 'textField', bind: 'value' },
        { type: 'list', bind: 'items', itemTemplate: [{ type: 'listRow', titleBind: 'item.title', action: 'tap' }] },
        { type: 'component', name: 'SmokeComponent', props: { title: 'value' } },
      ],
    }],
  },
};
assert.deepEqual(runtimeCompatibilityProblems([smokeScreen], []), [], 'all core runtime node types must be accepted');

const cyclic = [
  { file: 'a', ir: { component: 'A', body: [{ type: 'component', name: 'B' }] } },
  { file: 'b', ir: { component: 'B', body: [{ type: 'component', name: 'A' }] } },
];
assert.equal(runtimeCompatibilityProblems([], cyclic).some(report => report.problems.some(problem => problem.includes('component cycle'))), true);

console.log('✓ runtime bundle determinism, integrity, node coverage, and cycle checks');
