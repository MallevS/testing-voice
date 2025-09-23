
import { customerServiceRetailScenario } from './customerServiceRetail';

import type { RealtimeAgent } from '@openai/agents/realtime';

export const allAgentSets: Record<string, RealtimeAgent[]> = {
  customerServiceRetail: customerServiceRetailScenario
};

export const defaultAgentSetKey = 'customerServiceRetail';
