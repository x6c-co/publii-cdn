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

test('leaves links in gallery captions alone', () => {
    const input = '<feed><content><![CDATA[<figure class="gallery__item">'
        + '<a href="https://example.com/media/posts/1/gallery/one.jpg"><img src="https://example.com/media/posts/1/gallery/one-thumbnail.jpg"></a>'
        + '<figcaption>See <a href="https://example.com/about/">about</a></figcaption></figure>]]></content></feed>';
    const output = feedModifiers({ cdnGalleries: true }).xml(input);

    assert.match(output, /<a href="https:\/\/cdn\.example\.net\/media\/posts\/1\/gallery\/one\.jpg">/);
    assert.match(output, /<a href="https:\/\/example\.com\/about\/">about<\/a>/);
});

test('an unclosed gallery item does not reach into the next feed entry', () => {
    const input = '<feed>'
        + '<entry><content><![CDATA[<figure class="gallery__item"><a href="https://example.com/media/posts/1/gallery/a.jpg"><img src="https://example.com/media/posts/1/gallery/a-thumbnail.jpg"></a>]]></content></entry>'
        + '<entry><content><![CDATA[<p><a href="https://example.com/p1/">see post 1</a></p><figure class="post__image"><a href="https://example.com/media/posts/2/x.jpg">x</a></figure>]]></content></entry>'
        + '</feed>';
    const output = feedModifiers({ cdnGalleries: true }).xml(input);

    assert.match(output, /<a href="https:\/\/example\.com\/p1\/">/);
    assert.match(output, /<a href="https:\/\/example\.com\/media\/posts\/2\/x\.jpg">/);
});

test('handles multi-line gallery markup from the block editor', () => {
    const input = `<feed><content><![CDATA[
<div class="gallery-wrapper">
    <div class="gallery" data-columns="3">
        <figure class="gallery__item">
            <a href="https://example.com/media/posts/1/gallery/one.jpg" data-size="1200x800">
                <img loading="lazy" src="https://example.com/media/posts/1/gallery/one-thumbnail.jpg" height="512" width="768" alt="">
            </a>
            <figcaption>One</figcaption>
        </figure>
    </div>
</div>]]></content></feed>`;
    const output = feedModifiers({ cdnGalleries: true }).xml(input);

    assert.match(output, /<a href="https:\/\/cdn\.example\.net\/media\/posts\/1\/gallery\/one\.jpg" data-size="1200x800">/);
    assert.match(output, /src="https:\/\/cdn\.example\.net\/media\/posts\/1\/gallery\/one-thumbnail\.jpg"/);
});

test('rewrites galleries in summaries and in every entry of feed.xml', () => {
    const item = n => `<figure class="gallery__item"><a href="https://example.com/media/posts/${n}/gallery/big.jpg"><img src="https://example.com/media/posts/${n}/gallery/big-thumbnail.jpg"></a></figure>`;
    const input = '<feed>'
        + `<entry><summary type="html"><![CDATA[${item(1)}]]></summary><content type="html"><![CDATA[${item(1)}]]></content></entry>`
        + `<entry><content type="html"><![CDATA[${item(2)}]]></content></entry>`
        + '</feed>';
    const output = feedModifiers({ cdnGalleries: true }).xml(input);

    assert.equal(output.match(/href="https:\/\/cdn\.example\.net\/media\/posts\/1\/gallery\/big\.jpg"/g).length, 2);
    assert.equal(output.match(/href="https:\/\/cdn\.example\.net\/media\/posts\/2\/gallery\/big\.jpg"/g).length, 1);
    assert.doesNotMatch(output, /href="https:\/\/example\.com/);
});

test('rewrites galleries in feed.json summary', () => {
    const summary = '<figure class="gallery__item"><a href="https://example.com/media/posts/1/gallery/big.jpg"><img src="https://example.com/media/posts/1/gallery/t.jpg"></a></figure>';
    const output = feedModifiers({ cdnGalleries: true }).json(JSON.stringify({ items: [{ id: '1', summary }] }));

    assert.match(JSON.parse(output).items[0].summary, /href="https:\/\/cdn\.example\.net\/media\/posts\/1\/gallery\/big\.jpg"/);
});

test('turning galleries on changes nothing when a feed has no gallery', () => {
    const input = '<feed><content><![CDATA[<p><img src="https://example.com/media/a.jpg"> <a href="https://example.com/media/b.jpg">b</a></p>]]></content></feed>';

    assert.equal(feedModifiers({ cdnGalleries: true }).xml(input), feedModifiers({ cdnGalleries: false }).xml(input));
});
