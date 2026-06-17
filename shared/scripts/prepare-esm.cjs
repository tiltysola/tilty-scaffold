const { readdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const outputDir = join(__dirname, '..', 'dist', 'esm');

for (const file of readdirSync(outputDir)) {
  if (file.endsWith('.js')) {
    const filePath = join(outputDir, file);
    const moduleName = file.replace(/\.js$/, '.mjs');
    const modulePath = join(outputDir, moduleName);
    const content = readFileSync(filePath, 'utf8')
      .replace(/from "(.+?)\.js";/g, 'from "$1.mjs";')
      .replace(/sourceMappingURL=(.+?)\.js\.map/g, 'sourceMappingURL=$1.mjs.map');

    writeFileSync(filePath, content);
    renameSync(filePath, modulePath);
  }

  if (file.endsWith('.js.map')) {
    const filePath = join(outputDir, file);
    const mapName = file.replace(/\.js\.map$/, '.mjs.map');
    const mapPath = join(outputDir, mapName);
    const content = readFileSync(filePath, 'utf8').replace(/"file":"(.+?)\.js"/g, '"file":"$1.mjs"');

    writeFileSync(filePath, content);
    renameSync(filePath, mapPath);
  }
}
