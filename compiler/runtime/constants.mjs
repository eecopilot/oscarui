export const RUNTIME_BUNDLE_FORMAT = 'oscarui.runtime.bundle';
export const RUNTIME_BUNDLE_VERSION = 1;
export const RUNTIME_API_VERSION = 1;
export const UI_SCHEMA_VERSION = 1;
export const RUNTIME_BUNDLE_FILE = 'oscarui.runtime.json';

export const RUNTIME_NODE_KEYS = {
  column: new Set(['type', 'visibleWhen', 'spacing', 'padding', 'align', 'children']),
  row: new Set(['type', 'visibleWhen', 'spacing', 'padding', 'align', 'children']),
  text: new Set(['type', 'visibleWhen', 'value', 'bind', 'role', 'color']),
  image: new Set(['type', 'visibleWhen', 'url', 'height', 'radius']),
  button: new Set(['type', 'visibleWhen', 'label', 'role', 'action']),
  textField: new Set(['type', 'visibleWhen', 'bind', 'placeholder', 'secure', 'keyboard']),
  list: new Set(['type', 'visibleWhen', 'bind', 'itemTemplate']),
  listRow: new Set(['type', 'visibleWhen', 'title', 'titleBind', 'subtitle', 'subtitleBind', 'action']),
  component: new Set(['type', 'visibleWhen', 'name', 'props']),
  spacer: new Set(['type', 'visibleWhen']),
};
