import fs from 'node:fs';
import path from 'node:path';

export function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

export function resetPath(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

export function copyFilesByExtension(root, sourceDir, targetDir, extension, missingMessage) {
  const files = fs.readdirSync(sourceDir)
    .filter(file => file.endsWith(extension))
    .sort();

  if (!files.length && missingMessage) {
    throw new Error(missingMessage);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  }

  return files.map(file => ({
    name: file,
    path: path.relative(root, path.join(targetDir, file)),
  }));
}

