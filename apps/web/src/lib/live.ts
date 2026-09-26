/**
 * The live floor: one EventSource per tab. Every "data.changed" invalidates the caches it names, so
 * any open screen refetches without a reload. Screens that care who changed what listen for
 * `stocksense:changed` on window.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { meQueryKey } from '@/auth/AuthProvider';

export interface DataChanged {
  type: 'data.changed';
  entities: Array<'operation' | 'stock' | 'masterdata'>;
  operationId?: string;
  version?: number;
  productIds?: string[];
  warehouseIds?: string[];
  actorName?: string;
}

export type LiveState = 'connecting' | 'live' | 'offline';

export function useLiveEvents(enabled: boolean): LiveState {
  const qc = useQueryClient();
  const [state, setState] = useState<LiveState>('connecting');

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/v1/events', { withCredentials: true });
    let everLive = false;

    es.addEventListener('ready', () => {
      // A reconnect may have missed events: refetch whatever is on screen.
      if (everLive) void qc.invalidateQueries();
      everLive = true;
      setState('live');
    });
    es.addEventListener('data.changed', (msg) => {
      const e = JSON.parse((msg as MessageEvent<string>).data) as DataChanged;
      if (e.entities.includes('operation')) {
        void qc.invalidateQueries({ queryKey: ['operations'] });
        if (e.operationId) void qc.invalidateQueries({ queryKey: ['operation', e.operationId] });
      }
      if (e.entities.includes('stock')) {
        void qc.invalidateQueries({ queryKey: ['stock'] });
        void qc.invalidateQueries({ queryKey: ['moves'] });
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
      }
      if (e.entities.includes('masterdata')) {
        for (const key of ['stock', 'warehouses', 'locations', 'categories', 'partners', 'dashboard']) void qc.invalidateQueries({ queryKey: [key] });
      }
      window.dispatchEvent(new CustomEvent<DataChanged>('stocksense:changed', { detail: e }));
    });
    es.addEventListener('session.updated', () => void qc.invalidateQueries({ queryKey: meQueryKey }));
    es.addEventListener('session.ended', () => {
      es.close();
      void qc.invalidateQueries({ queryKey: meQueryKey });
    });
    es.onerror = () => setState(es.readyState === EventSource.CLOSED ? 'offline' : 'connecting');

    return () => es.close();
  }, [enabled, qc]);

  return state;
}
