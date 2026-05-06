/**
 * Safe storage utilities that work in incognito/private mode
 */

interface StorageConfig {
  enabled: boolean;
  reason?: string;
}

/**
 * Check if storage is available (not in private/incognito mode)
 */
function checkStorageAvailable(storageType: "localStorage" | "sessionStorage"): boolean {
  try {
    const storage = storageType === "localStorage" ? localStorage : sessionStorage;
    const testKey = "__storage_test__";
    storage.setItem(testKey, "test");
    storage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

let _storageConfig: StorageConfig | null = null;

function getStorageConfig(): StorageConfig {
  if (_storageConfig !== null) return _storageConfig;

  const localStorageAvailable = checkStorageAvailable("localStorage");
  const sessionStorageAvailable = checkStorageAvailable("sessionStorage");

  _storageConfig = {
    enabled: localStorageAvailable || sessionStorageAvailable,
    reason: !localStorageAvailable && !sessionStorageAvailable 
      ? "Private/Incognito mode or quota exceeded" 
      : undefined,
  };

  return _storageConfig;
}

/**
 * Safely get item from storage (works in incognito mode)
 */
export function safeStorageGetItem(key: string, storageType: "localStorage" | "sessionStorage" = "sessionStorage"): string | null {
  try {
    const config = getStorageConfig();
    if (!config.enabled) return null;

    const storage = storageType === "localStorage" ? localStorage : sessionStorage;
    return storage.getItem(key);
  } catch (error) {
    console.warn(`Failed to get from ${storageType}:`, error);
    return null;
  }
}

/**
 * Safely set item in storage (fails gracefully in incognito mode)
 */
export function safeStorageSetItem(
  key: string,
  value: string,
  storageType: "localStorage" | "sessionStorage" = "sessionStorage"
): boolean {
  try {
    const config = getStorageConfig();
    if (!config.enabled) {
      // Silently fail in incognito mode - don't break the app
      return false;
    }

    const storage = storageType === "localStorage" ? localStorage : sessionStorage;
    storage.setItem(key, value);
    return true;
  } catch (error) {
    // QuotaExceededError, SecurityError, etc. in incognito mode
    console.warn(`Failed to set in ${storageType}:`, error);
    return false;
  }
}

/**
 * Safely remove item from storage
 */
export function safeStorageRemoveItem(
  key: string,
  storageType: "localStorage" | "sessionStorage" = "sessionStorage"
): void {
  try {
    const config = getStorageConfig();
    if (!config.enabled) return;

    const storage = storageType === "localStorage" ? localStorage : sessionStorage;
    storage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove from ${storageType}:`, error);
  }
}

/**
 * Get storage availability status
 */
export function isStorageAvailable(): boolean {
  return getStorageConfig().enabled;
}

/**
 * Safely parse and get JSON from storage
 */
export function safeStorageGetJSON<T = any>(
  key: string,
  storageType: "localStorage" | "sessionStorage" = "sessionStorage"
): T | null {
  try {
    const item = safeStorageGetItem(key, storageType);
    if (!item) return null;
    return JSON.parse(item) as T;
  } catch (error) {
    console.warn(`Failed to parse JSON from ${storageType}:`, error);
    return null;
  }
}

/**
 * Safely set JSON in storage
 */
export function safeStorageSetJSON<T = any>(
  key: string,
  value: T,
  storageType: "localStorage" | "sessionStorage" = "sessionStorage"
): boolean {
  try {
    return safeStorageSetItem(key, JSON.stringify(value), storageType);
  } catch (error) {
    console.warn(`Failed to stringify JSON for ${storageType}:`, error);
    return false;
  }
}
