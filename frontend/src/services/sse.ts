export interface SSEEvent {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export type SSEEventHandler = (event: SSEEvent) => void;

export function createSSEParser(onEvent: SSEEventHandler) {
  let pending = '';
  let eventName = '';
  let dataLines: string[] = [];
  let lastEventId: string | undefined;
  let retry: number | undefined;

  const dispatch = () => {
    if (dataLines.length > 0) {
      onEvent({
        event: eventName || 'message',
        data: dataLines.join('\n'),
        ...(lastEventId !== undefined ? { id: lastEventId } : {}),
        ...(retry !== undefined ? { retry } : {}),
      });
    }
    eventName = '';
    dataLines = [];
    retry = undefined;
  };

  const consumeLine = (line: string) => {
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) return;

    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    switch (field) {
      case 'event':
        eventName = value;
        break;
      case 'data':
        dataLines.push(value);
        break;
      case 'id':
        if (!value.includes('\0')) lastEventId = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value)) retry = Number(value);
        break;
    }
  };

  return {
    push(chunk: string) {
      pending += chunk;
      let lineBreak = pending.indexOf('\n');
      while (lineBreak !== -1) {
        let line = pending.slice(0, lineBreak);
        pending = pending.slice(lineBreak + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        consumeLine(line);
        lineBreak = pending.indexOf('\n');
      }
    },
    finish() {
      if (pending.length > 0) {
        let line = pending;
        pending = '';
        if (line.endsWith('\r')) line = line.slice(0, -1);
        consumeLine(line);
      }
      dispatch();
    },
  };
}

export async function consumeSSEStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: SSEEventHandler,
  signal?: AbortSignal,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  const parser = createSSEParser(onEvent);

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel(signal.reason).catch(() => undefined);
        throw signal.reason ?? new DOMException('Operação cancelada', 'AbortError');
      }
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.finish();
  } finally {
    reader.releaseLock();
  }
}

export function parseEventJson<T>(event: SSEEvent): T {
  try {
    return JSON.parse(event.data) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'JSON inválido';
    throw new Error(`Evento SSE “${event.event}” contém dados inválidos: ${detail}`);
  }
}
