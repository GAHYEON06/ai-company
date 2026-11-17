import { openai } from 'eve/models/openai';
import { defineAgent } from 'eve';
export default defineAgent({ description: "기획 담당: 사용자 목표를 사용자 흐름, MVP 범위, 기능별 완료 조건과 우선순위로 정리한다. 요청하지 않은 기능을 필수 범위에 추가하지 않는다.", model: openai('gpt-6-luna-fast'), reasoning: 'high' });


