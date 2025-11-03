import { zodTextFormat } from 'openai/helpers/zod';
import { GuardrailOutputZod, GuardrailOutput } from '@/app/types';
import { getAuth } from "firebase/auth";

export async function runGuardrailClassifier(
  message: string,
  companyName: string
): Promise<GuardrailOutput> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("No Firebase user logged in");
  const userToken = await user.getIdToken();

  const messages = [
    {
      role: 'user',
      content: `You are an expert at classifying text according to moderation policies. Consider the provided message, analyze potential classes from output_classes, and output the best classification. Output json, following the provided schema. Keep your analysis and reasoning short and to the point, maximum 2 sentences.

      <info>
      - Company name: ${companyName}
      </info>

      <message>
      ${message}
      </message>

      <output_classes>
      // - OFFENSIVE: Content that includes hate speech, discriminatory language, insults, slurs, or harassment.
      // - OFF_BRAND: Content that discusses competitors in a disparaging way.
      // - VIOLENCE: Content that includes explicit threats, incitement of harm, or graphic descriptions of physical injury or violence.
      // - NONE: If no other classes are appropriate and the message is fine.
      </output_classes>
      `,
    },
  ];

  const response = await fetch("/api/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      model:
        "ft:gpt-4o-mini-2024-07-18:personal:gpt-4o-2024-08-06-sales-rep-v8:CHabe15Z",
      input: messages,
      text: {
        format: zodTextFormat(GuardrailOutputZod, "output_format"),
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 402) {
      window.dispatchEvent(new CustomEvent("insufficientCredits"));
    }
    console.warn('Server returned an error:', response);
    return Promise.reject({
      message: 'Error with runGuardrailClassifier.',
      status: response.status,
    });
  }


  const data = await response.json();
  try {
    const rawText = data.output?.[0]?.content?.[0]?.text ?? "{}";
    const parsed = GuardrailOutputZod.parse(JSON.parse(rawText));

    return {
      ...parsed,
      testText: message,
    };
  } catch (error) {
    console.error("Error parsing guardrail output:", error, data);
    return Promise.reject("Failed to parse guardrail output.");
  }
}

export interface RealtimeOutputGuardrailResult {
  tripwireTriggered: boolean;
  outputInfo: any;
}

export interface RealtimeOutputGuardrailArgs {
  agentOutput: string;
  agent?: any;
  context?: any;
}

export function createModerationGuardrail(companyName: string) {
  return {
    name: 'moderation_guardrail',

    async execute({ agentOutput }: RealtimeOutputGuardrailArgs): Promise<RealtimeOutputGuardrailResult> {
      try {
        const res = await runGuardrailClassifier(agentOutput, companyName);
        const triggered = res.moderationCategory !== 'NONE';
        return {
          tripwireTriggered: triggered,
          outputInfo: res,
        };
      } catch {
        return {
          tripwireTriggered: false,
          outputInfo: { error: 'guardrail_failed' },
        };
      }
    },
  } as const;
}