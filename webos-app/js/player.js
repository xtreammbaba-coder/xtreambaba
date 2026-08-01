var currentAccount = null;
var hlsInstance = null;
var currentMenuType = 'live';
var streamsCache = {};
var categoriesCache = {};
var allChannelsCache = {};
var currentChannels = [];
var allLoadedChannels = [];
var currentCategory = null;
var currentStream = null;
var watchSaveTimer = null;
var searchDebounce = null;
var speedMonitor = null;
var lastBufferedEnd = 0;
var lastTime = 0;
var lastSpeed = 0;
var lastPlayTime = 0;
var reconnectAttempts = 0;
var nativeVodActive = false;
var MAX_RECONNECT = 3;
var APP_VERSION = '1.1.0';
var VERSION_CHECK_URL = 'https://raw.githubusercontent.com/xtreammbaba-coder/xtreambaba/main/version.json';

document.addEventListener('DOMContentLoaded', function() {
    if (!checkTrialAccess()) return;

    var accounts = Storage.getAccounts();
    var active = Storage.getActiveAccount();
    currentAccount = active || (accounts.length > 0 ? accounts[0] : null);

    if (!currentAccount || !currentAccount.server) {
        window.location.href = 'index.html';
        return;
    }
    window.currentAccount = currentAccount;
    Storage.clearOldHistory(currentAccount.accountName || currentAccount.username);

    loadPlayerInfo();
    setupTabs();
    setupBackButton();
    setupPlayerControls();
    setupSearch();
    setupFavoritesToggle();
    setupKeyboardShortcuts();
    setupThemeToggle();
    setupPiP();
    setupAutoReconnect();
    setupSubtitles();
    loadCategories('live');
    startClock();
    checkForUpdate();
});

function startClock() {
    var el = document.getElementById('clock');
    function tick() { el.textContent = new Date().toLocaleTimeString('tr-TR'); }
    tick();
    setInterval(tick, 1000);
}

function getAccountName() {
    return currentAccount.accountName || currentAccount.username || 'default';
}

function loadPlayerInfo() {
    var api = currentAccount;
    document.getElementById('detailUsername').textContent = api.username || '-';
    document.getElementById('serverInfoText').textContent = (api.accountName || api.username) + ' | ' + api.server + ':' + api.port;

    apiRequestWithProxy('action=', function(info) {
        if (info && info.user_info) {
            var ui = info.user_info;
            document.getElementById('detailStartDate').textContent = formatDate(ui.created_at);
            document.getElementById('detailEndDate').textContent = formatDate(ui.exp_date);
            document.getElementById('detailConnections').textContent = ui.active_cons || '-';
            document.getElementById('detailDeviceId').textContent = getDeviceInfo();
        }
        if (info && info.server_info) {
            document.getElementById('detailServerTime').textContent = info.server_info.time_now || '-';
        }
    }, function() {});
}

