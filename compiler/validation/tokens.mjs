export function hasToken(tokens, group, name) {
  return Boolean(name && tokens?.[group] && Object.hasOwn(tokens[group], name));
}

export function themeProblems(tokens) {
  const required = {
    spacing: ['none', 'tight', 'normal', 'loose'],
    size: ['contentCompact', 'contentNormal', 'contentWide', 'controlHeight', 'listRowMinHeight', 'buttonMinWidth', 'borderWidth'],
    radius: ['none', 'small', 'normal', 'large'],
    color: ['primary', 'background', 'fieldBackground', 'listRowBackground', 'border', 'textPrimary', 'textSecondary', 'chevron', 'placeholder', 'onPrimary'],
    typography: ['title', 'heading', 'body', 'caption'],
  };
  const problems = [];
  for (const [group, names] of Object.entries(required)) {
    for (const name of names) {
      if (!hasToken(tokens, group, name)) problems.push(`src/theme/tokens.yaml is missing ${group} token "${name}"`);
    }
  }
  return problems;
}
