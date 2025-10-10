/**
 * IndexedDB-based storage layer for 3D heatmap frames
 * Enables streaming processing for large-scale simulations (50×50×50+)
 * without exceeding browser memory limits
 */

const DB_NAME = 'HeatmapFrameDB';
const DB_VERSION = 1;
const STORE_NAME = 'frames';

class FrameStorage {
  constructor() {
    this.db = null;
    this.sessionId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Initialize IndexedDB connection
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          objectStore.createIndex('sessionId', 'sessionId', { unique: false });
          objectStore.createIndex('frameIndex', 'frameIndex', { unique: false });
        }
      };
    });
  }

  /**
   * Store a single frame to IndexedDB
   * @param {number} frameIndex - Frame index (0-based)
   * @param {Float32Array} grid - Grid data
   * @param {number} tVal - T-axis value for this frame
   * @returns {Promise<void>}
   */
  async storeFrame(frameIndex, grid, tVal) {
    if (!this.db) {
      throw new Error('FrameStorage not initialized');
    }

    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);

    const frameData = {
      id: `${this.sessionId}_${frameIndex}`,
      sessionId: this.sessionId,
      frameIndex,
      grid: grid, // Float32Array is stored directly
      tVal,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const request = objectStore.put(frameData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to store frame ${frameIndex}`));
    });
  }

  /**
   * Retrieve a single frame from IndexedDB
   * @param {number} frameIndex - Frame index to retrieve
   * @returns {Promise<{grid: Float32Array, tVal: number}>}
   */
  async getFrame(frameIndex) {
    if (!this.db) {
      throw new Error('FrameStorage not initialized');
    }

    const transaction = this.db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = objectStore.get(`${this.sessionId}_${frameIndex}`);

      request.onsuccess = () => {
        if (request.result) {
          resolve({
            grid: request.result.grid,
            tVal: request.result.tVal
          });
        } else {
          reject(new Error(`Frame ${frameIndex} not found`));
        }
      };

      request.onerror = () => reject(new Error(`Failed to retrieve frame ${frameIndex}`));
    });
  }

  /**
   * Get all frames in order (returns an async iterator)
   * @param {number} totalFrames - Total number of frames expected
   * @returns {AsyncGenerator<{grid: Float32Array, tVal: number, index: number}>}
   */
  async *getAllFrames(totalFrames) {
    for (let i = 0; i < totalFrames; i++) {
      const frame = await this.getFrame(i);
      yield { ...frame, index: i };
    }
  }

  /**
   * Compute global min/max across all frames without loading all into memory
   * @param {number} totalFrames - Total number of frames
   * @returns {Promise<{globalMin: number, globalMax: number}>}
   */
  async computeGlobalRange(totalFrames) {
    let globalMin = +Infinity;
    let globalMax = -Infinity;

    for (let i = 0; i < totalFrames; i++) {
      const { grid } = await this.getFrame(i);

      for (const v of grid) {
        if (!Number.isFinite(v)) continue;
        if (v < globalMin) globalMin = v;
        if (v > globalMax) globalMax = v;
      }

      // Explicitly null out grid to help GC
      grid.fill(0);
    }

    if (!Number.isFinite(globalMin) || !Number.isFinite(globalMax) || globalMax === globalMin) {
      return { globalMin: 0, globalMax: 1 };
    }

    return { globalMin, globalMax };
  }

  /**
   * Clear all frames for the current session
   * @returns {Promise<void>}
   */
  async clearSession() {
    if (!this.db) return;

    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const index = objectStore.index('sessionId');

    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.only(this.sessionId));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(new Error('Failed to clear session'));
    });
  }

  /**
   * Clear old sessions (older than 1 hour)
   * @returns {Promise<void>}
   */
  async clearOldSessions() {
    if (!this.db) return;

    const cutoffTime = Date.now() - (60 * 60 * 1000); // 1 hour ago
    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = objectStore.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.timestamp < cutoffTime) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(new Error('Failed to clear old sessions'));
    });
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export { FrameStorage };
