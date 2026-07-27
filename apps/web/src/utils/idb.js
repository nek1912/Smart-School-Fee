const DB_NAME = 'payment-queue';
const STORE_NAME = 'payments';

export const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'idempotency_key' });
      }
    };
  });
};

export const addPaymentToQueue = async (payment) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(payment);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};

export const getQueuedPayments = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deletePaymentFromQueue = async (idempotencyKey) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(idempotencyKey);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};

export const updatePaymentInQueue = async (idempotencyKey, patch) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(idempotencyKey);
    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) return resolve(false);
      const putRequest = store.put({ ...existing, ...patch, updated_at: new Date().toISOString() });
      putRequest.onsuccess = () => resolve(true);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

export const clearSyncedPayments = async () => {
  const payments = await getQueuedPayments();
  await Promise.all(payments.filter(p => p.local_status === 'synced').map(p => deletePaymentFromQueue(p.idempotency_key)));
};
