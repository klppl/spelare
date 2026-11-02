// hide-guard.js: which element a /shorts/ link hides, and how misses are described.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/browser-globals.mjs';
import { describeElement, isLandmark, shortsHideTarget } from '../src/content/hide-guard.js';

// A tiny element tree: el('ytd-x', { id, regular: true }, ...children).
function el(tag, { id = '', regular = false } = {}, ...children) {
    const node = { tagName: tag.toUpperCase(), id, regular, parentElement: null, children };
    for (const child of children) child.parentElement = node;
    return node;
}
const containsRegularLink = (node) => node.regular || node.children.some(containsRegularLink);
const link = () => el('a');

test('a lone Short in a feed hides its tile', () => {
    const short = link();
    const tile = el('ytd-new-tile-name', {}, el('div', {}, short));
    el('ytd-app', {}, el('div', { id: 'contents' }, tile, el('ytd-video', { regular: true })));
    assert.equal(shortsHideTarget(short, containsRegularLink), tile);
});

test('a shelf of Shorts hides the whole shelf, not just its inner list', () => {
    const first = link();
    const shelf = el('some-shelf', {}, el('div', { id: 'contents' }, el('tile', {}, first), el('tile', {}, link())));
    el('ytd-app', {}, el('div', { id: 'primary' }, el('div', { id: 'contents' }, shelf, el('ytd-video', { regular: true }))));
    assert.equal(shortsHideTarget(first, containsRegularLink), shelf);
});

test('with nothing else on the page, the mark stops at the column', () => {
    const short = link();
    const list = el('div', { id: 'contents' }, el('tile', {}, short));
    el('ytd-app', {}, el('div', { id: 'primary' }, list));
    assert.equal(shortsHideTarget(short, containsRegularLink), list);
});

test('a mark never covers an ordinary video', () => {
    const short = link();
    const tile = el('tile', {}, short);
    const mixed = el('mixed-shelf', {}, tile, el('tile', { regular: true }));
    el('ytd-app', {}, mixed);
    assert.equal(shortsHideTarget(short, containsRegularLink), tile);
});

test('a link sitting directly in a landmark hides nothing', () => {
    const short = link();
    el('ytd-app', {}, el('div', { id: 'related' }, short));
    assert.equal(shortsHideTarget(short, containsRegularLink), null);
});

test('isLandmark knows the page structure and the player', () => {
    assert.ok(isLandmark({ tagName: 'BODY', id: '' }));
    assert.ok(isLandmark({ tagName: 'DIV', id: 'movie_player' }));
    assert.ok(!isLandmark({ tagName: 'YTD-RICH-ITEM-RENDERER', id: '' }));
});

test('describeElement names the element and its ancestors up to a landmark', () => {
    const inner = el('ytm-shorts-lockup-view-model');
    el('ytd-app', {}, el('div', { id: 'primary' }, el('ytd-rich-item-renderer', {}, el('div', { id: 'content' }, inner))));
    assert.equal(describeElement(inner), 'ytm-shorts-lockup-view-model < div#content < ytd-rich-item-renderer');
    const deep = el('a');
    el('ytd-app', {}, el('div', { id: 'primary' }, el('grid-shelf', {}, el('div', {}, el('tile', {}, deep)))));
    assert.equal(describeElement(deep), 'a < tile < div < grid-shelf');
});
