/**
 * Armazenamento de malhas 3D (STL) no navegador via IndexedDB.
 * Permite transferir mesas montadas e modelos de dezenas de MB entre telas
 * (/montagem -> /suportes) sem o limite de 5MB do sessionStorage.
 */

const DB_NAME = "odontoprint_mesh_db";
const STORE_NAME = "pending_meshes";
const KEY_NAME = "active_mesh";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB não disponível neste ambiente."));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Erro ao abrir banco de dados local."));
  });
}

export async function savePendingMesh(buffer: ArrayBuffer, fileName: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ buffer, fileName, timestamp: Date.now() }, KEY_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error("Erro ao salvar arquivo localmente."));
    });
  } catch (err) {
    // Fallback gracioso para sessionStorage para arquivos muito pequenos (<3MB)
    try {
      if (buffer.byteLength < 3 * 1024 * 1024) {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
        }
        sessionStorage.setItem("odontoprint_pending_supports_mesh", btoa(binary));
        sessionStorage.setItem("odontoprint_pending_supports_name", fileName);
      }
    } catch {
      // ignora se falhar
    }
  }
}

export async function getPendingMesh(): Promise<{ buffer: ArrayBuffer; fileName: string } | null> {
  try {
    const db = await openDb();
    const data = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Erro ao ler arquivo do banco local."));
    });

    if (data && data.buffer) {
      // Limpa após leitura para liberar memória do navegador
      await clearPendingMesh();
      return { buffer: data.buffer, fileName: data.fileName || "mesa-montada.stl" };
    }
  } catch {
    // Fallback para sessionStorage
  }

  // Tenta ler de sessionStorage se não estava no IndexedDB
  try {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("odontoprint_pending_supports_mesh");
      const storedName = sessionStorage.getItem("odontoprint_pending_supports_name");
      if (stored) {
        sessionStorage.removeItem("odontoprint_pending_supports_mesh");
        sessionStorage.removeItem("odontoprint_pending_supports_name");
        const binaryString = atob(stored);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return {
          buffer: bytes.buffer,
          fileName: storedName || "mesa-montada.stl",
        };
      }
    }
  } catch {
    // ignora
  }

  return null;
}

export async function clearPendingMesh(): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(KEY_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // não bloqueia fluxo
    });
  } catch {
    // ignora
  }
}
