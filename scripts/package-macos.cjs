const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { version, productName, devDependencies } = require('../package.json');
const { stageDesktopApp } = require('./stage-desktop-app.cjs');

async function build() {
  const arch = process.arch;
  if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(arch)) {
    throw new Error('Run this command on macOS with arm64 or x64 Node.js.');
  }

  const { packager } = await import('@electron/packager');
  const output = path.resolve(__dirname, '..', 'dist');
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'comfort-from-salary-'));
  try {
    await stageDesktopApp(staging);
    const [destination] = await packager({
      dir: staging,
      out: output,
      name: productName,
      appBundleId: 'com.comfortfromsalary.desktop',
      electronVersion: devDependencies.electron,
      platform: 'darwin',
      arch,
      overwrite: true,
      osxSign: {
        identity: '-',
        identityValidation: false,
        preAutoEntitlements: false,
        continueOnError: false,
        optionsForFile: file => path.extname(file) === '.app' ? {
          // Ad hoc signatures have no Team ID to match against Electron Framework.
          entitlements: [
            'com.apple.security.cs.allow-jit',
            'com.apple.security.cs.disable-library-validation',
          ],
        } : {},
      },
    });
    const bundle = path.join(destination, productName + '.app');
    const zip = path.join(output, `${productName}-${version}-mac-${arch}.zip`);
    execFileSync('ditto', ['-c', '-k', '--keepParent', bundle, zip], { stdio: 'inherit' });
    console.log(zip);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

build().catch(error => { console.error(error); process.exitCode = 1; });
