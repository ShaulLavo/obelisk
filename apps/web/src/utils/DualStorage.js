class DualStorage {
    getUniqueKeys() {
        const sessionLength = sessionStorage.length;
        const localLength = localStorage.length;
        const keys = [];
        const seen = new Set();
        for (let i = 0; i < sessionLength; i++) {
            const key = sessionStorage.key(i);
            if (key && !seen.has(key)) {
                keys.push(key);
                seen.add(key);
            }
        }
        for (let i = 0; i < localLength; i++) {
            const key = localStorage.key(i);
            if (key && !seen.has(key)) {
                keys.push(key);
                seen.add(key);
            }
        }
        return keys;
    }
    get length() {
        return this.getUniqueKeys().length;
    }
    clear() {
        sessionStorage.clear();
        localStorage.clear();
    }
    getItem(key) {
        return sessionStorage.getItem(key) ?? localStorage.getItem(key);
    }
    key(index) {
        const keys = this.getUniqueKeys();
        return keys[index] ?? null;
    }
    removeItem(key) {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
    }
    setItem(key, value) {
        sessionStorage.setItem(key, value);
        localStorage.setItem(key, value);
    }
}
export const dualStorage = new DualStorage();
