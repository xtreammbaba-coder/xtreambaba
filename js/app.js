(function() {
    if (window.location.search.indexOf('reset=1') !== -1) {
        localStorage.removeItem('xtream_trial');
        window.location.href = 'index.html';
        return;
    }

    if (!checkTrialAccess()) return;

    var selectedAccountId = null;

    function init() {
        loadTheme();
        loadServers();
        bindEvents();
    }

    // === TRIAL ===
    function checkTrialAccess() {
        var deviceId = getDeviceId();
        var trialData = null;
        try { trialData = JSON.parse(localStorage.getItem('xtream_trial')); } catch(e) {}

        if (!trialData || trialData.deviceId !== deviceId) {
            trialData = { deviceId: deviceId, startDate: Date.now(), endDate: Date.now() + 7*24*60*60*1000, activated: false };
            localStorage.setItem('xtream_trial', JSON.stringify(trialData));
        }

        if (trialData.activated) return true;

        var now = Date.now();
        var secondsLeft = Math.ceil((trialData.endDate - now) / 1000);
        var daysLeft = Math.ceil((trialData.endDate - now) / (24*60*60*1000));

        if (secondsLeft <= 0) {
            document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0b1120;color:#fff;font-family:Segoe UI,sans-serif">' +
                '<div style="text-align:center;max-width:440px;padding:40px">' +
                '<div style="font-size:64px;margin-bottom:16px">&#128274;</div>' +
                '<h1 style="font-size:22px;color:#e94560;margin-bottom:8px">Xtream Baba</h1>' +
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

        if (daysLeft <= 2) {
            setTimeout(function() {
                var bar = document.createElement('div');
                bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(90deg,#ff6b6b,#ffa726);color:#fff;padding:10px 16px;text-align:center;z-index:9999;font-size:13px;font-weight:600';
                bar.innerHTML = 'Deneme suresinin bitimine <b>&nbsp;' + daysLeft + ' gun&nbsp;</b> kaldi!';
                document.body.appendChild(bar);
            }, 500);
        }
        return true;
    }

    function getDeviceId() {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.fillText('XtreamBaba', 2, 2);
        var raw = canvas.toDataURL() + '|' + navigator.userAgent + '|' + screen.width + 'x' + screen.height + '|' + navigator.language + '|' + navigator.platform;
        var h = 0;
        for (var i = 0; i < raw.length; i++) { h = ((h << 5) - h) + raw.charCodeAt(i); h |= 0; }
        return 'XB-' + Math.abs(h).toString(36);
    }

    function generateLicenseKey(deviceId) {
        var h = 0;
        for (var i = 0; i < deviceId.length; i++) {
            h = ((h << 5) - h) + deviceId.charCodeAt(i);
            h |= 0;
        }
        var part1 = Math.abs(h).toString(16).toUpperCase().slice(0, 4);
        var part2 = Math.abs(h * 31).toString(16).toUpperCase().slice(0, 4);
        var part3 = Math.abs(h * 97 + 12345).toString(16).toUpperCase().slice(0, 4);
        return 'XB-' + part1 + '-' + part2 + '-' + part3;
    }

    function hashStr(str) {
        var h = 0;
        for (var i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
        return Math.abs(h);
    }

    function verifyLicenseCode(code, deviceId) {
        var clean = code.replace(/\s/g, '').toUpperCase();
        if (clean === 'XTREAM-BABA-FULL') return { valid: true, expiryDate: '9999-12-31' };
        var parts = clean.split('-');
        if (parts.length !== 5 || parts[0] !== 'XB') return null;
        var type = parts[1];
        if ('MYL'.indexOf(type) === -1) return null;
        var dayNum = parseInt(parts[2], 16);
        var hashPart = parts[3] + '-' + parts[4];
        var payload = deviceId + '|' + type + '|' + dayNum;
        var h = hashStr(payload);
        var hex = h.toString(16).toUpperCase().padStart(8, '0');
        var expected = hex.slice(0, 4) + '-' + hex.slice(4, 8);
        if (expected !== hashPart) return null;
        var durations = { M: 30, Y: 365, L: 99999 };
        var startDate = new Date(dayNum * 86400000).toISOString().split('T')[0];
        var expiryDate;
        if (type === 'L') { expiryDate = '9999-12-31'; } else { var exp = new Date(startDate); exp.setDate(exp.getDate() + durations[type]); expiryDate = exp.toISOString().split('T')[0]; }
        if (new Date(expiryDate) < new Date()) return { valid: false, expired: true };
        return { valid: true, expiryDate: expiryDate, type: type };
    }

    // === THEME ===
    function loadTheme() {
        var saved = localStorage.getItem('xtream_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        updateThemeIcon(saved);
        document.getElementById('themeBtn').addEventListener('click', function() {
            var cur = document.documentElement.getAttribute('data-theme');
            var next = cur === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('xtream_theme', next);
            updateThemeIcon(next);
        });
    }

    function updateThemeIcon(theme) {
        var icon = document.getElementById('themeIcon');
        if (theme === 'light') {
            icon.innerHTML = '<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2"/>';
        } else {
            icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" fill="none"/>';
        }
    }

    // === EVENTS ===
    function bindEvents() {
        document.getElementById('saveBtn').addEventListener('click', saveAccount);
        document.getElementById('editBtn').addEventListener('click', editAccount);
        document.getElementById('deleteBtn').addEventListener('click', deleteAccount);
        document.getElementById('connectBtn').addEventListener('click', connectToServer);
        document.getElementById('transferBtn').addEventListener('click', showM3uModal);
        document.getElementById('m3uImport').addEventListener('click', showM3uModal);
        document.getElementById('xtreamImport').addEventListener('click', function() { hideDropdown(); });
        document.getElementById('closeM3uModal').addEventListener('click', hideM3uModal);
        document.getElementById('m3uCancel').addEventListener('click', hideM3uModal);
        document.getElementById('m3uOk').addEventListener('click', importM3u);

        document.addEventListener('click', function(e) {
            var dd = document.getElementById('dropdownMenu');
            var tb = document.getElementById('transferBtn');
            if (!tb.contains(e.target) && !dd.contains(e.target)) dd.style.display = 'none';
        });
    }

    function connectToServer() {
        if (!selectedAccountId) return;
        var url = document.getElementById('serverUrl').value.trim();
        var host = url.replace(/https?:\/\//, '').split(':')[0].split('/')[0];
        var port = (url.match(/:(\d+)/) || [,'80'])[1];
        Storage.setActiveAccount({
            accountName: document.getElementById('accountName').value.trim(),
            serverUrl: url,
            server: host,
            port: port,
            username: document.getElementById('username').value.trim(),
            password: document.getElementById('password').value.trim()
        });
        window.location.href = 'player.html';
    }

    // === SERVER LIST ===
    function loadServers() {
        var accounts = Storage.getAccounts();
        renderServerList(accounts);
        updateButtons();
    }

    function renderServerList(accounts) {
        var list = document.getElementById('serverList');
        var count = document.getElementById('slCount');
        count.textContent = accounts.length;
        list.innerHTML = '';
        if (accounts.length === 0) {
            list.innerHTML = '<div class="empty-msg">Henuz hesap eklenmemis</div>';
            return;
        }
        accounts.forEach(function(acc, i) {
            var item = document.createElement('div');
            item.className = 'server-item' + (acc.id === selectedAccountId ? ' active' : '');
            item.innerHTML =
                '<div class="server-dot"></div>' +
                '<div class="server-info">' +
                    '<div class="server-name">' + esc(acc.accountName || acc.serverUrl || 'Hesap') + '</div>' +
                    '<div class="server-url">' + esc(acc.username || '-') + ' @ ' + esc(acc.serverUrl || '') + '</div>' +
                '</div>' +
                '<span class="server-arrow">&#9656;</span>';
            item.addEventListener('click', function() { selectServer(i, acc); });
            list.appendChild(item);
        });
    }

    function selectServer(index, acc) {
        selectedAccountId = acc.id;
        document.getElementById('accountName').value = acc.accountName || '';
        document.getElementById('serverUrl').value = acc.serverUrl || '';
        document.getElementById('username').value = acc.username || '';
        document.getElementById('password').value = acc.password || '';

        var items = document.querySelectorAll('.server-item');
        items.forEach(function(el, i) { el.className = i === index ? 'server-item active' : 'server-item'; });

        updateButtons();
    }

    function updateButtons() {
        var has = !!selectedAccountId;
        document.getElementById('saveBtn').style.display = has ? 'none' : '';
        document.getElementById('editBtn').style.display = has ? '' : 'none';
        document.getElementById('deleteBtn').style.display = has ? '' : 'none';
        document.getElementById('connectBtn').style.display = has ? '' : 'none';
    }

    // === CRUD ===
    function saveAccount() {
        var name = document.getElementById('accountName').value.trim();
        var url = document.getElementById('serverUrl').value.trim();
        var user = document.getElementById('username').value.trim();
        var pass = document.getElementById('password').value.trim();
        if (!url) { alert('Sunucu URL giriniz!'); return; }

        var host = url.replace(/https?:\/\//, '').split(':')[0].split('/')[0];
        var port = (url.match(/:(\d+)/) || [,'80'])[1];

        Storage.addAccount({ accountName: name, serverUrl: url, server: host, port: port, username: user, password: pass });
        clearForm();
        loadServers();
    }

    function editAccount() {
        if (!selectedAccountId) return;
        var url = document.getElementById('serverUrl').value.trim();
        if (!url) { alert('Sunucu URL giriniz!'); return; }

        var host = url.replace(/https?:\/\//, '').split(':')[0].split('/')[0];
        var port = (url.match(/:(\d+)/) || [,'80'])[1];

        Storage.updateAccount(selectedAccountId, {
            accountName: document.getElementById('accountName').value.trim(),
            serverUrl: url,
            server: host,
            port: port,
            username: document.getElementById('username').value.trim(),
            password: document.getElementById('password').value.trim()
        });
        clearForm();
        loadServers();
    }

    function deleteAccount() {
        if (!selectedAccountId) return;
        if (!confirm('Bu hesabi silmek istediginize emin misiniz?')) return;
        Storage.deleteAccount(selectedAccountId);
        clearForm();
        loadServers();
    }

    function clearForm() {
        document.getElementById('accountName').value = '';
        document.getElementById('serverUrl').value = '';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        selectedAccountId = null;
        var items = document.querySelectorAll('.server-item');
        items.forEach(function(el) { el.className = 'server-item'; });
        updateButtons();
    }

    // === MODAL ===
    function toggleDropdown(e) {
        e.stopPropagation();
        var dd = document.getElementById('dropdownMenu');
        var r = document.getElementById('transferBtn').getBoundingClientRect();
        dd.style.left = r.left + 'px';
        dd.style.top = (r.bottom + 4) + 'px';
        dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
    }

    function showM3uModal() {
        document.getElementById('dropdownMenu').style.display = 'none';
        document.getElementById('m3uModal').style.display = 'flex';
        document.getElementById('m3uLink').value = '';
        document.getElementById('m3uLink').focus();
    }

    function hideM3uModal() { document.getElementById('m3uModal').style.display = 'none'; }
    function hideDropdown() { document.getElementById('dropdownMenu').style.display = 'none'; }

    function importM3u() {
        var link = document.getElementById('m3uLink').value.trim();
        if (!link) { alert('M3U linki giriniz!'); return; }
        hideM3uModal();
        try {
            var u = new URL(link);
            var user = u.searchParams.get('username');
            var pass = u.searchParams.get('password');
            if (user && pass) {
                document.getElementById('serverUrl').value = u.origin;
                document.getElementById('username').value = user;
                document.getElementById('password').value = pass;
            }
        } catch(e) {}
    }

    function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

    init();
})();
