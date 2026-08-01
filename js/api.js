var WORKER_URL = '';

function isAndroid() {
    return /Android/i.test(navigator.userAgent);
}

function isElectronApp() {
    return !!(window.electronAPI);
}

function needsProxy() {
    return location.protocol === 'https:' && !isAndroid();
}

function getLocalProxyUrl(url) {
    if (isAndroid()) return url;
    if (window.electronAPI) return location.origin + '/proxy?url=' + encodeURIComponent(url);
    if (location.protocol === 'https:') return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    return url;
}

function getApiUrl() {
    var api = window.currentAccount;
    if (!api) return null;
    return 'http://' + api.server + ':' + api.port + '/player_api.php?username=' + api.username + '&password=' + api.password;
}

function apiRequestWithProxy(endpoint) {
    return new Promise(function(resolve, reject) {
        var baseUrl = getApiUrl();
        if (!baseUrl) { reject('Hesap bilgisi bulunamadi'); return; }
        var url = baseUrl;
        if (endpoint) url += '&' + endpoint;

        function tryDirect() {
            fetch(url).then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }).then(function(d) { resolve(d); }).catch(function() {
                if (isAndroid()) { reject(new Error('API error')); return; }
                tryLocalProxy();
            });
        }

        function tryLocalProxy() {
            var proxyUrl = getLocalProxyUrl(url);
            fetch(proxyUrl).then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }).then(function(d) { resolve(d); }).catch(function(err) { reject(err); });
        }

        tryDirect();
    });
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
        if (typeof url === 'string' && url.indexOf('/proxy') === -1 && url.indexOf('blob:') !== 0) {
            xhr.open('GET', getLocalProxyUrl(url), true);
        }
    };
}

function hlsPlay(videoEl, url, isLive, onFail) {
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }

    var useHls = typeof Hls !== 'undefined' && typeof Hls.isSupported === 'function' && Hls.isSupported() && url.indexOf('.m3u8') > 0;

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

        var hls = null;
        try { hls = new Hls(config); } catch (e) { hls = null; }
        if (hls) {
            var failCalled = false;

            hls.loadSource(url);
            hls.attachMedia(videoEl);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                if (isLive) {
                    videoEl.play().catch(function(){});
                }
            });

            hls.on(Hls.Events.ERROR, function(evt, data) {
                if (data.fatal) {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        if (!failCalled) {
                            failCalled = true;
                            hls.destroy();
                            hlsInstance = null;
                            if (onFail) onFail();
                        }
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
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
