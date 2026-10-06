/**
 * leaderboard.js - LocalStorage-based Persistent Leaderboard
 * Handles sanitized top-5 scores per mode with fallback to in-memory storage.
 */

const STORAGE_KEY = 'handCatch.leaderboard.v1';

class LeaderboardManager {
  constructor() {
    this.memoryStore = {
      NORMAL: [],
      ENDLESS: []
    };
    this.isStorageAvailable = this.checkStorage();
    this.data = this.load();
  }

  checkStorage() {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('LocalStorage not available; using in-memory leaderboard', e);
      return false;
    }
  }

  load() {
    if (!this.isStorageAvailable) {
      return this.memoryStore;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {
          NORMAL: [
            { name: 'ACE', score: 320, date: new Date().toISOString(), maxCombo: 8, caught: 24, mode: 'NORMAL' },
            { name: 'NEO', score: 240, date: new Date().toISOString(), maxCombo: 6, caught: 19, mode: 'NORMAL' },
            { name: 'CYBER', score: 180, date: new Date().toISOString(), maxCombo: 5, caught: 15, mode: 'NORMAL' }
          ],
          ENDLESS: [
            { name: 'TITAN', score: 680, date: new Date().toISOString(), maxCombo: 14, caught: 48, mode: 'ENDLESS' },
            { name: 'GHOST', score: 450, date: new Date().toISOString(), maxCombo: 10, caught: 33, mode: 'ENDLESS' },
            { name: 'VALKYRIE', score: 310, date: new Date().toISOString(), maxCombo: 7, caught: 25, mode: 'ENDLESS' }
          ]
        };
      }
      const parsed = JSON.parse(raw);
      return {
        NORMAL: Array.isArray(parsed.NORMAL) ? parsed.NORMAL : [],
        ENDLESS: Array.isArray(parsed.ENDLESS) ? parsed.ENDLESS : []
      };
    } catch (e) {
      console.error('Failed to parse leaderboard from localStorage:', e);
      return { NORMAL: [], ENDLESS: [] };
    }
  }

  save() {
    if (!this.isStorageAvailable) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('Failed to save leaderboard to localStorage:', e);
    }
  }

  sanitizeName(rawName) {
    if (!rawName || typeof rawName !== 'string') return 'PLAYER';
    // Trim, replace bad characters, max 12 characters
    const clean = rawName.trim().replace(/[<>'"&]/g, '').slice(0, 12);
    return clean || 'PLAYER';
  }

  /**
   * Adds an entry. Returns 1-based rank if in top 5, or null if not.
   */
  add({ name, score, maxCombo = 0, caught = 0, mode = 'NORMAL' }) {
    const validMode = mode === 'ENDLESS' ? 'ENDLESS' : 'NORMAL';
    const cleanName = this.sanitizeName(name);

    const entry = {
      name: cleanName,
      score: Math.max(0, Math.floor(score)),
      maxCombo: Math.max(0, Math.floor(maxCombo)),
      caught: Math.max(0, Math.floor(caught)),
      mode: validMode,
      date: new Date().toISOString()
    };

    if (!this.data[validMode]) {
      this.data[validMode] = [];
    }

    const list = this.data[validMode];
    list.push(entry);

    // Sort descending by score, tie-break by maxCombo, then caught
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.maxCombo !== a.maxCombo) return b.maxCombo - a.maxCombo;
      return b.caught - a.caught;
    });

    // Find rank of new entry
    const index = list.indexOf(entry);
    
    // Keep top 10 in storage
    this.data[validMode] = list.slice(0, 10);
    this.save();

    if (index >= 0 && index < 5) {
      return index + 1; // 1-based rank
    }
    return null;
  }

  getTop(mode = 'NORMAL', limit = 5) {
    const validMode = mode === 'ENDLESS' ? 'ENDLESS' : 'NORMAL';
    const list = this.data[validMode] || [];
    return list.slice(0, limit);
  }

  isHighScore(score, mode = 'NORMAL') {
    const top = this.getTop(mode, 5);
    if (top.length < 5) return score > 0;
    return score > top[top.length - 1].score;
  }

  clear(mode = null) {
    if (mode) {
      const validMode = mode === 'ENDLESS' ? 'ENDLESS' : 'NORMAL';
      this.data[validMode] = [];
    } else {
      this.data = { NORMAL: [], ENDLESS: [] };
    }
    this.save();
  }
}

export const leaderboard = new LeaderboardManager();
