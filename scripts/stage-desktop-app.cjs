const fs = require('node:fs/promises');
const path = require('node:path');
const { version, productName, name, main } = require('../package.json');

async function stageDesktopApp(app) {
  const root = path.resolve(__dirname, '..');
  await fs.mkdir(app, { recursive: true });
  await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({ name, version, productName, main }, null, 2));
  await fs.cp(path.join(root, 'desktop'), path.join(app, 'desktop'), { recursive: true });

  const ui = path.join(app, 'prototype');
  await fs.mkdir(ui, { recursive: true });
  const source = path.join(root, 'prototype');
  for (const item of await fs.readdir(source, { withFileTypes: true })) {
    if (item.isFile() && (item.name === 'index.html' || /\.(?:css|js)$/.test(item.name))) {
      await fs.copyFile(path.join(source, item.name), path.join(ui, item.name));
    }
  }
  // Ship the sprite sheets used by the app. The editing references and GIF
  // previews are kept in the source project.
  const art = path.join(source, 'assets', 'yueya');
  for (const state of await fs.readdir(art, { withFileTypes: true })) {
    if (!state.isDirectory()) continue;
    const images = await fs.readdir(path.join(art, state.name));
    const target = path.join(ui, 'assets', 'yueya', state.name);
    await fs.mkdir(target, { recursive: true });
    for (const image of images.filter(file => /\.png$/.test(file))) {
      await fs.copyFile(path.join(art, state.name, image), path.join(target, image));
    }
  }
}

module.exports = { stageDesktopApp };
