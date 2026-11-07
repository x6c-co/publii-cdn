'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const CDN = require('../main.js');

function feedModifiers(config) {
    const modifiers = {};
    const API = {
        addModifier(name, fn) {
            modifiers[name] = fn;
        }
    };

    new CDN(API, 'CDN', { url: 'https://cdn.example.net', cdnFeedImages: true, ...config }).addModifiers();

    const renderer = { siteConfig: { domain: 'https://example.com' } };

    return {
        xml: text => modifiers.feedXmlOutput(renderer, text, {}),
        json: text => modifiers.feedJsonOutput(renderer, text, {})
    };
}

// Publii's gallery markup, as it appears in full post text.
const gallery = '<div class="gallery" data-columns="3">'
    + '<figure class="gallery__item"><a href="https://example.com/media/posts/1/gallery/big.jpg" data-size="1200x800">'
    + '<img src="https://example.com/media/posts/1/gallery/big-thumbnail.jpg" alt=""></a>'
    + '<figcaption>Caption</figcaption></figure>'
    + '</div>'
    + '<figure class="post__image"><a href="https://example.com/media/posts/1/photo.jpg">Photo</a></figure>'
    + '<p><a href="https://example.com/other-post/">Another post</a></p>';

const xmlFeed = `<feed><entry><link href="https://example.com/post/"/><content type="html"><![CDATA[${gallery}]]></content></entry></feed>`;

test('rewrites gallery links in feed.xml when galleries are on', () => {
    const output = feedModifiers({ cdnGalleries: true }).xml(xmlFeed);

    assert.match(output, /<a href="https:\/\/cdn\.example\.net\/media\/posts\/1\/gallery\/big\.jpg" data-size="1200x800">/);
    assert.match(output, /src="https:\/\/cdn\.example\.net\/media\/posts\/1\/gallery\/big-thumbnail\.jpg"/);
});

test('leaves links outside gallery items alone in feed.xml', () => {
    const output = feedModifiers({ cdnGalleries: true }).xml(xmlFeed);

    assert.match(output, /<figure class="post__image"><a href="https:\/\/example\.com\/media\/posts\/1\/photo\.jpg">/);
    assert.match(output, /<a href="https:\/\/example\.com\/other-post\/">/);
    assert.match(output, /<link href="https:\/\/example\.com\/post\/"\/>/);
});

test('leaves gallery links alone in feed.xml when galleries are off', () => {
    const output = feedModifiers({ cdnGalleries: false }).xml(xmlFeed);

    assert.match(output, /<a href="https:\/\/example\.com\/media\/posts\/1\/gallery\/big\.jpg"/);
    assert.match(output, /src="https:\/\/cdn\.example\.net\/media\/posts\/1\/gallery\/big-thumbnail\.jpg"/);
});

test('leaves feed.xml unchanged when the feed option is off, even with galleries on', () => {
    assert.equal(feedModifiers({ cdnFeedImages: false, cdnGalleries: true }).xml(xmlFeed), xmlFeed);
});

test('rewrites gallery links in feed.json content_html when galleries are on', () => {
    const jsonFeed = JSON.stringify({ items: [{ id: 'https://example.com/post/', content_html: gallery }] }, null, 4);
    const item = JSON.parse(feedModifiers({ cdnGalleries: true }).json(jsonFeed)).items[0];

    assert.match(item.content_html, /<a href="https:\/\/cdn\.example\.net\/media\/posts\/1\/gallery\/big\.jpg"/);
    assert.match(item.content_html, /<a href="https:\/\/example\.com\/media\/posts\/1\/photo\.jpg">/);
    assert.equal(item.id, 'https://example.com/post/');
});

test('handles gallery items with extra classes and single quotes', () => {
    const input = `<feed><content><![CDATA[<figure class='gallery__item gallery__item--wide'><a class="x" href='https://example.com/media/a.jpg'><img src='https://example.com/media/a-thumb.jpg'></a></figure>]]></content></feed>`;
    const output = feedModifiers({ cdnGalleries: true }).xml(input);

    assert.match(output, /<a class="x" href='https:\/\/cdn\.example\.net\/media\/a\.jpg'>/);
});
