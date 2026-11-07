'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const CDN = require('../main.js');

function jsonFeedModifier(config) {
    let callback;
    const API = {
        addModifier(name, fn) {
            if (name === 'feedJsonOutput') {
                callback = fn;
            }
        }
    };

    new CDN(API, 'CDN', config).addModifiers();

    return json => callback({ siteConfig: { domain: 'https://example.com' } }, json, {});
}

const contentHtml = '<p>Hello "world"</p>'
    + '<img src="https://example.com/media/posts/1/a.jpg" srcset="https://example.com/media/posts/1/a.jpg 1x, https://example.com/media/posts/1/a@2x.jpg 2x" alt="A">'
    + '<a href="https://example.com/other-post/">link</a>';

// Same shape as the output of Publii's default feed-json.hbs template.
const feed = `{
    "version": "https://jsonfeed.org/version/1",
    "title": "Example",
    "description": "",
    "home_page_url": "https://example.com",
    "feed_url": "https://example.com/feed.json",
    "user_comment": "",
    "icon": "https://example.com/media/website/logo.png",
    "author": {
        "name": "Levi"
    },
    "items": [
        {
            "id": "https://example.com/post/",
            "url": "https://example.com/post/",
            "title": "Post",
            "summary": "Short text",
            "content_html": ${JSON.stringify(contentHtml)},
            "image": "https://example.com/media/posts/1/hero.jpg",
            "author": {
                "name": "Levi"
            },
            "tags": [],
            "date_published": "2026-11-07T12:00:00+00:00",
            "date_modified": "2026-11-07T12:00:00+00:00"
        }
    ]
}`;

test('leaves the JSON feed byte-for-byte unchanged when the option is disabled', () => {
    const rewrite = jsonFeedModifier({ cdnFeedImages: false, url: 'https://cdn.example.net' });

    assert.equal(rewrite(feed), feed);
});

test('rewrites JSON feed image URLs and leaves links and IDs alone', () => {
    const rewrite = jsonFeedModifier({ cdnFeedImages: true, url: 'https://cdn.example.net' });
    const output = JSON.parse(rewrite(feed));
    const item = output.items[0];

    assert.equal(output.icon, 'https://cdn.example.net/media/website/logo.png');
    assert.equal(item.image, 'https://cdn.example.net/media/posts/1/hero.jpg');
    assert.match(item.content_html, /src="https:\/\/cdn\.example\.net\/media\/posts\/1\/a\.jpg"/);
    assert.match(item.content_html, /srcset="https:\/\/cdn\.example\.net\/media\/posts\/1\/a\.jpg 1x, https:\/\/cdn\.example\.net\/media\/posts\/1\/a@2x\.jpg 2x"/);
    assert.match(item.content_html, /<p>Hello "world"<\/p>/);
    assert.match(item.content_html, /href="https:\/\/example\.com\/other-post\/"/);

    assert.equal(output.home_page_url, 'https://example.com');
    assert.equal(output.feed_url, 'https://example.com/feed.json');
    assert.equal(item.id, 'https://example.com/post/');
    assert.equal(item.url, 'https://example.com/post/');
    assert.equal(item.summary, 'Short text');
    assert.equal(item.date_published, '2026-11-07T12:00:00+00:00');
});

test('leaves the JSON feed unchanged when there is nothing to rewrite', () => {
    const rewrite = jsonFeedModifier({ cdnFeedImages: true, url: 'https://cdn.example.net' });
    const input = '{\n    "version": "https://jsonfeed.org/version/1",\n    "home_page_url": "https://example.com",\n    "items": []\n}';

    assert.equal(rewrite(input), input);
});

test('leaves the JSON feed unchanged when the CDN URL is empty', () => {
    const rewrite = jsonFeedModifier({ cdnFeedImages: true, url: '' });

    assert.equal(rewrite(feed), feed);
});

test('leaves invalid JSON unchanged and logs a warning', t => {
    const warn = t.mock.method(console, 'warn', () => {});
    const rewrite = jsonFeedModifier({ cdnFeedImages: true, url: 'https://cdn.example.net' });
    // Publii HTML-escapes titles but does not JSON-escape them, so a backslash breaks the feed.
    const input = '{ "title": "C:\\Users", "icon": "https://example.com/media/website/logo.png" }';

    assert.equal(rewrite(input), input);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /feed\.json is not valid JSON/);
});

test('rewrites images in an HTML summary (posts with a read-more marker)', () => {
    const rewrite = jsonFeedModifier({ cdnFeedImages: true, url: 'https://cdn.example.net' });
    const input = JSON.stringify({ items: [{ id: '1', summary: '<p>Intro</p><img src="https://example.com/media/posts/1/a.jpg">' }] });
    const item = JSON.parse(rewrite(input)).items[0];

    assert.equal(item.summary, '<p>Intro</p><img src="https://cdn.example.net/media/posts/1/a.jpg">');
});

test('keeps the trailing newline when the JSON feed is rewritten', () => {
    const rewrite = jsonFeedModifier({ cdnFeedImages: true, url: 'https://cdn.example.net' });
    const output = rewrite(feed + '\n');

    assert.ok(output.endsWith('}\n'));
    assert.equal(JSON.parse(output).icon, 'https://cdn.example.net/media/website/logo.png');
});

test('does not change attachments', () => {
    const rewrite = jsonFeedModifier({ cdnFeedImages: true, url: 'https://cdn.example.net' });
    const input = JSON.stringify({
        items: [{ id: '1', attachments: [{ url: 'https://example.com/media/files/episode.mp3', mime_type: 'audio/mpeg' }] }]
    });

    assert.equal(rewrite(input), input);
});
