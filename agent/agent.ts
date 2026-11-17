import { openai } from 'eve/models/openai';
import { defineAgent } from "eve";

export default defineAgent({
  model: openai('gpt-6-luna-fast'),
  reasoning: "high",
});

