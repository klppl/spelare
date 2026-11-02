// scripts/lib/equivalence.mjs must accept behaviour-preserving rewrites and
// reject anything else; later refactors rely on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCanonical } from '../scripts/lib/equivalence.mjs';

const same = (a, b, options) => compareCanonical(a, b, options) === null;
const SYNTAX = { normalizeSyntax: true };
const HOIST = { normalizeSyntax: true, inlineSingleUseFunctions: true };

test('renaming bindings is equivalent', () => {
    assert.ok(same('function f(e){let t=e+1;return t}', 'function add(value){let next=value+1;return next}'));
});

test('name capture, global and property changes are not', () => {
    assert.ok(!same('var x=1;function f(e){return x+e}', 'var x=1;function f(x){return x+x}'));
    assert.ok(!same('function f(e){return foo(e)}', 'function f(e){return bar(e)}'));
    assert.ok(!same('function f(e){return e.a}', 'function f(e){return e.b}'));
});

test('minifier idioms normalise to their plain forms', () => {
    assert.ok(same('function f(a,b){a&&b()}', 'function f(x,y){if(x)y()}', SYNTAX));
    assert.ok(same('function f(a,b){a||b()}', 'function f(x,y){if(!x)y()}', SYNTAX));
    assert.ok(same('var a=!0,b=void 0;', 'var a=true;var b=undefined;', SYNTAX));
    assert.ok(same('function f(a){(a(),a(1))}', 'function f(b){b();b(1)}', SYNTAX));
    assert.ok(same('function f(a){if(a)return void g()}', 'function f(a){if(a){g();return}}', SYNTAX));
    assert.ok(same('function f(a){return a(),g()}', 'function f(a){a();return g()}', SYNTAX));
    assert.ok(same('function f(a){return"x"===a}', 'function f(a){return a==="x"}', SYNTAX));
    assert.ok(!same('function f(a,b){a&&b()}', 'function f(a,b){a||b()}', SYNTAX));
    assert.ok(!same('function f(a){return a<1}', 'function f(a){return 1<a}', SYNTAX));
});

test('declaration kinds only match when explicitly ignored', () => {
    assert.ok(!same('var a=1;', 'const a=1;', SYNTAX));
    assert.ok(same('var a=1;', 'const a=1;', { ...SYNTAX, ignoreDeclarationKind: true }));
});

test('hoisting an IIFE is equivalent only if free variables resolve identically', () => {
    assert.ok(same('function o(){let v=1;(function(x){log(x+v)})(2)}', 'function o(){let v=1;h(2);function h(x){log(x+v)}}', HOIST));
    assert.ok(same('let g=1;function o(){(function(x){log(x+g)})(2)}', 'let g=1;function o(){h(2)}function h(x){log(x+g)}', HOIST));
    assert.ok(!same('let v=0;function o(){let v=1;(function(x){log(x+v)})(2)}', 'let v=0;function o(){let v=1;h(2)}function h(x){log(x+v)}', HOIST));
    assert.ok(!same('function o(){let v=1;(function(x){log(x+v)})(2)}', 'function o(){let v=1;h(2)}function h(x){log(x+v)}', HOIST));
    // A function called twice is not inlined.
    assert.ok(!same('(function(){a()})();(function(){a()})();', 'h();h();function h(){a()}', HOIST));
});

test('compareTopLevel ignores declaration order but not content or statement order', async () => {
    const { compareTopLevel, impureInitializers } = await import('../scripts/lib/equivalence.mjs');
    const base = '(() => { let a = 1; function f(x) { return x + a; } try { a = 2; } catch {} f(1); })();';
    const reordered = '(() => { function f(y) { return y + a; } var a = 1; try { a = 2; } catch {} f(1); })();';
    assert.equal(compareTopLevel(base, reordered, SYNTAX), null);
    assert.deepEqual(compareTopLevel(base, '(() => { let a = 1; function f(x) { return x - a; } try { a = 2; } catch {} f(1); })();', SYNTAX), ['differs: function f']);
    assert.deepEqual(compareTopLevel(base, '(() => { function f(x) { return x + a; } try { a = 2; } catch {} f(1); })();', SYNTAX), ['only before: var a']);
    assert.ok(compareTopLevel(base, '(() => { let a = 1; function f(x) { return x + a; } f(1); try { a = 2; } catch {} })();', SYNTAX));
    assert.deepEqual(impureInitializers('(() => { let a = 1, b = new Map(), c = { d: [true] }, e = load(); })();'), ['e']);
});

test('refuses to compare when esbuild would drop an unused function', () => {
    assert.throws(() => compareCanonical('(function(){function f(x){return x+1}})', '(function(){function f(x){return x-1}})', SYNTAX), /dropped \d+ unused function/);
});
