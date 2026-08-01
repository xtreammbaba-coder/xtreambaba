var Storage = {
    save: function(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Storage save error:', e);
            return false;
        }
    },

    load: function(key) {
        try {
            var data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Storage load error:', e);
            return null;
        }
    },

    remove: function(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.error('Storage remove error:', e);
            return false;
        }
    },

    getAccounts: function() {
        return this.load('xtream_accounts') || [];
    },

    saveAccounts: function(accounts) {
        return this.save('xtream_accounts', accounts);
    },

    addAccount: function(account) {
        var accounts = this.getAccounts();
        account.id = Date.now();
        account.createdAt = new Date().toISOString();
        accounts.push(account);
        this.saveAccounts(accounts);
        return account;
    },

    updateAccount: function(id, data) {
        var accounts = this.getAccounts();
        for (var i = 0; i < accounts.length; i++) {
            if (accounts[i].id === id) {
                accounts[i] = Object.assign(accounts[i], data);
                this.saveAccounts(accounts);
                return accounts[i];
            }
        }
        return null;
    },

    deleteAccount: function(id) {
        var accounts = this.getAccounts();
        accounts = accounts.filter(function(a) { return a.id !== id; });
        this.saveAccounts(accounts);
    },

    getActiveAccount: function() {
        return this.load('xtream_active_account');
    },

    setActiveAccount: function(account) {
        return this.save('xtream_active_account', account);
    },

    clearActiveAccount: function() {
        return this.remove('xtream_active_account');
    },

    _accountKey: function(name) {
        return 'xtream_' + (name || 'default');
    },

    getFavorites: function(accountName) {
        var data = this.load(this._accountKey(accountName) + '_favorites');
        return data || { live: {}, movies: {}, series: {} };
    },

    saveFavorites: function(accountName, favs) {
        return this.save(this._accountKey(accountName) + '_favorites', favs);
    },

    toggleFavorite: function(accountName, type, id) {
        var favs = this.getFavorites(accountName);
        if (!favs[type]) favs[type] = {};
        if (favs[type][id]) {
            delete favs[type][id];
        } else {
            favs[type][id] = true;
        }
        this.saveFavorites(accountName, favs);
        return !!favs[type][id];
    },

    isFavorite: function(accountName, type, id) {
        var favs = this.getFavorites(accountName);
        return favs[type] && favs[type][id];
    },

    getWatchHistory: function(accountName) {
        return this.load(this._accountKey(accountName) + '_watch_history') || {};
    },

    saveWatchHistory: function(accountName, history) {
        return this.save(this._accountKey(accountName) + '_watch_history', history);
    },

    updateWatchPosition: function(accountName, streamId, position, duration) {
        var history = this.getWatchHistory(accountName);
        if (!history[streamId]) {
            history[streamId] = {};
        }
        history[streamId].position = position;
        history[streamId].duration = duration;
        history[streamId].updatedAt = Date.now();
        this.saveWatchHistory(accountName, history);
    },

    getWatchPosition: function(accountName, streamId) {
        var history = this.getWatchHistory(accountName);
        if (history[streamId]) {
            return history[streamId].position || 0;
        }
        return 0;
    },

    clearOldHistory: function(accountName, maxAge) {
        maxAge = maxAge || 30 * 24 * 60 * 60 * 1000;
        var history = this.getWatchHistory(accountName);
        var now = Date.now();
        var changed = false;
        Object.keys(history).forEach(function(key) {
            if (now - history[key].updatedAt > maxAge) {
                delete history[key];
                changed = true;
            }
        });
        if (changed) {
            this.saveWatchHistory(accountName, history);
        }
    }
};
