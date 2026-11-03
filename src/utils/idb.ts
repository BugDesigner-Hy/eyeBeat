const DB_NAME = 'himusic'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

export const idbGet = <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)).catch(() => undefined)
export const idbSet = (key: string, value: unknown) => run<void>('readwrite', (s) => s.put(value, key)).catch(() => {})
export const idbClear = () => run<void>('readwrite', (s) => s.clear()).catch(() => {})
