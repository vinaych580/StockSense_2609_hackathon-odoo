import { EventEmitter } from 'node:events';

/** "This changed" notice for SSE clients; they refetch from REST. Carries no private data. */
export interface DataChangedEvent {
  type: 'data.changed';
  entities: Array<'operation' | 'stock' | 'masterdata'>;
  operationId?: string;
  version?: number;
  productIds?: string[];
  warehouseIds?: string[];
  actorName?: string;
}

export interface SessionUpdatedEvent {
  type: 'session.updated';
  userId: string;
}

export type AppEvent = DataChangedEvent | SessionUpdatedEvent;

/** In-process bus: one Node process, so this is the whole message bus. The SSE route subscribes to 'event'. */
export const bus = new EventEmitter();
bus.setMaxListeners(1000);

export function publish(event: AppEvent): void {
  bus.emit('event', event);
}