function formatDate(val) {
    if (!val) return '-';
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.split(' ')[0];
    if (/^\d{2}\/\d{2}\/\d{4}/.test(val)) {
        var p = val.split(/[\/ ]/);
        return p[2] + '-' + p[1] + '-' + p[0];
    }
    var ts = parseInt(val, 10);
    if (!isNaN(ts) && ts > 1000000000) {
        var d = new Date(ts > 9999999999 ? ts : ts * 1000);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    return String(val).split(' ')[0];
}

function getDeviceInfo() {
    var ua = navigator.userAgent;
    var platform = navigator.platform || '';

    if (ua.indexOf('SmartHub') !== -1 || ua.indexOf('Tizen') !== -1) return 'Samsung TV';
    if (ua.indexOf('Web0S') !== -1 || ua.indexOf('webOS') !== -1) return 'LG TV';
    if (ua.indexOf('Android') !== -1) return 'Android';
    if (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) return 'iOS';
    if (ua.indexOf('Windows NT 10') !== -1) return 'Windows 10/11';
    if (ua.indexOf('Windows NT 6.1') !== -1) return 'Windows 7';
    if (ua.indexOf('Windows') !== -1) return 'Windows';
    if (ua.indexOf('Mac OS X') !== -1) return 'macOS';
    if (ua.indexOf('Linux') !== -1) return 'Linux';
    if (ua.indexOf('CrOS') !== -1) return 'ChromeOS';
    if (platform.indexOf('Win') !== -1) return 'Windows';
    if (platform.indexOf('Mac') !== -1) return 'Mac';
    return 'HTML5';
}

function setupTabs() {
    var tabs = document.querySelectorAll('.tab');
    for (var ti = 0; ti < tabs.length; ti++) {
        (function(tab) {
        tab.addEventListener('click', function() {
            for (var tj = 0; tj < tabs.length; tj++) { tabs[tj].classList.remove('active'); }
            tab.classList.add('active');
            currentMenuType = tab.getAttribute('data-type');
            streamsCache = {};
            categoriesCache = {};
            currentCategory = null;
            allLoadedChannels = [];
            document.getElementById('favToggleBtn').classList.remove('active');
            showCategories();
            loadCategories(currentMenuType);
        });
    })(tabs[ti]);
    }
}

function setupBackButton() {
    document.getElementById('backToCats').addEventListener('click', function() {
        document.getElementById('favToggleBtn').classList.remove('active');
        showCategories();
    });
}

function showCategories() {
    document.getElementById('catSection').classList.remove('hidden');
    document.getElementById('chSection').style.display = 'none';
}

function showChannels(label) {
    document.getElementById('catSection').classList.add('hidden');
    document.getElementById('chSection').style.display = 'flex';
    document.getElementById('chLabel').textContent = label;
}

function loadCategories(type) {
    if (categoriesCache[type]) {
        renderCategories(categoriesCache[type]);
        return;
    }

    var action = '';
    var label = '';
    if (type === 'live') { action = 'action=get_live_categories'; label = 'CANLI KANALLAR'; }
    else if (type === 'movies') { action = 'action=get_vod_categories'; label = 'FILMLER'; }
    else if (type === 'series') { action = 'action=get_series_categories'; label = 'DIZILER'; }

    document.getElementById('sectionLabel').textContent = label;
    document.getElementById('categoriesList').innerHTML = '<div class="no-data">Yukleniyor...</div>';

    apiRequestWithProxy(action, function(cats) {
        if (!Array.isArray(cats) || cats.length === 0) {
            document.getElementById('categoriesList').innerHTML = '<div class="no-data">Kategori bulunamadi</div>';
            return;
        }
        categoriesCache[type] = cats;
        renderCategories(cats);
    }, function() {
        document.getElementById('categoriesList').innerHTML = '<div class="no-data">Hata olustu</div>';
    });
}

function renderCategories(cats) {
    var list = document.getElementById('categoriesList');
    list.innerHTML = '';

    cats.forEach(function(cat) {
        var el = document.createElement('div');
        el.className = 'cat-item';
        if (currentCategory && currentCategory.category_id === cat.category_id) {
            el.className += ' active';
        }
        el.innerHTML = '<span class="cat-dot"></span>' + (cat.category_name || 'Kategori');
        el.addEventListener('click', function() {
            var ciEls = document.querySelectorAll('.cat-item');
            for (var ci = 0; ci < ciEls.length; ci++) { ciEls[ci].classList.remove('active'); }
            el.classList.add('active');
            document.getElementById('favToggleBtn').classList.remove('active');
            loadCategoryContent(cat);
        });
        list.appendChild(el);
    });
}

function loadCategoryContent(cat) {
    currentCategory = cat;
    var cacheKey = currentMenuType + '_' + cat.category_id;
    if (streamsCache[cacheKey]) {
        showChannels(cat.category_name);
        allLoadedChannels = streamsCache[cacheKey];
        filterAndRender();
        return;
    }

    var action = '';
    if (currentMenuType === 'live') action = 'action=get_live_streams&category_id=' + cat.category_id;
    else if (currentMenuType === 'movies') action = 'action=get_vod_streams&category_id=' + cat.category_id;
    else if (currentMenuType === 'series') action = 'action=get_series&category_id=' + cat.category_id;

    showChannels(cat.category_name);
    document.getElementById('channelsList').innerHTML = '<div class="no-data">Yukleniyor...</div>';

    apiRequestWithProxy(action, function(streams) {
        if (!Array.isArray(streams)) streams = [];
        streamsCache[cacheKey] = streams;
        allLoadedChannels = streams;
        filterAndRender();
    }, function() {
        document.getElementById('channelsList').innerHTML = '<div class="no-data">Yuklenemedi</div>';
    });
}

function filterAndRender() {
    var query = document.getElementById('searchInput').value.trim().toLowerCase();
    if (query) {
        currentChannels = allLoadedChannels.filter(function(ch) {
            var name = (ch.name || ch.title || '').toLowerCase();
            var cat = (ch.category_name || '').toLowerCase();
            return name.indexOf(query) !== -1 || cat.indexOf(query) !== -1;
        });
    } else {
        currentChannels = allLoadedChannels.slice();
    }
    renderChannels();
}

function renderChannels() {
    var list = document.getElementById('channelsList');
    list.innerHTML = '';

    if (!currentChannels || currentChannels.length === 0) {
        list.innerHTML = '<div class="no-data">Icerik bulunamadi</div>';
        return;
    }

    var accName = getAccountName();

    currentChannels.forEach(function(ch, idx) {
        var el = document.createElement('div');
        el.className = 'ch-item';

        var chType = ch._favType || currentMenuType;

        var numText = '';
        if (chType === 'live') numText = ch.num || (idx + 1);
        else if (chType === 'movies') numText = ch.rating ? Math.min(Math.floor(ch.rating / 2), 5) + '*' : 'HD';
        else numText = 'DZ';

        var logoUrl = ch.stream_icon || ch.icon || ch.cover || '';
        var logoHtml = '';
        if (logoUrl && logoUrl.indexOf('http') === 0) {
            logoHtml = '<div class="ch-logo" data-logo-url="' + logoUrl + '"><img src="' + logoUrl + '" onerror="loadLogoProxy(this)" loading="lazy"><span class="ch-logo-fallback" style="display:none;font-size:11px;font-weight:700">' + numText + '</span></div>';
        } else {
            logoHtml = '<div class="ch-num">' + numText + '</div>';
        }

        var metaText = '';
        if (chType === 'live') metaText = ch.category_name || '';
        else if (chType === 'movies') metaText = (ch.category_name || '') + (ch.year ? ' | ' + ch.year : '');
        else metaText = ch.category_name || '';

        var streamId = ch.stream_id || ch.series_id || '';
        var isFav = Storage.isFavorite(accName, chType, String(streamId));
        var favClass = isFav ? ' active' : '';

        var progressHtml = '';
        if ((chType === 'movies' || chType === 'series') && streamId) {
            var pos = Storage.getWatchPosition(accName, String(streamId));
            if (pos > 10) {
                progressHtml = '<div class="ch-progress"><div class="ch-progress-fill" style="width:0%"></div></div>';
            }
        }

        var typeBadge = '';
        if (ch._favType) {
            var badgeLabel = chType === 'live' ? 'CANLI' : chType === 'movies' ? 'FILM' : 'DIZI';
            var badgeColor = chType === 'live' ? '#4caf50' : chType === 'movies' ? '#2196f3' : '#ff9800';
            typeBadge = '<span style="font-size:9px;color:' + badgeColor + ';margin-left:4px">[' + badgeLabel + ']</span>';
        }

        el.innerHTML =
            logoHtml +
            '<div class="ch-text">' +
                '<div class="ch-name">' + (ch.name || 'Icerik ' + (idx + 1)) + typeBadge + '</div>' +
                '<div class="ch-meta">' + metaText + '</div>' +
            '</div>' +
            '<button class="ch-fav' + favClass + '" data-stream-id="' + streamId + '" data-ch-type="' + chType + '">&#9733;</button>' +
            progressHtml;

        el.addEventListener('click', function(e) {
            if (e.target.closest('.ch-fav')) return;
            var chEls = document.querySelectorAll('.ch-item');
            for (var ci = 0; ci < chEls.length; ci++) { chEls[ci].classList.remove('active'); }
            el.classList.add('active');
            playItem(ch, chType);
        });

        var favBtn = el.querySelector('.ch-fav');
        favBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var added = Storage.toggleFavorite(accName, chType, String(streamId));
            favBtn.classList.toggle('active', added);

            if (!added && document.getElementById('favToggleBtn').classList.contains('active')) {
                el.remove();
                currentChannels = currentChannels.filter(function(c) { return c !== ch; });
                var countEl = document.querySelector('#chLabel');
                if (countEl) countEl.textContent = 'TUM FAVORILER (' + currentChannels.length + ')';
            }
        });

        list.appendChild(el);
    });

    loadProgressForVisibleItems();
}

function loadProgressForVisibleItems() {
    if (currentMenuType === 'live') return;
    var accName = getAccountName();
    var items = document.querySelectorAll('.ch-item');
    for (var ci = 0; ci < items.length; ci++) { (function(item) {
        var favBtn = item.querySelector('.ch-fav');
        if (!favBtn) return;
        var streamId = favBtn.getAttribute('data-stream-id');
        if (!streamId) return;
        var pos = Storage.getWatchPosition(accName, streamId);
        if (pos > 10) {
            var progressDiv = item.querySelector('.ch-progress');
            if (!progressDiv) {
                progressDiv = document.createElement('div');
                progressDiv.className = 'ch-progress';
                progressDiv.innerHTML = '<div class="ch-progress-fill"></div>';
                item.appendChild(progressDiv);
            }
            progressDiv.style.display = '';
        }
    })(items[ci]); }
}

