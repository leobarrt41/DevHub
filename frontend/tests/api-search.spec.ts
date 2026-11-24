import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../src/services/api';

afterEach(() => vi.restoreAllMocks());

describe('ApiClient.search', () => {
  it('encaminha os filtros à API e conserva archived=true como inclusão de todos', async () => {
    const response = { applications: [], folders: [], conversations: [], memory_items: [] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    const dateFrom = '2026-11-01T00:00:00.000Z';
    const dateTo = '2026-11-23T23:59:59.999Z';

    await new ApiClient('test-token').search('texto', {
      app_id: 'general',
      folder_id: 'folder-1',
      conversation_id: 'conversation-2',
      category: 'technical',
      date_from: dateFrom,
      date_to: dateTo,
      archived: true,
    });

    const requestUrl = new URL(String(fetchSpy.mock.calls[0][0]), 'http://localhost');
    expect(requestUrl.pathname).toBe('/api/v1/search');
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      q: 'texto',
      app_id: 'general',
      folder_id: 'folder-1',
      conversation_id: 'conversation-2',
      category: 'technical',
      date_from: dateFrom,
      date_to: dateTo,
      archived: 'true',
    });
  });

  it('mantém archived=false explícito sem adicionar um escopo app global', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ applications: [], folders: [], conversations: [], memory_items: [] }), { status: 200 }));

    await new ApiClient('test-token').search('texto', { archived: false });

    const requestUrl = new URL(String(fetchSpy.mock.calls[0][0]), 'http://localhost');
    expect(requestUrl.searchParams.get('app_id')).toBeNull();
    expect(requestUrl.searchParams.get('archived')).toBe('false');
  });
});
