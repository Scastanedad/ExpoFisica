/**
 * Pone el título de la pestaña mientras la página está montada y restaura el
 * anterior al salir (cada estación tiene su propio título, útil para lectores
 * de pantalla y para quien tiene varias pestañas abiertas).
 */
import { useEffect } from "react";

export function useTituloDocumento(titulo: string): void {
  useEffect(() => {
    const anterior = document.title;
    document.title = titulo;
    return () => {
      document.title = anterior;
    };
  }, [titulo]);
}
