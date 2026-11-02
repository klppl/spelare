// Reads the built content scripts (extension/mac.js, extension/observer.js)
// without running them in a browser.
//
// extractInjectedScripts() pulls out the page-world scripts they inline.
// loadObserverFunctions() evaluates the stream observer's top-level function
// and var declarations (no side effects) in a vm context with stubbed browser
// globals, since that code ships as a string and can't be imported.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MAC_JS = path.join(ROOT, 'extension/mac.js');

// Built content scripts, by file name, with their paths in extension/.
export const CONTENT_SCRIPTS = {
    'mac.js': MAC_JS,
    'observer.js': path.join(ROOT, 'extension/observer.js'),
};

// Each page-world script inlined in a built content script (see
// scripts/build.mjs), identified by a marker it contains.
export const INJECTED_SCRIPTS = {
    'caption-mirroring': '"setupCaptionMirroring"',
    'stream-observer': '__tubelessJSC',
    'player-bridge': 'claimInstall("playerBridge")',
};

export function readMacSource() {
    return fs.readFileSync(MAC_JS, 'utf8');
}

function readContentScripts() {
    return Object.values(CONTENT_SCRIPTS).map((file) => fs.readFileSync(file, 'utf8'));
}

// Returns the statements inside the IIFE at top-level position `index`.
function iifeBody(ast, index, label) {
    const iife = ast.body[index]?.expression?.callee;
    if (iife?.type !== 'ArrowFunctionExpression' && iife?.type !== 'FunctionExpression') {
        throw new Error(`${label}: statement ${index} is no longer an IIFE; update scripts/lib/mac-source.mjs`);
    }
    return iife.body.body;
}

// `sources` defaults to every built content script.
export function extractInjectedScripts(sources = readContentScripts()) {
    const literals = [];
    for (const source of [sources].flat()) {
        const ast = parse(source, { ecmaVersion: 'latest' });
        iifeBody(ast, 0, 'content script');
        (function walk(node) {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'Literal' && typeof node.value === 'string' && node.value.length > 500) {
                literals.push(node.value);
            }
            for (const key in node) walk(node[key]);
        })(ast);
    }

    const scripts = {};
    for (const [name, marker] of Object.entries(INJECTED_SCRIPTS)) {
        const matches = literals.filter((literal) => literal.includes(marker));
        if (matches.length === 0) continue;
        if (matches.length > 1) {
            throw new Error(`Expected one inline script containing ${marker}, found ${matches.length}`);
        }
        scripts[name] = matches[0];
    }
    return scripts;
}

// Every top-level function and var of the Tubeless observer IIFE inside the
// injected stream-observer script (the first IIFE there is the vendored
// yt-dlp/ejs solver), keyed by name. `globals` is merged over the stubs.
export function loadObserverFunctions(globals = {}, source = extractInjectedScripts()['stream-observer']) {
    const ast = parse(source, { ecmaVersion: 'latest' });
    const body = iifeBody(ast, ast.body.length - 1, 'injected-stream-observer');
    return loadDeclarations(source, body, 'injected-stream-observer.js', globals);
}

function loadDeclarations(source, body, filename, globals) {
    const names = [];
    const chunks = [];
    for (const node of body) {
        if (node.type === 'FunctionDeclaration') {
            names.push(node.id.name);
        } else if (node.type === 'VariableDeclaration') {
            names.push(...node.declarations.map((d) => d.id.name));
        } else {
            continue;
        }
        chunks.push(source.slice(node.start, node.end));
    }

    const logs = [];
    const context = vm.createContext({
        URL,
        URLSearchParams,
        fetch: () => Promise.reject(new Error('fetch is stubbed in tests')),
        postMessage: () => {},
        atob,
        btoa,
        encodeURIComponent,
        console,
        setTimeout,
        clearTimeout,
        EventTarget,
        Event,
        location: new URL('https://www.youtube.com/'),
        navigator: { language: 'en-US', mediaSession: {} },
        document: { querySelector: () => null, querySelectorAll: () => [] },
        performance: { now: () => 0, getEntriesByType: () => [] },
        HTMLMediaElement: { HAVE_METADATA: 1, HAVE_FUTURE_DATA: 3 },
        browser: {
            runtime: { sendMessage: (message) => { logs.push(message); return Promise.resolve(); } },
            storage: { sync: { set: () => Promise.resolve(), get: () => Promise.resolve({}) } },
        },
        ...globals,
    });
    context.window = context.window ?? context;

    const exportList = names.map((name) => `${JSON.stringify(name)}: () => ${name}`).join(',\n');
    const code = `${chunks.join('\n')}\n({${exportList}})`;
    const getters = vm.runInContext(code, context, { filename });

    // Getters so tests see vars that functions reassign (e.g. c.streams).
    const fns = {};
    for (const name of names) Object.defineProperty(fns, name, { get: getters[name], enumerable: true });
    return { fns, context, logs };
}
