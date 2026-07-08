import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SRC_ROOT = path.join(ROOT, 'src');
export const SCREEN_DIR = path.join(SRC_ROOT, 'screens');
export const COMPONENT_DIR = path.join(SRC_ROOT, 'components');
export const NATIVE_DIR = path.join(SRC_ROOT, 'native');