function playItem(ch, overrideType) {
    var type = overrideType || currentMenuType;
    var streamId;
    var ext = ch.container_extension || 'mp4';

    if (type === 'series' && ch.series_id && !ch.stream_id) {
        loadSeriesSeasons(ch);
        return;
    }
    streamId = ch.stream_id;

    if (!streamId) { setStatus('Stream ID bulunamadi'); return; }

    var rawUrl = getStreamUrl(type, streamId, ext);
    if (!rawUrl) { setStatus('Yayin linki alinamadi'); return; }

    var name = ch.name || 'Bilinmeyen';
    currentStream = { id: String(streamId), type: type, name: name, ext: ext };

    if (isAndroid() && (type === 'movies' || type === 'series') &&
        window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ExoPlayer) {
        if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
        var video = document.getElementById('videoPlayer');
        video.pause();
        video.removeAttribute('src');
        clearWatchSaveTimer();
        stopSpeedMonitor();
        window.Capacitor.Plugins.ExoPlayer.play({ url: rawUrl, title: name });
        return;
    }

    document.getElementById('currentChannelName').textContent = name;
    document.getElementById('channelStatus').textContent = 'Yukleniyor...';

    var codecParts = [];
    if (ch.video_codec) codecParts.push(ch.video_codec.toUpperCase());
    if (ch.audio_codec) codecParts.push(ch.audio_codec.toUpperCase());
    var rating = ch.rating ? ' | ' + ch.rating + '/10' : '';
    document.getElementById('np-codec-text').textContent = codecParts.join(' | ') + rating;

    var poster = document.getElementById('npPoster');
    var coverUrl = ch.cover || ch.cover_big || ch.stream_icon || '';
    if (coverUrl && coverUrl.indexOf('http') === 0) {
        var posterUrl = isAndroid() ? coverUrl : coverUrl;
        poster.innerHTML = '<img src="' + posterUrl + '" onerror="this.style.display=\'none\'">';
    } else {
        poster.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 4l15 8-15 8z"/></svg>';
    }

    document.getElementById('qualityBadge').style.display = 'none';
    document.getElementById('connBar').style.width = '0%';
    document.getElementById('connSpeed').textContent = '...';

    var video = document.getElementById('videoPlayer');
    video.preload = 'auto';
    playWithFallback(video, rawUrl, type === 'live', name, 0);
}

function playEmbeddedVod(url, title) {
    var nativeApi = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.EmbedPlayer;
    if (!nativeApi) return false;

    var screenEl = document.querySelector('.tv-screen');
    if (!screenEl) return false;

    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    var video = document.getElementById('videoPlayer');
    video.pause();
    video.removeAttribute('src');
    clearWatchSaveTimer();
    stopSpeedMonitor();

    document.getElementById('currentChannelName').textContent = title;
    document.getElementById('channelStatus').textContent = 'Yukleniyor...';
    document.getElementById('videoPlaceholder').style.display = 'none';

    function getRect() {
        var r = screenEl.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    }

    var r = getRect();
    nativeApi.play({ url: url, title: title, x: r.x, y: r.y, w: r.w, h: r.h }).then(function() {
        nativeVodActive = true;
        video.style.visibility = 'hidden';
        var controls = document.getElementById('videoControls');
        if (controls) controls.style.display = 'none';
        nativeApi.rect(getRect());
        setStatus('Oynatiliyor: ' + title);
    }).catch(function(err) {
        document.getElementById('videoPlaceholder').style.display = '';
        setStatus('Oynatma baslatilamadi');
    });

    function onRect() {
        if (nativeVodActive) nativeApi.rect(getRect());
    }
    if (window._embedRectHandler) {
        window.removeEventListener('resize', window._embedRectHandler);
        window.removeEventListener('fullscreenchange', window._embedRectHandler);
        window.removeEventListener('orientationchange', window._embedRectHandler);
    }
    window._embedRectHandler = onRect;
    window.addEventListener('resize', onRect);
    window.addEventListener('fullscreenchange', onRect);
    window.addEventListener('orientationchange', onRect);
    return true;
}

function stopNativeVod(callback) {
    if (!nativeVodActive) { if (callback) callback(); return; }
    nativeVodActive = false;
    var nativeApi = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.EmbedPlayer;
    if (nativeApi) {
        nativeApi.stop().then(function() {
            var video = document.getElementById('videoPlayer');
            if (video) video.style.visibility = '';
            var placeholder = document.getElementById('videoPlaceholder');
            if (placeholder) placeholder.style.display = '';
            var controls = document.getElementById('videoControls');
            if (controls) controls.style.display = '';
            if (callback) callback();
        });
    } else {
        var video = document.getElementById('videoPlayer');
        if (video) video.style.visibility = '';
        var placeholder = document.getElementById('videoPlaceholder');
        if (placeholder) placeholder.style.display = '';
        var controls = document.getElementById('videoControls');
        if (controls) controls.style.display = '';
        if (callback) callback();
    }
}
function playWithFallback(video, rawUrl, isLive, name, attempt) {
    stopNativeVod(function() {
        _doPlayWithFallback(video, rawUrl, isLive, name, attempt);
    });
}

function _doPlayWithFallback(video, rawUrl, isLive, name, attempt) {
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    video.pause();
    video.removeAttribute('src');
    video._resumeAttempted = false;
    clearWatchSaveTimer();
    stopSpeedMonitor();

    var useProxyFirst = !isAndroid() && typeof rawUrl === 'string' && rawUrl.indexOf('http:') === 0;
    var url = (attempt === 0 && !useProxyFirst) ? rawUrl : getLocalProxyUrl(rawUrl);
    var isHls = url.indexOf('.m3u8') !== -1 || (isLive && url.indexOf('.ts') !== -1);
    var label = (attempt === 0) ? 'direct' : 'proxy';
    console.log('[PLAY] attempt=' + label + ' isHls=' + isHls + ' url=' + url.substring(0, 120));

    var playbackTimer = null;

    video.onplaying = function() {
        if (playbackTimer) { clearTimeout(playbackTimer); playbackTimer = null; }
        document.getElementById('channelStatus').textContent = 'Oynatiliyor';
        document.getElementById('videoPlaceholder').style.display = 'none';
        setStatus('Oynatiliyor: ' + name);
        updatePlayPauseIcon(false);
        startSpeedMonitor();
        reconnectAttempts = 0;

        if (!isLive && currentStream) {
            startWatchSaveTimer();
        }
    };

    video.onloadedmetadata = function() {
        updateVideoQuality(video);
        if (!isLive && currentStream) {
            var savedPos = Storage.getWatchPosition(getAccountName(), currentStream.id);
            var dur = video.duration;
            if (savedPos > 10 && dur && isFinite(dur) && dur > 0 && savedPos < dur - 10) {
                video.currentTime = savedPos;
                setStatus('Kaldigi yerden oynatiliyor: ' + name);
            }
        }
        video.play().catch(function(){});
    };

    video.onresize = function() {
        if (video.videoWidth > 0) updateVideoQuality(video);
    };

    video.oncanplay = function() {
        if (!isLive && currentStream && video._resumeAttempted !== true) {
            video._resumeAttempted = true;
            var savedPos = Storage.getWatchPosition(getAccountName(), currentStream.id);
            var dur = video.duration;
            if (savedPos > 10 && dur && isFinite(dur) && dur > 0 && savedPos < dur - 10 && Math.abs(video.currentTime - savedPos) > 5) {
                video.currentTime = savedPos;
                setStatus('Kaldigi yerden oynatiliyor: ' + name);
            }
        }
    };

    video.onerror = function() {
        var err = video.error;
        var msg = 'Oynatma hatasi';
        if (err) {
            if (err.code === 4) msg = 'Desteklenmeyen format (kod: ' + (video.src || '').substring(0, 60) + ')';
            else if (err.code === 2) msg = 'Ag hatasi';
            else if (err.code === 1) msg = 'Iptal edildi';
        }
        console.log('[VIDEO] error code=' + (err ? err.code : 'none') + ' msg=' + msg + ' url=' + (video.src || '').substring(0, 120));
        document.getElementById('channelStatus').textContent = msg;
        setStatus(msg);
        stopSpeedMonitor();
        if (playbackTimer) { clearTimeout(playbackTimer); playbackTimer = null; }
        if (attempt < 1 && !isAndroid()) {
            console.log('[PLAY] ' + label + ' failed, retrying with proxy...');
            document.getElementById('channelStatus').textContent = 'Proxy ile yeniden deneniyor...';
            playWithFallback(video, rawUrl, isLive, name, attempt + 1);
        }
    };

    playbackTimer = setTimeout(function() {
        console.log('[PLAY] playback timeout after 15s, attempt=' + label);
        document.getElementById('channelStatus').textContent = 'Oynatma zaman asimi';
        setStatus('Oynatma zaman asimi: ' + name);
        stopSpeedMonitor();
        if (playbackTimer) { clearTimeout(playbackTimer); playbackTimer = null; }
        if (attempt < 1 && !isAndroid()) {
            console.log('[PLAY] timeout, retrying with proxy...');
            document.getElementById('channelStatus').textContent = 'Proxy ile yeniden deneniyor...';
            playWithFallback(video, rawUrl, isLive, name, attempt + 1);
        }
    }, 15000);

    if (isHls) {
        hlsPlay(video, url, isLive, function() {
            if (playbackTimer) { clearTimeout(playbackTimer); playbackTimer = null; }
            if (attempt < 1 && !isAndroid()) {
                console.log('[PLAY] ' + label + ' failed, retrying with proxy...');
                document.getElementById('channelStatus').textContent = 'Proxy ile yeniden deneniyor...';
                playWithFallback(video, rawUrl, isLive, name, attempt + 1);
            } else {
                setStatus('Oynatma hatasi: ' + name);
            }
        });
    } else {
        video.src = url;
        video.play().catch(function(){});
    }
}

