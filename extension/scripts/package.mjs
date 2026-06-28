import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function main() {
    const manifestPath = path.join(DIST, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        console.error('dist/manifest.json not found. Run npm run build first.');
        process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const zipName = `etsy-extension-v${manifest.version}.zip`;
    const zipPath = path.join(ROOT, zipName);

    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }

    execSync(`zip -r -X "${zipPath}" .`, { cwd: DIST, stdio: 'inherit' });

    const sizeKb = Math.round(fs.statSync(zipPath).size / 1024);
    console.log(`Package ready: ${zipName} (${sizeKb} KB)`);
}

main();
