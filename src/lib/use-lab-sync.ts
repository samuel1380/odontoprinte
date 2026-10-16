"use client";

import { useEffect, useRef } from "react";
import { OdontoPrintService } from "@/services/odontoprint-service";

/**
 * Mantém a tela sincronizada com os outros aparelhos: assina o Realtime
 * e recarrega (com debounce) a cada mudança; de reserva, recarrega tudo
 * a cada 60s caso o websocket caia. Sem isso, cada aparelho só vê o que
 * carregou ao abrir a página.
 */
export function useLabSync(reload: () => void | Promise<void>, enabled = true) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const kick = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const r = reloadRef.current();
          if (r && typeof (r as Promise<void>).catch === "function") {
            (r as Promise<void>).catch(() => {});
          }
        } catch {
          // ignora
        }
      }, 800);
    };
    const unsub = OdontoPrintService.subscribeSync(kick);
    const backup = setInterval(kick, 60000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(backup);
      if (unsub) unsub();
    };
  }, [enabled]);
}