function loadSeriesSeasons(ch) {
    document.getElementById('chLabel').textContent = ch.name;
    document.getElementById('channelsList').innerHTML = '<div class="no-data">Bolumler yukleniyor...</div>';

    var accName = getAccountName();
    var isFav = Storage.isFavorite(accName, 'series', String(ch.series_id));

    apiRequestWithProxy('action=get_series_info&series_id=' + ch.series_id, function(data) {
        if (!data || !data.episodes) {
            document.getElementById('channelsList').innerHTML = '<div class="no-data">Bolum bulunamadi</div>';
            return;
        }
        var all = [];
        var keys = Object.keys(data.episodes);
        for (var i = 0; i < keys.length; i++) {
            var eps = data.episodes[keys[i]];
            if (Array.isArray(eps)) {
                for (var j = 0; j < eps.length; j++) {
                    eps[j].season = keys[i];
                    all.push(eps[j]);
                }
            }
        }
        renderEpisodeList(all, ch, isFav);
    }, function() {
        document.getElementById('channelsList').innerHTML = '<div class="no-data">Hata olustu</div>';
    });
}

function renderEpisodeList(episodes, series, isFav) {
    var list = document.getElementById('channelsList');
    list.innerHTML = '';

    var header = document.createElement('div');
    header.className = 'ch-item';
    header.style.cssText = 'background:rgba(233,69,96,0.08); border-color:rgba(233,69,96,0.2);';
    header.innerHTML =
        '<div class="ch-text">' +
            '<div class="ch-name" style="color:#e94560">' + (series.name || 'Dizi') + '</div>' +
            '<div class="ch-meta">' + episodes.length + ' bolum</div>' +
        '</div>' +
        '<button class="ch-fav' + (isFav ? ' active' : '') + '" data-series-id="' + series.series_id + '">&#9733;</button>';

    var favBtn = header.querySelector('.ch-fav');
    favBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var added = Storage.toggleFavorite(getAccountName(), 'series', String(series.series_id));
        favBtn.classList.toggle('active', added);
    });
    list.appendChild(header);

    episodes.forEach(function(ep) {
        var el = document.createElement('div');
        el.className = 'ch-item';
        var dur = (ep.info && ep.info.duration) ? ' | ' + ep.info.duration : '';
        var epStreamId = String(ep.id);
        var watched = Storage.getWatchPosition(getAccountName(), epStreamId) > 10;
        var watchDot = watched ? '<span style="color:#4caf50;font-size:10px;margin-left:4px" title="Izlendi">&#9679;</span>' : '';

        el.innerHTML =
            '<div class="ch-num">S' + ep.season + 'E' + ep.episode_num + '</div>' +
            '<div class="ch-text">' +
                '<div class="ch-name">' + (ep.title || 'Bolum ' + ep.episode_num) + watchDot + '</div>' +
                '<div class="ch-meta">' + (ep.container_extension || 'mp4').toUpperCase() + dur + '</div>' +
            '</div>';
        (function(episode) {
            el.addEventListener('click', function() {
                playItem({
                    stream_id: episode.id,
                    name: episode.title || ('S' + episode.season + 'E' + episode.episode_num),
                    container_extension: episode.container_extension || 'mp4',
                    category_name: series.name,
                    video_codec: (episode.info && episode.info.video) ? episode.info.video.codec_name : '',
                    audio_codec: (episode.info && episode.info.audio) ? episode.info.audio.codec_name : ''
                }, 'series');
            });
        })(ep);
        list.appendChild(el);
    });
}

function setupPlayerControls() {
    var video = document.getElementById('videoPlayer');
    var controlsTimeout;

    document.querySelector('.tv-screen').addEventListener('mousemove', function() {
        var controls = document.getElementById('videoControls');
        controls.classList.add('show');
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(function() {
            if (!video.paused) controls.classList.remove('show');
        }, 3000);
    });

    document.getElementById('playPauseBtn').addEventListener('click', function() {
        if (video.paused) video.play(); else video.pause();
    });

    video.addEventListener('play', function() { updatePlayPauseIcon(false); });
    video.addEventListener('pause', function() { updatePlayPauseIcon(true); });

    document.getElementById('seekBackBtn').addEventListener('click', function() {
        video.currentTime = Math.max(0, video.currentTime - 10);
        flashControls();
    });

    document.getElementById('seekFwdBtn').addEventListener('click', function() {
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
        flashControls();
    });

    document.getElementById('volumeSlider').addEventListener('input', function(e) {
        video.volume = e.target.value / 100;
        video.muted = false;
        updateVolumeIcon();
    });

    document.getElementById('muteBtn').addEventListener('click', function() {
        video.muted = !video.muted;
        updateVolumeIcon();
    });

    document.getElementById('fullscreenBtn').addEventListener('click', function() {
        var el = document.querySelector('.tv-screen');
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else if (el.requestFullscreen) {
            el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
            el.webkitRequestFullscreen();
        }
    });

    var progressDragging = false;

    video.addEventListener('timeupdate', function() {
        if (progressDragging) return;
        var cur = video.currentTime;
        var dur = video.duration || 0;
        document.getElementById('timeDisplay').textContent = formatTime(cur) + ' / ' + formatTime(dur);
        if (dur > 0) document.getElementById('progressFill').style.width = ((cur / dur) * 100) + '%';
    });

    video.addEventListener('progress', function() {
        if (video.buffered.length > 0) {
            var buffEnd = video.buffered.end(video.buffered.length - 1);
            var dur = video.duration || 1;
            document.getElementById('progressBuffered').style.width = ((buffEnd / dur) * 100) + '%';
        }
    });

    document.getElementById('progressBar').addEventListener('mousedown', function(e) {
        progressDragging = true;
        seekTo(e);
    });

    document.addEventListener('mousemove', function(e) {
        if (progressDragging) seekTo(e);
    });

    document.addEventListener('mouseup', function() {
        progressDragging = false;
    });

    function seekTo(e) {
        var rect = document.getElementById('progressBar').getBoundingClientRect();
        var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (video.duration) video.currentTime = pct * video.duration;
    }

    document.getElementById('settingsBtn').addEventListener('click', function() {
        window.location.href = 'index.html';
    });
}

