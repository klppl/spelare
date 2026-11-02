// The content scripts in extension/ must be the current build of src/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { buildContentScripts, pageScript, PAGE_SCRIPTS, substitutePageScripts } from '../scripts/build.mjs';
import { CONTENT_SCRIPTS, MAC_JS, extractInjectedScripts } from '../scripts/lib/mac-source.mjs';

test('extension/mac.js and observer.js are up to date with src/ (run npm run build)', () => {
    const built = buildContentScripts();
    assert.deepEqual(Object.keys(built).sort(), Object.keys(CONTENT_SCRIPTS).sort());
    for (const [file, code] of Object.entries(built)) {
        assert.ok(fs.readFileSync(CONTENT_SCRIPTS[file], 'utf8') === code, `extension/${file} is stale`);
    }
});

test('the 170 KB stream observer ships only in the top-frame observer.js', () => {
    assert.ok(!fs.readFileSync(MAC_JS, 'utf8').includes('__tubelessJSC'));
    assert.deepEqual(Object.keys(extractInjectedScripts([fs.readFileSync(CONTENT_SCRIPTS['observer.js'], 'utf8')])), ['stream-observer']);
    const manifest = JSON.parse(fs.readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
    const entries = manifest.content_scripts.filter((entry) => entry.js.includes('observer.js'));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].all_frames, false);
    assert.equal(entries[0].run_at, 'document_start');
    assert.deepEqual(entries[0].matches, ['https://www.youtube.com/*']);
    assert.ok(entries[0].exclude_matches.includes('https://www.youtube.com/shorts*'));
});

test('the built content scripts inject exactly the page scripts in src/page', () => {
    const injected = extractInjectedScripts();
    assert.deepEqual(Object.keys(injected).sort(), Object.keys(PAGE_SCRIPTS).sort());
    for (const name of Object.keys(PAGE_SCRIPTS)) {
        assert.ok(injected[name] === pageScript(name), `${name} differs from src/page`);
    }
});

test('the vendored yt-dlp/ejs solver is unmodified (see src/page/vendor/README.md)', () => {
    const vendor = fs.readFileSync(new URL('../src/page/vendor/yt-dlp-ejs.js', import.meta.url));
    assert.equal(
        crypto.createHash('sha256').update(vendor).digest('hex'),
        '1ad9f6f4e0354768aad22b7ca7c2ac8477f2a779f15f74768263e1eb893fd4d6',
    );
});

test('placeholders must name a known page script with a string literal', () => {
    assert.throws(() => pageScript('nope'), /Unknown page script "nope"/);
    assert.throws(() => substitutePageScripts('__SPELARE_PAGE_SCRIPT__(name)', String), /one string literal/);
    const { output, names } = substitutePageScripts('a(__SPELARE_PAGE_SCRIPT__("x"));', (name) => JSON.stringify(`<${name}>`));
    assert.equal(output, 'a("<x>");');
    assert.deepEqual(names, ['x']);
});
