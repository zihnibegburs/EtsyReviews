import esbuild from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TMP = path.join(__dirname, '.tmp');

const obfuscateEnabled = !process.argv.includes('--no-obfuscate');

const OBFUSCATOR_OPTIONS = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 5,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.75,
    transformObjectKeys: false,
    stringArrayCallsTransform: false,
    reservedNames: [
        'API',
        'API_CONFIG',
        'StorageManager',
        'SubscriptionHelper',
        'ReviewFetcher',
        'chrome',
        'globalThis',
        'computeReviewStats',
        'getReviewsByMonth',
        'getTopKeywords',
    ],
    unicodeEscapeSequence: false,
};

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return;
    ensureDir(destDir);
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const src = path.join(srcDir, entry.name);
        const dest = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            copyDir(src, dest);
        } else {
            copyFile(src, dest);
        }
    }
}

function obfuscate(code, label) {
    if (!obfuscateEnabled) return code;
    const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
    console.log(`obfuscated ${label}`);
    return result.getObfuscatedCode();
}

async function bundle(entryPath, outfile, { format = 'iife' } = {}) {
    await esbuild.build({
        entryPoints: [entryPath],
        outfile,
        bundle: true,
        format,
        platform: 'browser',
        target: 'chrome110',
        minify: true,
        legalComments: 'none',
        logLevel: 'silent',
    });
}

function patchPopupHtml(html) {
    return html.replace(
        /(\s*)<script src="\.\.\/utils\/config\.js"><\/script>\s*<script src="\.\.\/utils\/storage\.js"><\/script>\s*<script src="\.\.\/utils\/subscription\.js"><\/script>\s*<script src="\.\.\/utils\/api\.js"><\/script>\s*<script src="popup\.js"><\/script>/,
        '$1<script src="popup.bundle.js"></script>'
    );
}

function stripUtilsScripts(html) {
    return html
        .replace(/\s*<script src="utils\/config\.js"><\/script>/g, '')
        .replace(/\s*<script src="utils\/subscription\.js"><\/script>/g, '')
        .replace(/\s*<script src="utils\/reviewAnalytics\.js"><\/script>/g, '');
}

function patchOutputHtml(html) {
    return stripUtilsScripts(html).replace(
        /<script src="output\.js"><\/script>/,
        '<script src="output.bundle.js"></script>'
    );
}

function patchCheckoutHtml(html) {
    return stripUtilsScripts(html).replace(
        /<script src="checkout\.js"><\/script>/,
        '<script src="checkout.bundle.js"></script>'
    );
}

function patchManifest(manifest) {
    const next = structuredClone(manifest);
    // Chrome Web Store rejects uploads that include `key` (dev-only, fixes unpacked extension ID).
    delete next.key;
    if (Array.isArray(next.host_permissions)) {
        next.host_permissions = next.host_permissions.filter(
            (permission) => !/^https?:\/\/localhost(:\d+)?\//.test(permission)
        );
    }
    next.web_accessible_resources = [
        {
            resources: [
                'output.html',
                'output.bundle.js',
                'checkout.html',
                'checkout.bundle.js',
            ],
            matches: ['<all_urls>'],
        },
    ];
    return next;
}

function createBackgroundEntry() {
    const backgroundSource = fs.readFileSync(path.join(ROOT, 'background/background.js'), 'utf8');
    const workerSource = backgroundSource.replace(/^importScripts\([^)]+\);\s*/m, '');
    const entryPath = path.join(TMP, 'background.entry.js');
    ensureDir(TMP);
    fs.writeFileSync(
        entryPath,
        [
            "import '../../utils/config.js';",
            "import '../../utils/subscription.js';",
            "import '../../utils/reviewFetcher.js';",
            workerSource,
        ].join('\n')
    );
    return entryPath;
}

async function buildJsBundles() {
    const jobs = [
        {
            entry: path.join(__dirname, 'entries/popup.entry.js'),
            out: path.join(DIST, 'popup/popup.bundle.js'),
            label: 'popup.bundle.js',
        },
        {
            entry: path.join(__dirname, 'entries/output.entry.js'),
            out: path.join(DIST, 'output.bundle.js'),
            label: 'output.bundle.js',
        },
        {
            entry: path.join(__dirname, 'entries/checkout.entry.js'),
            out: path.join(DIST, 'checkout.bundle.js'),
            label: 'checkout.bundle.js',
        },
        {
            entry: createBackgroundEntry(),
            out: path.join(DIST, 'background/background.js'),
            label: 'background.js',
            format: 'iife',
        },
        {
            entry: path.join(ROOT, 'content/content.js'),
            out: path.join(DIST, 'content/content.js'),
            label: 'content.js',
            bundle: false,
        },
    ];

    for (const job of jobs) {
        if (job.bundle === false) {
            const source = fs.readFileSync(job.entry, 'utf8');
            ensureDir(path.dirname(job.out));
            fs.writeFileSync(job.out, obfuscate(source, job.label));
            continue;
        }

        const tempOut = `${job.out}.tmp`;
        await bundle(job.entry, tempOut, { format: job.format || 'iife' });
        const bundled = fs.readFileSync(tempOut, 'utf8');
        fs.writeFileSync(job.out, obfuscate(bundled, job.label));
        fs.unlinkSync(tempOut);
    }
}

async function main() {
    if (fs.existsSync(DIST)) {
        fs.rmSync(DIST, { recursive: true, force: true });
    }
    ensureDir(DIST);

    copyDir(path.join(ROOT, 'icons'), path.join(DIST, 'icons'));
    copyDir(path.join(ROOT, 'styles'), path.join(DIST, 'styles'));
    copyDir(path.join(ROOT, 'vendor'), path.join(DIST, 'vendor'));
    copyFile(path.join(ROOT, 'content/content.css'), path.join(DIST, 'content/content.css'));
    copyFile(path.join(ROOT, 'popup/popup.css'), path.join(DIST, 'popup/popup.css'));

    const popupHtml = patchPopupHtml(fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8'));
    fs.writeFileSync(path.join(DIST, 'popup/popup.html'), popupHtml);

    const outputHtml = patchOutputHtml(fs.readFileSync(path.join(ROOT, 'output.html'), 'utf8'));
    fs.writeFileSync(path.join(DIST, 'output.html'), outputHtml);

    const checkoutHtml = patchCheckoutHtml(fs.readFileSync(path.join(ROOT, 'checkout.html'), 'utf8'));
    fs.writeFileSync(path.join(DIST, 'checkout.html'), checkoutHtml);

    const manifest = patchManifest(JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')));
    fs.writeFileSync(path.join(DIST, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    await buildJsBundles();

    if (fs.existsSync(TMP)) {
        fs.rmSync(TMP, { recursive: true, force: true });
    }

    console.log(
        obfuscateEnabled
            ? 'Build complete: extension/dist (obfuscated)'
            : 'Build complete: extension/dist (minified only)'
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
