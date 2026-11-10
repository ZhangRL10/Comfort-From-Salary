const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { version, productName } = require('../package.json');
const { stageDesktopApp } = require('./stage-desktop-app.cjs');

async function build() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Use a Windows x64 machine to build this package.');
  }
  const root = path.resolve(__dirname, '..');
  const electronExe = require('electron');
  const runtime = path.dirname(electronExe);
  const output = path.join(root, 'dist');
  const basename = `${productName}-${version}-win-x64`;
  const destination = path.join(output, basename);
  const app = path.join(destination, 'resources', 'app');
  await fs.mkdir(output, { recursive: true });
  await fs.cp(runtime, destination, {
    recursive: true,
    filter: entry => !['electron.exe', 'electron_wer.dll', 'default_app.asar'].includes(path.basename(entry)),
  });
  await fs.copyFile(electronExe, path.join(destination, productName + '.exe'));
  const crashHelper = path.join(runtime, 'electron_wer.dll');
  await fs.copyFile(crashHelper, path.join(destination, productName + '_wer.dll')).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  await stageDesktopApp(app);

  const zip = path.join(output, basename + '.zip');
  execFileSync('tar.exe', ['-a', '-c', '-f', zip, '-C', output, basename], { stdio: 'inherit', windowsHide: true });
  console.log(zip);
}

build().catch(error => { console.error(error); process.exitCode = 1; });
