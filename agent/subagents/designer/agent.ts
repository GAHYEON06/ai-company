import { openai } from 'eve/models/openai';
import { defineAgent } from 'eve';
export default defineAgent({ description: "UI 및 기술 설계 담당: 화면 구조, 디자인 규칙, 접근성, 반응형 화면, API와 데이터 구조를 설계한다. 참조 화면이 있으면 그것을 우선한다. 구현 담당자가 사용할 구체적인 명세를 반환한다.", model: openai('gpt-6-luna-fast'), reasoning: 'high' });


