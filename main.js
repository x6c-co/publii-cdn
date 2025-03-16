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
            // Split the srcset into an array of URLs
            const urls = srcset.split(',').map(url => url.trim());

            // Replace the domain in each URL
            const newUrls = urls.map(url => replaceDomain(url, originalDomain, newDomain));

            // Join the array back into a string for the srcset attribute
            img.setAttribute('srcset', newUrls.join(', '));
        }
    });

    // Serialize the entire DOM document back to a string
    return dom.serialize();
}

function replaceDomain(url, originalDomain, newDomain) {
    return url.replace(originalDomain, newDomain);
}

module.exports = CDN;
