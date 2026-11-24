import { describe, expect, it } from 'vitest';
import { formatCost } from '../src/services/api';
import { consumeSSEStream, parseEventJson, type SSEEvent } from '../src/services/sse';

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
  });
}

describe('SSE parser', () => {
  it('reconstrói eventos quando linhas e eventos estão divididos entre chunks', async () => {
    const bytes = new TextEncoder().encode('event: task\r\ndata: {"task_id":"t-1"}\r\n\r\nevent: delta\ndata: parte um\ndata: parte dois\n\n');
    const chunks = [bytes.slice(0, 4), bytes.slice(4, 17), bytes.slice(17, 41), bytes.slice(41, 59), bytes.slice(59)];
    const events: SSEEvent[] = [];

    await consumeSSEStream(streamFromChunks(chunks), (event) => events.push(event));

    expect(events).toEqual([
      { event: 'task', data: '{"task_id":"t-1"}' },
      { event: 'delta', data: 'parte um\nparte dois' },
    ]);
  });

  it('preserva caracteres multibyte quando um caractere UTF-8 é cortado entre chunks', async () => {
    const bytes = new TextEncoder().encode('event: delta\ndata: Olá, cérebro 🧠 — memória\n\n');
    const brainStart = new TextEncoder().encode('event: delta\ndata: Olá, cérebro ').length;
    const events: SSEEvent[] = [];

    await consumeSSEStream(
      streamFromChunks([bytes.slice(0, brainStart + 2), bytes.slice(brainStart + 2, brainStart + 5), bytes.slice(brainStart + 5)]),
      (event) => events.push(event),
    );

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('Olá, cérebro 🧠 — memória');
  });

  it('decodifica o evento error e não transforma custos null em zero', async () => {
    const events: SSEEvent[] = [];
    const body = new TextEncoder().encode('event: error\ndata: {"task_id":"t-2","message":"Provedor indisponível","code":"provider_error"}\n\nevent: done\ndata: {"usage":{"cost_usd":null}}\n\n');
    await consumeSSEStream(streamFromChunks([body]), (event) => events.push(event));

    expect(parseEventJson<{ message: string; code: string }>(events[0])).toEqual({
      task_id: 't-2',
      message: 'Provedor indisponível',
      code: 'provider_error',
    });
    const completion = parseEventJson<{ usage: { cost_usd: string | null } }>(events[1]);
    expect(completion.usage.cost_usd).toBeNull();
    expect(formatCost(completion.usage.cost_usd)).toBe('Indisponível');
    expect(formatCost(null)).toBe('Indisponível');
    expect(formatCost(undefined)).toBe('Indisponível');
    expect(formatCost('0.0042')).toBe('US$ 0.0042');
  });

  it('falha claramente quando o payload JSON do evento está malformado', () => {
    expect(() => parseEventJson({ event: 'done', data: '{broken' })).toThrow('dados inválidos');
  });
});
