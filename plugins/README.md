# OscarUI Plugins

Plugins are deterministic extensions around the IR pipeline. They may import design data, add validation, emit alternate outputs, or participate in snapshot verification.

Each plugin lives in its own directory and includes `plugin.json` validated by `schema/plugin.schema.json`.

```json
{
  "name": "figma-basic",
  "version": "0.1.0",
  "description": "Import a constrained Figma export into OscarUI IR.",
  "capabilities": ["importer"],
  "entry": "index.mjs"
}
```

Plugins should read and write IR, tokens, or reports. They should not hand-edit files under `generated/` or `.aic/`.
