export function duplicateNames(items, label) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items ?? []) {
    if (seen.has(item.name)) duplicates.add(item.name);
    seen.add(item.name);
  }
  return [...duplicates].map(name => `duplicate ${label} name "${name}"`);
}

export function duplicateFieldNames(fields, label) {
  const seen = new Set();
  const duplicates = new Set();
  for (const field of fields ?? []) {
    if (seen.has(field.name)) duplicates.add(field.name);
    seen.add(field.name);
  }
  return [...duplicates].map(name => `duplicate ${label} field name "${name}"`);
}
