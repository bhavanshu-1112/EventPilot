import { internalError } from '@eventpilot/shared';
import type { LlmClient, LlmCallOptions, LlmCallResult } from './types.js';

/**
 * NullClient throws a descriptive error when LLM services are called
 * but LLM_MODE is set to 'null' or unconfigured.
 */
export class NullClient implements LlmClient {
  async callTool<T>(_options: LlmCallOptions<T>): Promise<LlmCallResult<T>> {
    throw internalError(
      'LLM_NOT_CONFIGURED: LLM service is in null mode. Set LLM_MODE=live or LLM_MODE=fixture to enable GenAI features.',
    );
  }
}
