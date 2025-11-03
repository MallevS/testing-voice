export function calculateOpenAICost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  audioSeconds = 0
) {
  let cost = 0;

  if (model.startsWith("ft:gpt-4o-mini")) {
    cost = (inputTokens / 1000) * 0.15 + (outputTokens / 1000) * 0.60;
  } else if (model.startsWith("gpt-4o-realtime")) {
    cost = (inputTokens / 1000) * 0.60 + (outputTokens / 1000) * 2.40;

    const audioRatePerMinute = 0.48;
    cost += (audioSeconds / 60) * audioRatePerMinute;
  } else {
    cost = (inputTokens + outputTokens) / 1000 * 0.001;
  }

  return cost;
}

export function calculateTwilioCost(durationSeconds: number): number {
  const pricePerMinute = 0.013;
  const durationMinutes = durationSeconds / 60;
  return durationMinutes * pricePerMinute;
}

export function calculateRealtimeCallCost(
  callDurationSeconds: number,
  inputTokens: number = 0,
  outputTokens: number = 0,
  audioSeconds: number = 0
): number {
  const twilioCost = calculateTwilioCost(callDurationSeconds);
  const openaiCost = calculateOpenAICost("gpt-4o-realtime", inputTokens, outputTokens, audioSeconds);
  
  return twilioCost + openaiCost;
}

export function getActivityDisplayText(activity: any): string {
  if (activity.model === "twilio-call") {
    const mins = Math.floor(activity.duration / 60);
    const secs = activity.duration % 60;
    return `📞 Outbound call (${mins}m ${secs}s) to ${activity.phoneNumber || "Unknown"}`;
  }
  
  if (activity.audioSeconds && activity.audioSeconds > 0) {
    return `🎤 Audio response (${Math.round(activity.audioSeconds)}s)`;
  }
  
  return `📝 Text response`;
}