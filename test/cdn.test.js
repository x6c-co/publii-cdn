'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const CDN = require('../main.js');

function createPlugin(config = {}) {
    const modifiers = new Map();
    const API = {
        addModifier(name, callback, priority, owner) {
            modifiers.set(name, { callback, priority, owner });
        }
    };
    const plugin = new CDN(API, 'CDN', config);
    plugin.addModifiers();

    return { plugin, modifiers };
}

const renderer = {
    siteConfig: {
        domain: 'https://example.com'
    }
};

const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <link href="https://example.com/feed.xml" rel="self" />
  <id>https://example.com</id>
  <entry>
    <link href="https://example.com/post/" />
    <id>https://example.com/post/</id>
    <media:content url="https://example.com/media/hero.jpg" medium="image" />
    <summary type="html"><![CDATA[
      <img src="https://example.com/media/thumb.jpg" srcset="https://example.com/media/thumb.jpg 1x, https://example.com/media/thumb@2x.jpg 2x" alt="Example" />
    ]]></summary>
  </entry>
</feed>`;

test('declares feed rewriting as an explicit opt-in checkbox', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin.json'), 'utf8'));
    const field = manifest.config.find(item => item.name === 'cdnFeedImages');

    assert.deepEqual(field, {
        name: 'cdnFeedImages',
        label: 'Use CDN for Feed Images',
        group: 'Asset Types',
        value: false,
        type: 'checkbox'
    });
});

test('registers HTML, XML feed and JSON feed modifiers at the existing priority', () => {
    const { plugin, modifiers } = createPlugin();

    assert.deepEqual([...modifiers.keys()], ['htmlOutput', 'feedXmlOutput', 'feedJsonOutput']);
    assert.equal(modifiers.get('htmlOutput').priority, 999);
    assert.equal(modifiers.get('feedXmlOutput').priority, 999);
    assert.equal(modifiers.get('feedXmlOutput').owner, plugin);
    assert.equal(modifiers.get('feedJsonOutput').priority, 999);
    assert.equal(modifiers.get('feedJsonOutput').owner, plugin);
});

test('leaves the feed byte-for-byte unchanged when the option is disabled', () => {
    const { modifiers } = createPlugin({
        cdnFeedImages: false,
        url: 'https://cdn.example.net'
    });

    assert.equal(modifiers.get('feedXmlOutput').callback(renderer, feed), feed);
});

test('rewrites feed image URLs without changing entry and feed identity URLs', () => {
    const { modifiers } = createPlugin({
        cdnFeedImages: true,
        url: 'https://cdn.example.net'
    });

    const output = modifiers.get('feedXmlOutput').callback(renderer, feed);

    assert.match(output, /<media:content url="https:\/\/cdn\.example\.net\/media\/hero\.jpg"/);
    assert.match(output, /src="https:\/\/cdn\.example\.net\/media\/thumb\.jpg"/);
    assert.match(output, /srcset="https:\/\/cdn\.example\.net\/media\/thumb\.jpg 1x, https:\/\/cdn\.example\.net\/media\/thumb@2x\.jpg 2x"/);
    assert.match(output, /<link href="https:\/\/example\.com\/feed\.xml" rel="self"/);
    assert.match(output, /<link href="https:\/\/example\.com\/post\/"/);
    assert.match(output, /<id>https:\/\/example\.com<\/id>/);
    assert.match(output, /<id>https:\/\/example\.com\/post\/<\/id>/);
    assert.ok(output.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
    assert.doesNotThrow(() => new JSDOM(output, { contentType: 'application/xml' }));
});

test('does not rewrite similarly named domains or unrelated XML URL attributes', () => {
    const { modifiers } = createPlugin({
        cdnFeedImages: true,
        url: 'https://cdn.example.net'
    });
    const input = `<feed>
      <media:content url="https://assets.example.com/media/other.jpg" />
      <enclosure url="https://example.com/media/audio.mp3" />
      <img src='https://example.com/media/image.jpg' />
    </feed>`;
    const output = modifiers.get('feedXmlOutput').callback(renderer, input);

    assert.match(output, /https:\/\/assets\.example\.com\/media\/other\.jpg/);
    assert.match(output, /<enclosure url="https:\/\/example\.com\/media\/audio\.mp3"/);
    assert.match(output, /<img src='https:\/\/cdn\.example\.net\/media\/image\.jpg'/);
});

test('handles srcset commas, quoted ">" and odd attribute formatting in feed images', () => {
    const { modifiers } = createPlugin({
        cdnFeedImages: true,
        url: 'https://cdn.example.net'
    });
    const input = `<feed>
      <img srcset="https://res.cloudinary.com/demo/w_300,h_200/a.jpg 300w" />
      <img sizes="(width > 48em) 768px" srcset="https://example.com/media/b.jpg 768w" />
      <img alt="x src='https://example.com/media/alt'" src="https://example.com/media/c.jpg" />
      <img src = "https://example.com/media/d.jpg" />
      <img src=https://example.com/media/e.jpg />
    </feed>`;
    const output = modifiers.get('feedXmlOutput').callback(renderer, input);

    assert.match(output, /srcset="https:\/\/res\.cloudinary\.com\/demo\/w_300,h_200\/a\.jpg 300w"/);
    assert.match(output, /srcset="https:\/\/cdn\.example\.net\/media\/b\.jpg 768w"/);
    assert.match(output, /alt="x src='https:\/\/example\.com\/media\/alt'"/);
    assert.match(output, /src="https:\/\/cdn\.example\.net\/media\/c\.jpg"/);
    assert.match(output, /src = "https:\/\/cdn\.example\.net\/media\/d\.jpg"/);
    assert.match(output, /src=https:\/\/cdn\.example\.net\/media\/e\.jpg /);
});

test('leaves the feed unchanged when the CDN URL is empty', () => {
    const { modifiers } = createPlugin({
        cdnFeedImages: true,
        url: ''
    });

    assert.equal(modifiers.get('feedXmlOutput').callback(renderer, feed), feed);
});
