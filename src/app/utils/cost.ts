export function calculateOpenAICost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    audioSeconds = 0 // added audio duration in seconds
  ) {
    let cost = 0;
  
    if (model.startsWith("ft:gpt-4o-mini")) {
      cost = (inputTokens / 1000) * 0.15 + (outputTokens / 1000) * 0.60;
    } else if (model.startsWith("gpt-4o-realtime")) {
      cost = (inputTokens / 1000) * 0.60 + (outputTokens / 1000) * 2.40;
  
      // Add audio cost (OpenAI Realtime TTS / STT ~ $0.48 / min example)
      const audioRatePerMinute = 0.48;
      cost += (audioSeconds / 60) * audioRatePerMinute;
    } else {
      // fallback for unknown/custom models
      cost = (inputTokens + outputTokens) / 1000 * 0.001;
    }
  
    return cost;
  }
  