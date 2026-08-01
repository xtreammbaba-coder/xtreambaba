(function () {
    'use strict';

    function isNative(fn) {
        return typeof fn === 'function' && /native code/.test(Function.prototype.toString.call(fn));
    }

    if (typeof Object.assign !== 'function') {
        Object.assign = function (target) {
            if (target == null) throw new TypeError('Cannot convert undefined or null to object');
            var to = Object(target);
            for (var i = 1; i < arguments.length; i++) {
                var src = arguments[i];
                if (src == null) continue;
                for (var key in src) {
                    if (Object.prototype.hasOwnProperty.call(src, key)) to[key] = src[key];
                }
            }
            return to;
        };
    }

    if (typeof String.prototype.padStart !== 'function') {
        String.prototype.padStart = function (targetLength, padString) {
            var s = String(this);
            var len = targetLength >> 0;
            if (len <= s.length) return s;
            var pad = String(typeof padString === 'undefined' ? ' ' : padString);
            if (pad.length === 0) pad = ' ';
            while (s.length < len) s = pad + s;
            return s.slice(s.length - len);
        };
    }

    if (window.NodeList && typeof NodeList.prototype.forEach !== 'function') {
        NodeList.prototype.forEach = function (cb, thisArg) {
            for (var i = 0; i < this.length; i++) cb.call(thisArg, this[i], i, this);
        };
    }

    if (window.Element && typeof Element.prototype.closest !== 'function') {
        var matchesSel = Element.prototype.matches ||
            Element.prototype.webkitMatchesSelector ||
            Element.prototype.msMatchesSelector;
        if (matchesSel) {
            Element.prototype.closest = function (sel) {
                var el = this;
                while (el && el.nodeType === 1) {
                    if (matchesSel.call(el, sel)) return el;
                    el = el.parentNode;
                }
                return null;
            };
        }
    }

    if (window.HTMLMediaElement && typeof HTMLMediaElement.prototype.play === 'function') {
        var origPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
            var r;
            try { r = origPlay.call(this); } catch (e) { return Promise.reject(e); }
            if (r && typeof r.then === 'function') return r;
            return Promise.resolve();
        };
    }

    if (typeof window.TextDecoder === 'undefined') {
        window.TextDecoder = function (label) { this.encoding = label || 'utf-8'; };
        window.TextDecoder.prototype.decode = function (buf) {
            var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
            var s = '';
            for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
            try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
        };
    }

    (function () {
        var d = window.document;
        if (!d) return;
        if (!d.exitFullscreen && d.webkitExitFullscreen) {
            d.exitFullscreen = function () { return d.webkitExitFullscreen(); };
        }
        if (!d.fullscreenElement && 'webkitFullscreenElement' in d) {
            try {
                Object.defineProperty(d, 'fullscreenElement', {
                    get: function () { return d.webkitFullscreenElement; }
                });
            } catch (e) {}
        }
    })();

    if (window.Element && !Element.prototype.requestFullscreen && Element.prototype.webkitRequestFullscreen) {
        Element.prototype.requestFullscreen = function () { return this.webkitRequestFullscreen(); };
    }

    if (typeof window.fetch !== 'function') {
        var CORS_PROXIES = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest='
        ];

        function decodeUtf8(buf) {
            var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
            var s = '';
            for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
            try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
        }

        function makeResponse(xhr, body) {
            var status = xhr.status || 0;
            return {
                ok: status >= 200 && status < 300,
                status: status,
                statusText: xhr.statusText || '',
                url: xhr.responseURL || '',
                json: function () {
                    return Promise.resolve().then(function () {
                        return JSON.parse(decodeUtf8(body));
                    });
                },
                text: function () {
                    return Promise.resolve(decodeUtf8(body));
                },
                arrayBuffer: function () {
                    return Promise.resolve(body.buffer || body);
                }
            };
        }

        function xhrFetch(url, opts) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                opts = opts || {};
                xhr.open((opts.method || 'GET').toUpperCase(), url, true);
                xhr.timeout = opts.timeout || 30000;
                try {
                    var headers = opts.headers || {};
                    for (var k in headers) {
                        if (Object.prototype.hasOwnProperty.call(headers, k)) xhr.setRequestHeader(k, headers[k]);
                    }
                } catch (e) {}
                xhr.responseType = 'arraybuffer';
                xhr.onload = function () {
                    var body = xhr.response ? new Uint8Array(xhr.response) : new Uint8Array(0);
                    resolve(makeResponse(xhr, body));
                };
                xhr.onerror = function () { reject(new Error('Network error')); };
                xhr.ontimeout = function () { reject(new Error('Request timeout')); };
                xhr.send(opts.body || null);
            });
        }

        function fetchWithFallback(url, opts) {
            return xhrFetch(url, opts).catch(function (err) {
                function tryProxy(i) {
                    if (i >= CORS_PROXIES.length) return Promise.reject(err);
                    var purl = CORS_PROXIES[i] + encodeURIComponent(url);
                    return xhrFetch(purl, opts).then(function (resp) {
                        if (resp.status === 0 || resp.status >= 500) return tryProxy(i + 1);
                        return resp;
                    }).catch(function () { return tryProxy(i + 1); });
                }
                return tryProxy(0);
            });
        }

        window.fetch = fetchWithFallback;
    }
})();