function updatePlayPauseIcon(paused) {
    var icon = document.getElementById('playPauseIcon');
    if (paused) {
        icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    } else {
        icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    }
}

function updateVolumeIcon() {
    var video = document.getElementById('videoPlayer');
    var icon = document.getElementById('volumeIcon');
    if (video.muted || video.volume === 0) {
        icon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else if (video.volume < 0.5) {
        icon.innerHTML = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
    } else {
        icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
    }
}

function flashControls() {
    var controls = document.getElementById('videoControls');
    controls.classList.add('show');
    clearTimeout(flashControls._timer);
    flashControls._timer = setTimeout(function() {
        var video = document.getElementById('videoPlayer');
        if (!video.paused) controls.classList.remove('show');
    }, 2000);
}

function setupSearch() {
    var input = document.getElementById('searchInput');
    var clearBtn = document.getElementById('searchClear');

    input.addEventListener('input', function() {
        clearBtn.classList.toggle('hidden', !input.value);
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(function() {
            filterAndRender();
        }, 200);
    });

    clearBtn.addEventListener('click', function() {
        input.value = '';
        clearBtn.classList.add('hidden');
        filterAndRender();
        input.focus();
    });
}

function setupFavoritesToggle() {
    document.getElementById('favToggleBtn').addEventListener('click', function() {
        var isActive = this.classList.contains('active');
        if (isActive) {
            this.classList.remove('active');
            if (currentCategory) {
                showChannels(currentCategory.category_name);
                filterAndRender();
            } else {
                showCategories();
            }
        } else {
            this.classList.add('active');
            showAllFavorites();
        }
    });
}

function showAllFavorites() {
    var accName = getAccountName();
    var favs = Storage.getFavorites(accName);
    var allFav = [];
    var types = ['live', 'movies', 'series'];

    types.forEach(function(type) {
        var channelsForType = [];

        var cacheKeys = Object.keys(streamsCache);
        for (var k = 0; k < cacheKeys.length; k++) {
            if (cacheKeys[k].indexOf(type + '_') === 0) {
                var arr = streamsCache[cacheKeys[k]];
                if (Array.isArray(arr)) channelsForType = channelsForType.concat(arr);
            }
        }

        if (channelsForType.length === 0 && allChannelsCache[type]) {
            channelsForType = allChannelsCache[type];
        }

        Object.keys(favs[type] || {}).forEach(function(id) {
            if (!favs[type][id]) return;
            for (var i = 0; i < channelsForType.length; i++) {
                var ch = channelsForType[i];
                var chId = String(ch.stream_id || ch.series_id || '');
                if (chId === id) {
                    ch._favType = type;
                    allFav.push(ch);
                    break;
                }
            }
        });
    });

    currentChannels = allFav;
    showChannels('TUM FAVORILER (' + allFav.length + ')');
    renderChannels();
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT') return;

        var video = document.getElementById('videoPlayer');
        switch(e.key) {
            case ' ':
            case 'k':
                e.preventDefault();
                if (video.paused) video.play(); else video.pause();
                flashControls();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                video.currentTime = Math.max(0, video.currentTime - 10);
                flashControls();
                break;
            case 'ArrowRight':
                e.preventDefault();
                video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
                flashControls();
                break;
            case 'ArrowUp':
                e.preventDefault();
                video.volume = Math.min(1, video.volume + 0.1);
                document.getElementById('volumeSlider').value = Math.round(video.volume * 100);
                updateVolumeIcon();
                flashControls();
                break;
            case 'ArrowDown':
                e.preventDefault();
                video.volume = Math.max(0, video.volume - 0.1);
                document.getElementById('volumeSlider').value = Math.round(video.volume * 100);
                updateVolumeIcon();
                flashControls();
                break;
            case 'm':
            case 'M':
                video.muted = !video.muted;
                updateVolumeIcon();
                flashControls();
                break;
            case 'f':
            case 'F':
                if (document.fullscreenElement) document.exitFullscreen();
                else document.querySelector('.tv-screen').requestFullscreen();
                break;
            case 'p':
            case 'P':
                var pipVid = document.getElementById('videoPlayer');
                if (document.pictureInPictureElement) document.exitPictureInPicture();
                else if (pipVid.src) pipVid.requestPictureInPicture().catch(function(){});
                break;
            case 's':
            case 'S':
                if (subtitleData.length > 0) {
                    subtitleVisible = !subtitleVisible;
                    if (!subtitleVisible) document.getElementById('subtitleDisplay').innerHTML = '';
                    setStatus(subtitleVisible ? 'Altyazi acildi' : 'Altyazi kapatildi');
                } else {
                    document.getElementById('subFileInput').click();
                }
                break;
        }
    });
}

function startWatchSaveTimer() {
    clearWatchSaveTimer();
    watchSaveTimer = setInterval(function() {
        var video = document.getElementById('videoPlayer');
        if (!video.paused && currentStream && !video.seeking) {
            Storage.updateWatchPosition(
                getAccountName(),
                currentStream.id,
                Math.floor(video.currentTime),
                Math.floor(video.duration || 0)
            );
        }
    }, 5000);
}

function clearWatchSaveTimer() {
    if (watchSaveTimer) {
        clearInterval(watchSaveTimer);
        watchSaveTimer = null;
    }
}

function formatTime(s) {
    if (!s || isNaN(s)) return '00:00';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
}

function checkTrialAccess() {
    var trialData = JSON.parse(localStorage.getItem('xtream_trial') || 'null');
    if (!trialData || trialData.activated) return true;

    var now = Date.now();
    if (now > trialData.endDate) {
        var deviceId = '';
        try {
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.fillText('XtreamBaba', 2, 2);
            var raw = canvas.toDataURL() + '|' + navigator.userAgent + '|' + screen.width + 'x' + screen.height + '|' + navigator.language + '|' + navigator.platform;
            var h = 0;
            for (var i = 0; i < raw.length; i++) { h = ((h << 5) - h) + raw.charCodeAt(i); h |= 0; }
            deviceId = 'XB-' + Math.abs(h).toString(36);
        } catch(e) {}

        document.querySelector('.app').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#0b1120,#1a1a3e);color:white;font-family:Segoe UI,sans-serif">' +
            '<div style="text-align:center;max-width:400px;padding:40px">' +
            '<div style="font-size:48px;margin-bottom:16px">&#128274;</div>' +
            '<h2 style="color:#e94560;margin-bottom:8px">Xtream Baba</h2>' +
            '<p style="font-size:16px;color:#ff6b6b;margin-bottom:20px">Deneme suresi dolmustur!</p>' +
            '<p style="font-size:13px;color:#667;margin-bottom:8px">Cihaz Kimligi:</p>' +
            '<div style="font-size:12px;color:#e94560;font-family:monospace;word-break:break-all;background:rgba(255,255,255,0.05);padding:10px;border-radius:6px;margin-bottom:24px;border:1px solid rgba(255,255,255,0.1)">' + deviceId + '</div>' +
            '<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:20px;margin-bottom:24px;text-align:left">' +
            '<div style="font-size:14px;color:#fff;font-weight:600;margin-bottom:12px">Lisans Secenekleri:</div>' +
            '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="color:#ff9800;font-weight:600">Aylik</span><span style="color:#ff9800;font-weight:700">50 TL</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="color:#2196F3;font-weight:600">Yillik</span><span style="color:#2196F3;font-weight:700">400 TL</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:#4caf50;font-weight:600">Omur Boyu</span><span style="color:#4caf50;font-weight:700">800 TL</span></div>' +
            '</div>' +
            '<input type="text" id="licInput" placeholder="Lisans kodunuzu girin" style="width:100%;padding:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:14px;margin-bottom:12px;outline:none">' +
            '<button onclick="doActivate()" style="width:100%;padding:13px;background:#4caf50;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:10px">Lisansi Aktiflestir</button>' +
            '<p style="font-size:11px;color:#556">Satin almak icin: xtreammbaba@gmail.com</p>' +
            '</div></div>';
        window.doActivate = function() {
            var code = document.getElementById('licInput').value.trim();
            var result = verifyLicenseCode(code, deviceId);
            if (result && result.valid) {
                trialData.activated = true;
                trialData.licenseCode = code;
                localStorage.setItem('xtream_trial', JSON.stringify(trialData));
                location.reload();
            } else { alert('Gecersiz lisans kodu!'); }
        };
        return false;
    }
    return true;
}

