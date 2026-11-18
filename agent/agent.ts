import { openai } from 'eve/models/openai';
import { defineAgent } from "eve";

export default defineAgent({
  model: openai(process.env.POGEUN_OPENAI_MODEL || 'gpt-6-luna-fast'),
  reasoning: "high",
  limits: {
    sessionUsage: ({ window }) => window.inputTokens - window.cacheReadTokens >= 100_000 || window.outputTokens >= 20_000,
  },
});


