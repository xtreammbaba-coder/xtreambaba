(function () {
    'use strict';

    var remoteMode = false;
    var focusEl = null;

    var NAV_SELECTOR = 'button, input, textarea, .server-item, .cat-item, .ch-item, .tab, .back-btn, .search-clear, .dropdown-item, .modal-btn, .modal-close, .sub-picker-item, .sub-picker-close, .ch-fav';

    function isVisible(el) {
        if (!el || el.nodeType !== 1) return false;
        if (el.style.display === 'none') return false;
        if (el.style.visibility === 'hidden') return false;
        if (el.disabled) return false;
        var r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
    }

    function collect() {
        var nodes = document.querySelectorAll(NAV_SELECTOR);
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (!isVisible(el)) continue;
            if (el.closest('.video-controls')) continue;
            if (el.id === 'subFileInput') continue;
            out.push(el);
        }
        return out;
    }

    function clearFocusClass() {
        if (focusEl && focusEl.classList) focusEl.classList.remove('nav-focus');
    }

    function applyFocus(el) {
        if (el === focusEl) return;
        clearFocusClass();
        if (focusEl && focusEl.tagName === 'INPUT' && focusEl.blur) focusEl.blur();
        focusEl = el;
        if (!el) return;
        el.classList.add('nav-focus');
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON') el.focus();
        try {
            if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded(true);
            else el.scrollIntoView(false);
        } catch (e) {}
    }

    function move(dir) {
        var targets = collect();
        if (!targets.length) { defaultFocus(); return; }
        if (!focusEl || !focusEl.parentNode) focusEl = targets[0];

        var from = focusEl || targets[0];
        var fr = from.getBoundingClientRect();
        var fx = fr.left + fr.width / 2;
        var fy = fr.top + fr.height / 2;

        var best = null;
        var bestScore = Infinity;

        for (var i = 0; i < targets.length; i++) {
            var t = targets[i];
            if (t === from) continue;
            var tr = t.getBoundingClientRect();
            var tx = tr.left + tr.width / 2;
            var ty = tr.top + tr.height / 2;
            var dx = tx - fx;
            var dy = ty - fy;
            var score;

            if (dir === 'left') { if (dx >= 0) continue; score = Math.abs(dx) + Math.abs(dy) * 4; }
            else if (dir === 'right') { if (dx <= 0) continue; score = Math.abs(dx) + Math.abs(dy) * 4; }
            else if (dir === 'up') { if (dy >= 0) continue; score = Math.abs(dy) + Math.abs(dx) * 4; }
            else { if (dy <= 0) continue; score = Math.abs(dy) + Math.abs(dx) * 4; }

            if (score < bestScore) { bestScore = score; best = t; }
        }

        if (best) applyFocus(best);
    }

    function defaultFocus() {
        var targets = collect();
        if (!targets.length) return;
        var pref = null;
        var picks = document.querySelectorAll('.ch-item, .cat-item, .tab, input, .server-item');
        for (var i = 0; i < picks.length; i++) {
            if (isVisible(picks[i])) { pref = picks[i]; break; }
        }
        applyFocus(pref || targets[0]);
    }

    function activate() {
        if (!focusEl) { defaultFocus(); return; }
        var t = focusEl;
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') { nextInput(); return; }
        if (typeof t.click === 'function') t.click();
    }

    function nextInput() {
        var inputs = document.querySelectorAll('input, textarea');
        var list = [];
        for (var i = 0; i < inputs.length; i++) {
            if (isVisible(inputs[i])) list.push(inputs[i]);
        }
        if (!list.length) return;
        var idx = 0;
        for (var j = 0; j < list.length; j++) {
            if (list[j] === document.activeElement) { idx = j + 1; break; }
        }
        applyFocus(list[idx % list.length]);
    }

    function goBack() {
        var m = document.getElementById('m3uModal');
        if (m && m.style.display !== 'none') {
            var c = document.getElementById('m3uCancel');
            if (c && c.click) c.click();
            return;
        }
        var dd = document.getElementById('dropdownMenu');
        if (dd && dd.style.display === 'block') { dd.style.display = 'none'; return; }

        var sp = document.getElementById('subPicker');
        if (sp) { sp.parentNode.removeChild(sp); return; }
        var sm = document.getElementById('subMenu');
        if (sm) { sm.parentNode.removeChild(sm); return; }

        var ch = document.getElementById('chSection');
        if (ch && ch.style.display === 'flex') {
            var b = document.getElementById('backToCats');
            if (b && b.click) b.click();
            return;
        }
    }

    function zap(delta) {
        if (typeof playItem !== 'function') return false;
        var list = window.currentChannels;
        var cur = window.currentStream;
        if (!list || !list.length || !cur) return false;
        var idx = -1;
        for (var i = 0; i < list.length; i++) {
            var ch = list[i];
            if (String(ch.stream_id || ch.series_id || '') === String(cur.id)) { idx = i; break; }
        }
        if (idx === -1) return false;
        var n = (idx + delta + list.length) % list.length;
        playItem(list[n]);
        return true;
    }

    function video() {
        return document.getElementById('videoPlayer');
    }

    function togglePlay() {
        var v = video();
        if (!v) return;
        if (v.paused) v.play(); else v.pause();
        if (typeof flashControls === 'function') flashControls();
    }

    function seek(delta) {
        var v = video();
        if (!v) return;
        v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
        if (typeof flashControls === 'function') flashControls();
    }

    function setVolume(delta) {
        var v = video();
        if (!v) return;
        v.volume = Math.max(0, Math.min(1, (v.volume || 0) + delta));
        v.muted = false;
        var slider = document.getElementById('volumeSlider');
        if (slider) slider.value = Math.round(v.volume * 100);
        if (typeof updateVolumeIcon === 'function') updateVolumeIcon();
        if (typeof flashControls === 'function') flashControls();
    }

    function toggleMute() {
        var v = video();
        if (!v) return;
        v.muted = !v.muted;
        if (typeof updateVolumeIcon === 'function') updateVolumeIcon();
    }

    function clickById(id) {
        var el = document.getElementById(id);
        if (el && typeof el.click === 'function') el.click();
    }

    function focusSearch() {
        var s = document.getElementById('searchInput');
        if (s) applyFocus(s);
    }

    function resetToMouse() {
        if (!remoteMode) return;
        remoteMode = false;
        clearFocusClass();
        focusEl = null;
        var ae = document.activeElement;
        if (ae && ae.tagName === 'INPUT' && ae.blur) ae.blur();
    }

    (function () {
        var st = document.createElement('style');
        st.type = 'text/css';
        st.textContent =
            '.nav-focus{outline:2px solid #e94560 !important;outline-offset:2px;box-shadow:0 0 0 3px rgba(233,69,96,0.25) !important;}' +
            'input.nav-focus{outline-color:#2196F3 !important;}';
        document.head.appendChild(st);
    })();

    function isRemoteKey(code) {
        return (code >= 37 && code <= 40) ||
            code === 13 || code === 10009 || code === 461 || code === 8 || code === 27 ||
            code === 33 || code === 34 ||
            code === 415 || code === 179 || code === 19 ||
            code === 412 || code === 417 ||
            code === 447 || code === 448 || code === 449 ||
            code === 403 || code === 404 || code === 405 || code === 406;
    }

    function onKey(e) {
        var code = e.keyCode || e.which;
        if (!isRemoteKey(code)) return;

        remoteMode = true;

        var ae = document.activeElement;
        var inInput = ae && ae.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);

        if (inInput) {
            if (code === 13 || code === 10009) {
                e.preventDefault();
                e.stopImmediatePropagation();
                nextInput();
                return;
            }
            if (code === 461 || code === 8 || code === 27) {
                e.preventDefault();
                e.stopImmediatePropagation();
                ae.blur();
                clearFocusClass();
                focusEl = null;
                return;
            }
            return;
        }

        switch (code) {
            case 37: e.preventDefault(); e.stopImmediatePropagation(); move('left'); break;
            case 38: e.preventDefault(); e.stopImmediatePropagation(); move('up'); break;
            case 39: e.preventDefault(); e.stopImmediatePropagation(); move('right'); break;
            case 40: e.preventDefault(); e.stopImmediatePropagation(); move('down'); break;
            case 13:
            case 10009: e.preventDefault(); e.stopImmediatePropagation(); activate(); break;
            case 461:
            case 8:
            case 27: e.preventDefault(); e.stopImmediatePropagation(); goBack(); break;
            case 33:
                if (zap(1)) { e.preventDefault(); e.stopImmediatePropagation(); }
                break;
            case 34:
                if (zap(-1)) { e.preventDefault(); e.stopImmediatePropagation(); }
                break;
            case 415:
            case 179:
            case 19: e.preventDefault(); e.stopImmediatePropagation(); togglePlay(); break;
            case 412: e.preventDefault(); e.stopImmediatePropagation(); seek(-10); break;
            case 417: e.preventDefault(); e.stopImmediatePropagation(); seek(10); break;
            case 447: e.preventDefault(); e.stopImmediatePropagation(); setVolume(0.1); break;
            case 448: e.preventDefault(); e.stopImmediatePropagation(); setVolume(-0.1); break;
            case 449: e.preventDefault(); e.stopImmediatePropagation(); toggleMute(); break;
            case 403: e.preventDefault(); e.stopImmediatePropagation(); clickById('themeBtn'); break;
            case 404: e.preventDefault(); e.stopImmediatePropagation(); clickById('favToggleBtn'); break;
            case 405: e.preventDefault(); e.stopImmediatePropagation(); break;
            case 406: e.preventDefault(); e.stopImmediatePropagation(); focusSearch(); break;
        }
    }

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousemove', resetToMouse, true);
    document.addEventListener('mousedown', resetToMouse, true);
    document.addEventListener('click', resetToMouse, true);
})();
