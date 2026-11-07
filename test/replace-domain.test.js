'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const CDN = require('../main.js');

function htmlModifier(config, domain = 'https://example.com') {
    let callback;
    const API = {
        addModifier(name, fn) {
            if (name === 'htmlOutput') {
                callback = fn;
            }
        }
    };

    new CDN(API, 'CDN', { cdnImages: true, cdnGalleries: true, galleryItemSelector: 'figure.gallery__item a', ...config }).addModifiers();

    return html => callback({ siteConfig: { domain } }, html);
}

const rewrite = htmlModifier({ url: 'https://cdn.example.net' });

test('rewrites image src and gallery links on the site domain', () => {
    const output = rewrite('<img src="https://example.com/media/a.jpg"><figure class="gallery__item"><a href="https://example.com/media/big.jpg"></a></figure>');

    assert.match(output, /src="https:\/\/cdn\.example\.net\/media\/a\.jpg"/);
    assert.match(output, /href="https:\/\/cdn\.example\.net\/media\/big\.jpg"/);
});

test('does not rewrite lookalike domains', () => {
    const output = rewrite('<img src="https://example.com.au/a.jpg"><img src="https://example.community/b.jpg">');

    assert.match(output, /src="https:\/\/example\.com\.au\/a\.jpg"/);
    assert.match(output, /src="https:\/\/example\.community\/b\.jpg"/);
});

test('does not rewrite the site domain when it appears later in the URL', () => {
    const output = rewrite('<img src="https://proxy.io/?u=https://example.com/a.jpg">');

    assert.match(output, /src="https:\/\/proxy\.io\/\?u=https:\/\/example\.com\/a\.jpg"/);
});

test('leaves URLs alone when the CDN URL is empty', () => {
    const output = htmlModifier({ url: '' })('<img src="https://example.com/media/a.jpg">');

    assert.match(output, /src="https:\/\/example\.com\/media\/a\.jpg"/);
});

test('leaves URLs alone when the site domain is empty', () => {
    const output = htmlModifier({ url: 'https://cdn.example.net' }, '')('<img src="https://other.com/x.jpg">');

    assert.match(output, /src="https:\/\/other\.com\/x\.jpg"/);
});

test('ignores trailing slashes on either domain', () => {
    const cdnSlash = htmlModifier({ url: 'https://cdn.example.net/' })('<img src="https://example.com/media/a.jpg">');
    const siteSlash = htmlModifier({ url: 'https://cdn.example.net' }, 'https://example.com/')('<img src="https://example.com/media/a.jpg">');

    assert.match(cdnSlash, /src="https:\/\/cdn\.example\.net\/media\/a\.jpg"/);
    assert.match(siteSlash, /src="https:\/\/cdn\.example\.net\/media\/a\.jpg"/);
});

test('adds https:// when the CDN URL has no scheme', () => {
    const output = htmlModifier({ url: 'cdn.example.net' })('<img src="https://example.com/media/a.jpg">');

    assert.match(output, /src="https:\/\/cdn\.example\.net\/media\/a\.jpg"/);
});

test('rewrites every srcset candidate and keeps commas inside URLs', () => {
    const output = rewrite('<img srcset="https://example.com/a.jpg 1x,https://example.com/a@2x.jpg 2x">'
        + '<img srcset="https://example.com/b.jpg, https://example.com/c.jpg">'
        + '<img srcset="https://res.cloudinary.com/demo/w_300,h_200/a.jpg 300w, https://example.com/d.jpg 600w">');

    assert.match(output, /srcset="https:\/\/cdn\.example\.net\/a\.jpg 1x,https:\/\/cdn\.example\.net\/a@2x\.jpg 2x"/);
    assert.match(output, /srcset="https:\/\/cdn\.example\.net\/b\.jpg, https:\/\/cdn\.example\.net\/c\.jpg"/);
    assert.match(output, /srcset="https:\/\/res\.cloudinary\.com\/demo\/w_300,h_200\/a\.jpg 300w, https:\/\/cdn\.example\.net\/d\.jpg 600w"/);
});
