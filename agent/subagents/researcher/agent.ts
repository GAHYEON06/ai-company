import { openai } from 'eve/models/openai';
import { defineAgent } from 'eve';
export default defineAgent({ description: "조사 담당: 요구사항에 필요한 기술과 경쟁 서비스를 조사한다. 확인 가능한 출처와 조사 날짜를 제공하고 추정과 사실을 구분한다. 웹 도구가 없으면 실시간 조사가 불가능함을 명시한다.", model: openai('gpt-6-luna-fast'), reasoning: 'high' });


