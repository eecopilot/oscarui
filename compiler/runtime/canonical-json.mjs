function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, normalize(value[key])])
  );
}

export function canonicalStringify(value) {
  return JSON.stringify(normalize(value));
}