function setupThemeToggle() {
    var saved = localStorage.getItem('xtream_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    if (typeof window.updateThemeIcons === 'function') {
        window.updateThemeIcons(saved);
    } else {
        updateThemeIcon(saved);
    }

    document.getElementById('themeBtn').addEventListener('click', function() {
        var current = document.documentElement.getAttribute('data-theme');
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('xtream_theme', next);
        if (typeof window.updateThemeIcons === 'function') {
            window.updateThemeIcons(next);
        } else {
            updateThemeIcon(next);
        }
    });
}

function updateThemeIcon(theme) {
    var icon = document.getElementById('themeIcon');
    if (theme === 'light') {
        icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    } else {
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    }
}

function setStatus(msg) {
    document.getElementById('statusText').textContent = msg;
}

function loadLogoProxy(img) {
    var container = img.parentElement;
    var originalUrl = container.getAttribute('data-logo-url');
    if (!originalUrl) { img.style.display = 'none'; container.querySelector('.ch-logo-fallback').style.display = 'flex'; return; }

    if (img.getAttribute('data-tried-proxy')) {
        img.style.display = 'none';
        var fb = container.querySelector('.ch-logo-fallback');
        if (fb) fb.style.display = 'flex';
        return;
    }

    img.setAttribute('data-tried-proxy', '1');
    var proxyUrl = window.electronAPI ? '/proxy?url=' + encodeURIComponent(originalUrl) : getLocalProxyUrl(originalUrl);
    img.src = proxyUrl;
}

function updateVideoQuality(video) {
    var w = video.videoWidth;
    var h = video.videoHeight;
    if (!w || !h) return;

    var badge = document.getElementById('qualityBadge');
    var label = document.getElementById('qualityLabel');
    var res = document.getElementById('qualityRes');

    var quality, cls;
    if (w >= 3840) { quality = '4K'; cls = 'q-uhd'; }
    else if (w >= 1920) { quality = 'FHD'; cls = 'q-fhd'; }
    else if (w >= 1280) { quality = 'HD'; cls = 'q-hd'; }
    else { quality = 'SD'; cls = 'q-sd'; }

    label.textContent = quality;
    label.className = 'q-label ' + cls;
    res.textContent = w + 'x' + h;
    badge.style.display = '';
}

function startSpeedMonitor() {
    stopSpeedMonitor();
    lastBufferedEnd = 0;
    lastTime = Date.now();
    lastSpeed = 0;
    lastPlayTime = 0;

    speedMonitor = setInterval(function() {
        var video = document.getElementById('videoPlayer');
        if (!video || video.paused || video.ended) { updateConnBar(0); return; }

        var now = Date.now();
        var elapsed = (now - lastTime) / 1000;
        if (elapsed < 0.8) return;

        var bufferedEnd = 0;
        for (var i = 0; i < video.buffered.length; i++) {
            if (video.buffered.end(i) > bufferedEnd) bufferedEnd = video.buffered.end(i);
        }

        var bufferDelta = bufferedEnd - lastBufferedEnd;
        var playDelta = video.currentTime - lastPlayTime;
        lastBufferedEnd = bufferedEnd;
        lastPlayTime = video.currentTime;
        lastTime = now;

        var speedMbps = 0;
        if (bufferDelta > 0) {
            var bitrate = video.videoWidth * video.videoHeight * 3 * 8;
            if (bitrate < 1000000) bitrate = 2000000;
            speedMbps = (bufferDelta * bitrate) / elapsed / 1000000;
        } else if (playDelta > 0 && !video.paused) {
            var bufferedAhead = bufferedEnd - video.currentTime;
            if (bufferedAhead > 3) speedMbps = lastSpeed > 0 ? lastSpeed * 0.95 : 5;
            else if (bufferedAhead > 1) speedMbps = lastSpeed > 0 ? lastSpeed * 0.8 : 3;
            else speedMbps = lastSpeed > 0 ? lastSpeed * 0.6 : 1.5;
        }

        speedMbps = Math.min(50, Math.max(0, speedMbps));
        if (speedMbps > 0.1) lastSpeed = speedMbps;
        updateConnBar(speedMbps);
    }, 2000);
}

function stopSpeedMonitor() {
    if (speedMonitor) { clearInterval(speedMonitor); speedMonitor = null; }
    document.getElementById('connBar').style.width = '0%';
    document.getElementById('connSpeed').textContent = '0 Mbps';
}

function updateConnBar(mbps) {
    var bar = document.getElementById('connBar');
    var text = document.getElementById('connSpeed');

    var pct = Math.min(100, (mbps / 20) * 100);
    bar.style.width = Math.max(2, pct) + '%';
    bar.className = 'conn-bar';

    if (mbps >= 8) { bar.classList.add('conn-good'); }
    else if (mbps >= 3) { bar.classList.add('conn-medium'); }
    else { bar.classList.add('conn-bad'); }

    if (mbps >= 1) text.textContent = mbps.toFixed(1) + ' Mbps';
    else text.textContent = (mbps * 1000).toFixed(0) + ' Kbps';
}

// === VERSION CHECK ===
function checkForUpdate() {
    if (!VERSION_CHECK_URL) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', VERSION_CHECK_URL + '?t=' + Date.now(), true);
    xhr.timeout = 10000;
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                var data = JSON.parse(xhr.responseText);
                if (data && data.version && data.version !== APP_VERSION) {
                    showUpdatePopup(data);
                }
            } catch (e) {}
        }
    };
    xhr.onerror = function() {};
    xhr.send(null);
}

