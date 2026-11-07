const { JSDOM } = require('jsdom');

class CDN {
    constructor(API, name, config) {
        this.API = API;
        this.name = name;
        this.config = config;
    }

    addModifiers() {
        this.API.addModifier('htmlOutput', this.modifyHtmlOutput.bind(this), 999, this);
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
