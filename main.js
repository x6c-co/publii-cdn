const { JSDOM } = require('jsdom');

class CDN {
    constructor(API, name, config) {
        this.API = API;
        this.name = name;
        this.config = config;
    }

    addModifiers() {
        this.API.addModifier('htmlOutput', this.modifyHtmlOutput.bind(this), 999, this);
        this.API.addModifier('feedXmlOutput', this.modifyFeedXmlOutput.bind(this), 999, this);
        this.API.addModifier('feedJsonOutput', this.modifyFeedJsonOutput.bind(this), 999, this);
    }

    modifyHtmlOutput(renderer, htmlCode, globalContext, context) {
        if (this.config.cdnImages) {
            htmlCode = replaceImageDomains(htmlCode, renderer.siteConfig.domain, this.config.url);
        }

        if (this.config.cdnGalleries) {
            htmlCode = replaceGalleryLinks(htmlCode, renderer.siteConfig.domain, this.config.url, this.config.galleryItemSelector);
        }

        return htmlCode;
    }

    modifyFeedXmlOutput(renderer, xmlCode) {
        if (!this.config.cdnFeedImages) {
            return xmlCode;
        }

        return replaceFeedImageDomains(xmlCode, renderer.siteConfig.domain, this.config.url);
    }

    modifyFeedJsonOutput(renderer, jsonCode) {
        if (!this.config.cdnFeedImages) {
            return jsonCode;
        }

        return replaceJsonFeedImageDomains(jsonCode, renderer.siteConfig.domain, this.config.url);
    }
}

// Rewrites image URLs in a JSON Feed (https://jsonfeed.org): the feed's icon and
// favicon, and each item's image, banner_image and the images in content_html
// and summary. Publii puts HTML in summary when a post uses a read-more marker.
// The feed is parsed rather than searched as text, because quotes inside
// content_html are escaped. Links, IDs and attachments are not changed. If the
// feed is not valid JSON (a theme's template can produce that) or nothing needs
// to change, the original text is returned as is. Otherwise the feed is written
// back as formatted JSON.
function replaceJsonFeedImageDomains(jsonString, originalDomain, newDomain) {
    let feed;

    try {
        feed = JSON.parse(jsonString);
    } catch (error) {
        console.warn('[CDN plugin] feed.json is not valid JSON, so its image URLs were not rewritten: ' + error.message);
        return jsonString;
    }

    if (!feed || typeof feed !== 'object' || Array.isArray(feed)) {
        return jsonString;
    }

    let changed = false;

    const rewrite = (object, key, replace) => {
        if (typeof object[key] !== 'string') {
            return;
        }

        const value = replace(object[key], originalDomain, newDomain);

        if (value !== object[key]) {
            object[key] = value;
            changed = true;
        }
    };

    rewrite(feed, 'icon', replaceDomain);
    rewrite(feed, 'favicon', replaceDomain);

    if (Array.isArray(feed.items)) {
        feed.items.forEach(item => {
            if (!item || typeof item !== 'object') {
                return;
            }

            rewrite(item, 'image', replaceDomain);
            rewrite(item, 'banner_image', replaceDomain);
            rewrite(item, 'content_html', replaceFeedImageDomains);
            rewrite(item, 'summary', replaceFeedImageDomains);
        });
    }

    if (!changed) {
        return jsonString;
    }

    // Keep the trailing newline (or other whitespace) the template ended with.
    return JSON.stringify(feed, null, 4) + jsonString.match(/\s*$/)[0];
}

function replaceFeedImageDomains(xmlString, originalDomain, newDomain) {
    // A tag runs to the first '>' that is not inside a quoted attribute value.
    return xmlString.replace(/<(?:media:content|img)\b(?:"[^"]*"|'[^']*'|[^"'>])*>/gi, tag => {
        // Walk the attributes in order, so text inside one attribute's value
        // (for example alt="... src='...'") is never read as another attribute.
        return tag.replace(/(\s)([^\s"'=\/>]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+)/g, (attribute, space, name, equals, rawValue) => {
            const attributeName = name.toLowerCase();

            if (attributeName !== 'src' && attributeName !== 'srcset' && attributeName !== 'url') {
                return attribute;
            }

            const quote = rawValue[0] === '"' || rawValue[0] === "'" ? rawValue[0] : '';
            const value = quote ? rawValue.slice(1, -1) : rawValue;
            const newValue = attributeName === 'srcset'
                ? replaceSrcset(value, originalDomain, newDomain)
                : replaceDomain(value, originalDomain, newDomain);

            return space + name + equals + quote + newValue + quote;
        });
    });
}

function replaceGalleryLinks(htmlString, originalDomain, newDomain, elementSelector) {
    const dom = new JSDOM(htmlString);

    const doc = dom.window.document;

    const galleryItemLinkElements = doc.querySelectorAll(elementSelector);

    galleryItemLinkElements.forEach(a => {
        let href = a.getAttribute('href');

        if (href) {
            a.setAttribute('href', replaceDomain(href, originalDomain, newDomain));
        }
    })

    return dom.serialize();
}

function replaceImageDomains(htmlString, originalDomain, newDomain) {
    // Use JSDOM to parse the HTML string into a DOM document
    const dom = new JSDOM(htmlString);

    // Access the document
    const doc = dom.window.document;

    // Select all <img> elements in the document
    const imgElements = doc.querySelectorAll('img');

    // Iterate over each <img> element
    imgElements.forEach(img => {
        // Get the current src attribute
        let src = img.getAttribute('src');
        if (src) {
            // Replace the domain in the src attribute
            img.setAttribute('src', replaceDomain(src, originalDomain, newDomain));
        }

        // Get the current srcset attribute
        let srcset = img.getAttribute('srcset');
        if (srcset) {
            img.setAttribute('srcset', replaceSrcset(srcset, originalDomain, newDomain));
        }
    });

    // Serialize the entire DOM document back to a string
    return dom.serialize();
}

// Rewrites the URL of each srcset candidate. Only the URLs change: commas inside
// URLs, descriptors and the original spacing are kept as they were.
function replaceSrcset(srcset, originalDomain, newDomain) {
    return srcset.replace(/(^|,)(\s*)(\S*[^\s,])/g, (match, separator, space, url) => {
        return separator + space + replaceDomain(url, originalDomain, newDomain);
    });
}

// Swaps the site domain for the CDN domain, but only when the URL starts with the
// site domain followed by '/', '?', '#' or nothing. Anything else is returned as is.
function replaceDomain(url, originalDomain, newDomain) {
    const from = normalizeDomain(originalDomain);
    let to = normalizeDomain(newDomain);

    if (!url || !from || !to) {
        return url;
    }

    // The README used to show the CDN setting without a scheme. Without one the
    // result would be a relative path, so assume https.
    if (!to.includes('://') && !to.startsWith('//')) {
        to = 'https://' + to;
    }

    if (!url.startsWith(from)) {
        return url;
    }

    const rest = url.slice(from.length);

    if (rest !== '' && !/^[/?#]/.test(rest)) {
        return url;
    }

    return to + rest;
}

function normalizeDomain(domain) {
    return typeof domain === 'string' ? domain.trim().replace(/\/+$/, '') : '';
}

module.exports = CDN;
