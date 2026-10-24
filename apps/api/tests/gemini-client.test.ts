import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { GeminiClient } from '../src/llm/gemini-client.js';

describe('GeminiClient', () => {
  const testSchema = z.object({
    summary: z.string(),
    costMinor: z.number().int(),
  });

  it('successfully extracts functionCall from Gemini response and validates schema', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: 'test_tool',
                  args: {
                    summary: 'Royal dinner banquet',
                    costMinor: 15000000,
                  },
                },
              },
            ],
            role: 'model',
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 80,
        candidatesTokenCount: 25,
        totalTokenCount: 105,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const client = new GeminiClient('test-key', ['gemini-3.8-flash']);

    const res = await client.callTool({
      systemPrompt: 'System',
      userPrompt: 'Extract data',
      tool: {
        name: 'test_tool',
        description: 'Test Tool',
        schema: testSchema,
      },
      purpose: 'extract_quote',
    });

    expect(res.data.summary).toBe('Royal dinner banquet');
    expect(res.data.costMinor).toBe(15000000);
    expect(res.usage.promptTokens).toBe(80);
    expect(res.usage.model).toBe('gemini-3.8-flash');

    fetchSpy.mockRestore();
  });

  it('automatically falls back to fallback models when primary model fails', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // First attempt (gemini-3.8-flash) returns 503 Service Unavailable
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'High demand' } }),
      } as Response)
      // Second attempt (gemini-2.5-flash) succeeds!
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'test_tool',
                      args: {
                        summary: 'Fallback succeeded',
                        costMinor: 99000,
                      },
                    },
                  },
                ],
              },
            },
          ],
        }),
      } as Response);

    const client = new GeminiClient('test-key', [
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ]);

    const res = await client.callTool({
      systemPrompt: 'System',
      userPrompt: 'Extract data',
      tool: {
        name: 'test_tool',
        description: 'Test Tool',
        schema: testSchema,
      },
      purpose: 'extract_quote',
    });

    expect(res.data.summary).toBe('Fallback succeeded');
    expect(res.usage.model).toBe('gemini-2.5-flash');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockRestore();
  });

  it('throws an error if all models in the fallback chain fail', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'High demand' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'High demand' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'High demand' } }),
      } as Response);

    const client = new GeminiClient('test-key', [
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ]);

    await expect(
      client.callTool({
        systemPrompt: 'System',
        userPrompt: 'Extract data',
        tool: {
          name: 'test_tool',
          description: 'Test Tool',
          schema: testSchema,
        },
        purpose: 'extract_quote',
      }),
    ).rejects.toThrow('All models in the Gemini chain failed');

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    fetchSpy.mockRestore();
  });
});
