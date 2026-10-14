import { useEffect, useRef, useState } from "react";
import { insforge } from "@/lib/insforgeClient";

/** Canal del tablero de un negocio (ver migración 20261015090000_board-realtime.sql). */
export function boardChannel(organizationId: string): string {
  return `walk_ins:${organizationId}`;
}

const EVENT = "board_changed";
// Un pedido por QR toca varias filas seguidas (llegada, ticket, reserva): un solo refresco.
const COALESCE_MS = 150;

/**
 * Tablero en tiempo real: avisa (onChange) apenas cambia una atención o una
 * reserva del negocio. Devuelve si la conexión está viva; si no lo está, la
 * página sigue con su consulta periódica como respaldo.
 */
export function useBoardRealtime(organizationId: string | null | undefined, onChange: () => void): boolean {
  const [live, setLive] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const realtime = insforge.realtime;
    if (!organizationId || !realtime) return;
    const channel = boardChannel(organizationId);
    let cancelled = false;
    let connectedBefore = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), COALESCE_MS);
    };
    const onEvent = (message: { meta?: { channel?: string } } | undefined) => {
      if (!message?.meta?.channel || message.meta.channel === channel) fire();
    };
    const onConnect = () => {
      if (cancelled) return;
      // La primera conexión la maneja connect() de abajo; en una reconexión
      // refrescamos por lo que pasó mientras tanto.
      if (!connectedBefore) {
        connectedBefore = true;
        return;
      }
      void realtime.subscribe(channel).then((response) => {
        if (!cancelled) setLive(response.ok);
      });
      fire();
    };
    const onDisconnect = () => setLive(false);

    realtime.on(EVENT, onEvent);
    realtime.on("connect", onConnect);
    realtime.on("disconnect", onDisconnect);

    realtime
      .connect()
      .then(() => realtime.subscribe(channel))
      .then((response) => {
        if (!cancelled) setLive(response.ok);
      })
      .catch(() => {
        if (!cancelled) setLive(false);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      realtime.off(EVENT, onEvent);
      realtime.off("connect", onConnect);
      realtime.off("disconnect", onDisconnect);
      realtime.unsubscribe(channel);
      if (realtime.getSubscribedChannels().length === 0) realtime.disconnect();
      setLive(false);
    };
  }, [organizationId]);

  return live;
}
