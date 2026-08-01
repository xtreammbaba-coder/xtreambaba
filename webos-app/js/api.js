var WORKER_URL = 'https://small-poetry-287c.f3baba06.workers.dev/?url=';
(function() {
    var m = window.location.search.match(/[?&]worker=([^&]+)/);
    if (m && m[1]) WORKER_URL = decodeURIComponent(m[1]);
})();

function isAndroid() {
    return /Android/i.test(navigator.userAgent);
}

function isElectronApp() {
    return !!(window.electronAPI);
}

function shouldProxyUrl(url) {
    if (isAndroid()) return false;
    if (!WORKER_URL) return false;
    if (typeof url !== 'string') return false;
    if (url.indexOf('http:') !== 0) return false;
    if (url.indexOf(WORKER_URL) === 0) return false;
    if (url.indexOf('api.allorigins.win') !== -1) return false;
    return true;
}

function getLocalProxyUrl(url) {
    if (isAndroid()) return url;
    if (window.electronAPI) return location.origin + '/proxy?url=' + encodeURIComponent(url);
    if (shouldProxyUrl(url)) return WORKER_URL + encodeURIComponent(url);
    return url;
}

function getApiUrl() {
    var api = window.currentAccount;
    if (!api) return null;
    return 'http://' + api.server + ':' + api.port + '/player_api.php?username=' + api.username + '&password=' + api.password;
}

function xhrRequest(method, url, onSuccess, onError) {
    var xhr = new XMLHttpRequest();
    xhr.open(method || 'GET', url, true);
    xhr.timeout = 30000;
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            onSuccess(xhr.responseText);
        } else {
            onError('HTTP ' + xhr.status);
        }
    };
    xhr.onerror = function() { onError('Network error'); };
    xhr.ontimeout = function() { onError('Request timeout'); };
    xhr.send(null);
}

function apiRequestWithProxy(endpoint, onSuccess, onError) {
    var baseUrl = getApiUrl();
    if (!baseUrl) { if (onError) onError('Hesap bilgisi bulunamadi'); return; }
    var url = baseUrl;
    if (endpoint) url += '&' + endpoint;

    function doRequest(reqUrl) {
        xhrRequest('GET', reqUrl, function(text) {
            try {
                var data = JSON.parse(text);
                onSuccess(data);
            } catch (e) {
                if (onError) onError('Parse error');
            }
        }, function(err) {
            if (isAndroid()) { if (onError) onError('API error'); return; }
            tryLocalProxy();
        });
    }

    function tryLocalProxy() {
        var proxyUrl = getLocalProxyUrl(url);
        xhrRequest('GET', proxyUrl, function(text) {
            try {
                var data = JSON.parse(text);
                onSuccess(data);
            } catch (e) {
                if (onError) onError('Parse error');
            }
        }, onError || function() {});
    }

    if (shouldProxyUrl(url)) {
        tryLocalProxy();
    } else {
        doRequest(url);
    }
}

function getStreamUrl(type, streamId, ext) {
    var api = window.currentAccount;
    if (!api) return null;
    var base = 'http://' + api.server + ':' + api.port + '/';
    if (type === 'live') {
        return base + 'live/' + api.username + '/' + api.password + '/' + streamId + '.m3u8';
    }
    if (type === 'movies' || type === 'movie') {
        return base + 'movie/' + api.username + '/' + api.password + '/' + streamId + '.' + (ext || 'mp4');
    }
    if (type === 'series') {
        return base + 'series/' + api.username + '/' + api.password + '/' + streamId + '.' + (ext || 'mp4');
    }
    return base + 'live/' + api.username + '/' + api.password + '/' + streamId + '.m3u8';
}

function proxyAllRequests(config) {
    if (isAndroid()) return;
    config.xhrSetup = function(xhr, url) {
        if (typeof url === 'string' && url.indexOf('blob:') !== 0 && shouldProxyUrl(url)) {
            xhr.open('GET', WORKER_URL + encodeURIComponent(url), true);
        }
    };
}

function hlsPlay(videoEl, url, isLive, onFail) {
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }

    var useHls = typeof Hls !== 'undefined' && typeof Hls.isSupported === 'function' && Hls.isSupported() && url.indexOf('.m3u8') > 0;
    console.log('[HLS] Hls=' + (typeof Hls !== 'undefined') + ' isSupported=' + (typeof Hls !== 'undefined' && typeof Hls.isSupported === 'function' ? Hls.isSupported() : 'N/A') + ' useHls=' + useHls + ' url=' + url.substring(0, 80));

    if (useHls) {
        var config = {
            enableWorker: true,
            lowLatencyMode: true,
            startFragPrefetch: true,
            manifestLoadingTimeOut: 20000,
            manifestLoadingMaxRetry: 3,
            fragLoadingTimeOut: 30000,
            fragLoadingMaxRetry: 5,
            maxBufferLength: isLive ? 10 : 30,
            maxMaxBufferLength: isLive ? 30 : 60,
            maxBufferSize: 10 * 1024 * 1024,
            backBufferLength: isLive ? 0 : Infinity
        };

        proxyAllRequests(config);

        var hls = null;
        try { hls = new Hls(config); } catch (e) { hls = null; }
        if (hls) {
            var failCalled = false;
            var nativeFallbackTried = false;
            var proxyTried = false;

            hls.loadSource(url);
            hls.attachMedia(videoEl);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                if (isLive) {
                    videoEl.play().catch(function(){});
                }
            });

            hls.on(Hls.Events.ERROR, function(evt, data) {
                console.log('[HLS] ERROR type=' + data.type + ' fatal=' + data.fatal + ' details=' + data.details);
                if (data.fatal) {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        console.log('[HLS] Fatal NETWORK_ERROR');
                        var isProxied = (url.indexOf(WORKER_URL) === 0);
                        if (!isProxied && !proxyTried) {
                            proxyTried = true;
                            console.log('[HLS] Retrying with proxy...');
                            var pu = WORKER_URL + encodeURIComponent(url);
                            hls.destroy();
                            hlsInstance = null;
                            setTimeout(function() { hlsPlay(videoEl, pu, isLive, onFail); }, 200);
                            return;
                        }
                        if (!failCalled) {
                            failCalled = true;
                            hls.destroy();
                            hlsInstance = null;
                            if (onFail) onFail();
                        }
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        console.log('[HLS] Fatal MEDIA_ERROR');
                        if (!nativeFallbackTried) {
                            nativeFallbackTried = true;
                            console.log('[HLS] Trying native fallback...');
                            var nativeUrl = (url.indexOf(WORKER_URL) === 0) ? url.replace(WORKER_URL + encodeURIComponent(''), '') : url;
                            hls.destroy();
                            hlsInstance = null;
                            videoEl.src = nativeUrl;
                            videoEl.load();
                            videoEl.play().catch(function(){});
                            return;
                        }
                        console.log('[HLS] Native fallback also failed');
                        if (!failCalled) {
                            failCalled = true;
                            hls.destroy();
                            hlsInstance = null;
                            if (onFail) onFail();
                        }
                    }
                }
            });

            hlsInstance = hls;
            return hls;
        }
        useHls = false;
    }

    videoEl.src = url;
    videoEl.load();
    if (isLive) {
        videoEl.play().catch(function(){});
    }
    return null;
}