function showUpdatePopup(data) {
    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:48px;left:50%;-webkit-transform:translateX(-50%);transform:translateX(-50%);background:linear-gradient(135deg,#1a2744,#111b30);border:1px solid rgba(233,69,96,0.3);border-radius:10px;padding:16px 20px;z-index:9999;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#e0e0e0;font-family:Segoe UI,sans-serif';
    bar.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
            '<div style="width:32px;height:32px;background:rgba(233,69,96,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#e94560;font-size:16px">&#8679;</div>' +
            '<div><div style="font-size:14px;font-weight:600;color:#fff">Guncelleme Mevcut</div>' +
            '<div style="font-size:11px;color:#667">Surum: ' + data.version + '</div></div>' +
        '</div>' +
        (data.changelog ? '<div style="font-size:11px;color:#8899bb;margin-bottom:12px;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px">' + data.changelog + '</div>' : '') +
        '<div style="display:flex;gap:8px">' +
            '<a href="' + (data.downloadUrl || '#') + '" target="_blank" style="flex:1;text-align:center;padding:8px;background:#e94560;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer">Indir</a>' +
            '<button onclick="this.closest(\'div\').parentElement.remove()" style="flex:1;padding:8px;background:rgba(255,255,255,0.05);color:#888;border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:12px;cursor:pointer">Sonra</button>' +
        '</div>';
    document.body.appendChild(bar);
    setTimeout(function() { if (bar.parentElement) bar.remove(); }, 30000);
}

// === AUTO RECONNECT ===
function setupAutoReconnect() {
    var video = document.getElementById('videoPlayer');
    video.addEventListener('error', function() {
        if (!currentStream || currentMenuType === 'live') return;
        if (reconnectAttempts >= MAX_RECONNECT) return;

        reconnectAttempts++;
        var delay = reconnectAttempts * 2000;
        setStatus('Baglanti kesildi, ' + (delay / 1000) + ' sn sonra yeniden deneniyor... (' + reconnectAttempts + '/' + MAX_RECONNECT + ')');
        document.getElementById('channelStatus').textContent = 'Yeniden baglaniyor...';

        setTimeout(function() {
            if (currentStream) {
                var rawUrl = getStreamUrl(currentStream.type, currentStream.id, currentStream.ext);
                if (rawUrl) {
                    playWithFallback(video, rawUrl, currentStream.type === 'live', currentStream.name, 0);
                }
            }
        }, delay);
    });

    video.addEventListener('playing', function() {
        reconnectAttempts = 0;
    });
}

// === PIP MODE ===
function setupPiP() {
    var video = document.getElementById('videoPlayer');
    var btn = document.getElementById('pipBtn');
    var returnBtn = document.getElementById('pipReturnBtn');
    if (!btn) return;

    var isElectron = !!(window.electronAPI && window.electronAPI.minimizeWindow);
    var isAndroidDevice = isAndroid();
    var hasCapacitorPiP = !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PiP);

    if (!isElectron && !isAndroidDevice && !document.pictureInPictureEnabled) {
        btn.style.display = 'none';
        return;
    }

    function onPipEnter() {
        btn.classList.add('active');
        document.querySelector('.app').classList.add('pip-active');
    }
    function onPipLeave() {
        btn.classList.remove('active');
        document.querySelector('.app').classList.remove('pip-active');
    }

    btn.addEventListener('click', function() {
        if (hasCapacitorPiP) {
            window.Capacitor.Plugins.PiP.isInPiP().then(function(result) {
                if (result.isInPiP) {
                    onPipLeave();
                } else {
                    window.Capacitor.Plugins.PiP.enterPiP().then(function() {
                        onPipEnter();
                    }).catch(function() {
                        setStatus('PiP baslatilamadi');
                    });
                }
            }).catch(function() {
                window.Capacitor.Plugins.PiP.enterPiP().then(function() {
                    onPipEnter();
                }).catch(function() {
                    setStatus('PiP baslatilamadi');
                });
            });
        } else if (isElectron) {
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(function() {});
            } else if (video.src || video.currentSrc) {
                video.requestPictureInPicture().catch(function() {});
            }
        } else if (document.pictureInPictureEnabled && (video.src || video.currentSrc)) {
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(function() {});
            } else {
                video.requestPictureInPicture().catch(function() {
                    setStatus('PiP desteklenmiyor');
                });
            }
        }
    });

    if (returnBtn) {
        returnBtn.addEventListener('click', function() {
            if (hasCapacitorPiP) {
                window.Capacitor.Plugins.PiP.enterPiP().catch(function() {});
            }
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(function() {});
            }
            onPipLeave();
        });
    }

    if (hasCapacitorPiP) {
        window.Capacitor.Plugins.PiP.addListener('pipModeChanged', function(data) {
            if (data.isInPiP) { onPipEnter(); } else { onPipLeave(); }
        });
        setInterval(function() {
            window.Capacitor.Plugins.PiP.isInPiP().then(function(r) {
                var app = document.querySelector('.app');
                if (r.isInPiP && !app.classList.contains('pip-active')) { onPipEnter(); }
                else if (!r.isInPiP && app.classList.contains('pip-active')) { onPipLeave(); }
            }).catch(function() {});
        }, 1000);
    } else {
        video.addEventListener('enterpictureinpicture', function() {
            onPipEnter();
            if (isElectron) window.electronAPI.minimizeWindow();
        });
        video.addEventListener('leavepictureinpicture', function() {
            onPipLeave();
            if (isElectron) window.electronAPI.restoreWindow();
        });
    }
}

// === SUBTITLES ===
var subtitleData = [];
var subtitleVisible = true;
var currentSubIndex = -1;
var subtitleSearchTimer = null;

function setupSubtitles() {
    var fileInput = document.getElementById('subFileInput');
    var subBtn = document.getElementById('subBtn');
    var subOffBtn = document.getElementById('subOffBtn');
    var video = document.getElementById('videoPlayer');
    var display = document.getElementById('subtitleDisplay');

    if (!fileInput || !subBtn) return;

    subBtn.addEventListener('click', function() {
        if (subtitleData.length > 0) {
            subtitleVisible = !subtitleVisible;
            if (!subtitleVisible) display.innerHTML = '';
            subBtn.classList.toggle('active', subtitleVisible);
            setStatus(subtitleVisible ? 'Altyazi acildi' : 'Altyazi kapatildi');
        } else {
            showSubtitleMenu();
        }
    });

    function showSubtitleMenu() {
        var existing = document.getElementById('subMenu');
        if (existing) existing.remove();
        var menu = document.createElement('div');
        menu.id = 'subMenu';
        menu.innerHTML =
            '<div class="sub-picker-title">Altyazi</div>' +
            '<div class="sub-picker-item" data-act="search">Internetten ara</div>' +
            '<div class="sub-picker-item" data-act="file">Dosyadan yukle</div>' +
            '<div class="sub-picker-close">Kapat</div>';
        document.body.appendChild(menu);
        menu.addEventListener('click', function(e) {
            var item = e.target.closest('.sub-picker-item');
            if (item) {
                menu.remove();
                if (item.getAttribute('data-act') === 'file') {
                    fileInput.click();
                } else {
                    var name = currentStream ? currentStream.name : '';
                    if (name) {
                        searchSubtitles(name);
                    } else {
                        setStatus('Once bir yayin secin');
                    }
                }
                return;
            }
            if (e.target.classList.contains('sub-picker-close')) menu.remove();
        });
    }

    fileInput.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
            var text = ev.target.result;
            var ext = file.name.split('.').pop().toLowerCase();
            subtitleData = parseSRT(text);
            subtitleVisible = true;
            currentSubIndex = -1;
            subOffBtn.style.display = '';
            subBtn.classList.add('active');
            setStatus('Altyazi yuklendi: ' + file.name + ' (' + subtitleData.length + ' satir)');
        };
        reader.readAsText(file);
        fileInput.value = '';
    });

    subOffBtn.addEventListener('click', function() {
        clearSubtitles();
    });

    video.addEventListener('timeupdate', function() {
        if (!subtitleVisible || subtitleData.length === 0) return;
        var t = video.currentTime;
        var found = -1;
        for (var i = 0; i < subtitleData.length; i++) {
            if (t >= subtitleData[i].start && t <= subtitleData[i].end) {
                found = i;
                break;
            }
        }
        if (found !== currentSubIndex) {
            currentSubIndex = found;
            if (found >= 0) {
                display.innerHTML = '<div class="sub-line">' + escHtml(subtitleData[found].text) + '</div>';
            } else {
                display.innerHTML = '';
            }
        }
    });
}

