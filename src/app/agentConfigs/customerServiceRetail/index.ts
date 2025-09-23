import { authenticationAgent } from './authentication';
import { createAuthenticationAgent } from './authentication';

export const createCustomerServiceScenario = (companyName: string, companyContext: string) => {
  return [createAuthenticationAgent(companyName, companyContext)];
};

export const customerServiceRetailScenario = createCustomerServiceScenario('Amazon', 'A dedicated snowboard gear specialist.');