function searchSubtitles(movieName, onDone) {
    if (!movieName) return;
    clearTimeout(subtitleSearchTimer);
    setStatus('Altyazi araniyor: ' + movieName);
    var langs = ['tur', 'eng'];
    var allResults = [];
    var pending = langs.length;
    var baseUrl = isAndroid()
        ? 'https://rest.opensubtitles.org/search/query-' + encodeURIComponent(movieName) + '/sublanguageid-'
        : '/api/subtitles/search?q=' + encodeURIComponent(movieName) + '&lang=';

    function finish() {
        if (allResults.length > 0) {
            showSubtitlePicker(allResults, movieName);
        } else {
            setStatus('Altyazi bulunamadi');
        }
        if (onDone) onDone({ results: allResults });
    }

    langs.forEach(function(lang) {
        var reqUrl = baseUrl + lang;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', reqUrl, true);
        xhr.timeout = 10000;
        if (isAndroid()) {
            xhr.setRequestHeader('User-Agent', 'TemporaryUserAgent');
        }
        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    var arr = Array.isArray(data) ? data : (data.results || []);
                    var limit = Math.min(arr.length, 6);
                    for (var i = 0; i < limit; i++) {
                        var s = arr[i];
                        allResults.push({
                            id: s.IDSubtitleFile || s.id || '',
                            name: s.SubFileName || s.name || '',
                            lang: s.LanguageName || s.lang || '',
                            format: s.SubFormat || s.format || 'srt',
                            download: s.SubDownloadLink || s.download || '',
                            zipDownload: s.ZipDownloadLink || s.zipDownload || '',
                            rating: s.SubRating || s.rating || '0'
                        });
                    }
                } catch (e) {}
            }
        };
        xhr.onerror = function() {};
        xhr.ontimeout = function() {};
        xhr.send(null);
    });
}

function showSubtitlePicker(subs, movieName) {
    var existing = document.getElementById('subPicker');
    if (existing) existing.remove();

    var picker = document.createElement('div');
    picker.id = 'subPicker';
    var header = '<div class="sub-picker-title">Altyazi secin</div>';
    var items = '';
    subs.slice(0, 8).forEach(function(s, idx) {
        var star = parseFloat(s.rating) > 0 ? ' <span class="sub-picker-rating">' + s.rating + '</span>' : '';
        var langBadge = s.lang ? ' <span class="sub-picker-lang">' + escHtml(s.lang) + '</span>' : '';
        items += '<div class="sub-picker-item" data-idx="' + idx + '">' + escHtml(s.name) + langBadge + star + '</div>';
    });
    items += '<div class="sub-picker-close">Kapat</div>';
    picker.innerHTML = header + items;
    document.body.appendChild(picker);

    picker.addEventListener('click', function(e) {
        var item = e.target.closest('.sub-picker-item');
        if (item) {
            var s = subs[parseInt(item.getAttribute('data-idx'), 10)];
            picker.remove();
            loadSubtitleFromUrl(s.download || s.zipDownload, s.name, function() {
                setStatus('Altyazi yuklendi: ' + s.name + ' (' + s.lang + ')');
                document.getElementById('subBtn').classList.add('active');
                document.getElementById('subOffBtn').style.display = '';
            });
            return;
        }
        if (e.target.classList.contains('sub-picker-close')) picker.remove();
    });
}

function loadSubtitleFromUrl(url, name, onDone) {
    if (!url) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 15000;
    xhr.responseType = 'text';
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            var text = xhr.responseText;
            if (text.indexOf('WEBVTT') !== -1) {
                subtitleData = parseVTT(text);
            } else {
                subtitleData = parseSRT(text);
            }
            subtitleVisible = true;
            currentSubIndex = -1;
            if (onDone) onDone();
        }
    };
    xhr.onerror = function() { setStatus('Altyazi yuklenemedi'); };
    xhr.ontimeout = function() { setStatus('Altyazi yuklenemedi'); };
    xhr.send(null);
}

function clearSubtitles() {
    subtitleData = [];
    currentSubIndex = -1;
    subtitleVisible = true;
    var disp = document.getElementById('subtitleDisplay');
    if (disp) disp.innerHTML = '';
    var off = document.getElementById('subOffBtn');
    if (off) off.style.display = 'none';
    var btn = document.getElementById('subBtn');
    if (btn) btn.classList.remove('active');
}

function parseSRT(text) {
    var subs = [];
    var blocks = text.replace(/\r\n/g, '\n').split('\n\n');
    for (var i = 0; i < blocks.length; i++) {
        var lines = blocks[i].trim().split('\n');
        if (lines.length < 2) continue;
        var timeLine = '';
        var textLines = [];
        for (var j = 0; j < lines.length; j++) {
            if (lines[j].indexOf('-->') !== -1) { timeLine = lines[j]; }
            else if (!isNaN(parseInt(lines[j])) && lines[j].indexOf('-->') === -1) { continue; }
            else { textLines.push(lines[j]); }
        }
        if (!timeLine || textLines.length === 0) continue;
        var times = timeLine.split('-->');
        if (times.length !== 2) continue;
        var start = parseTime(times[0].trim());
        var end = parseTime(times[1].trim());
        if (start >= 0 && end >= 0) {
            subs.push({ start: start, end: end, text: textLines.join('\n') });
        }
    }
    return subs;
}

function parseVTT(text) {
    var lines = text.replace(/\r\n/g, '\n').split('\n');
    var subs = [];
    var i = 0;
    while (i < lines.length) {
        if (lines[i].indexOf('-->') !== -1) {
            var times = lines[i].split('-->');
            if (times.length === 2) {
                var start = parseTime(times[0].trim());
                var end = parseTime(times[1].trim());
                var textLines = [];
                i++;
                while (i < lines.length && lines[i].trim() !== '') {
                    textLines.push(lines[i]);
                    i++;
                }
                if (start >= 0 && end >= 0 && textLines.length > 0) {
                    subs.push({ start: start, end: end, text: textLines.join('\n') });
                }
            }
        }
        i++;
    }
    return subs;
}

function parseTime(str) {
    str = str.replace(',', '.');
    var m = str.match(/(\d+):(\d+):(\d+)[\.\,](\d+)/);
    if (m) {
        return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / Math.pow(10, m[4].length);
    }
    var m2 = str.match(/(\d+):(\d+)[\.\,](\d+)/);
    if (m2) {
        return parseInt(m2[1]) * 60 + parseInt(m2[2]) + parseInt(m2[3]) / Math.pow(10, m2[3].length);
    }
    return -1;
}

function escHtml(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
