import { openai } from 'eve/models/openai';
import { defineAgent } from 'eve';
export default defineAgent({ description: "QA 담당: 요구사항별 통과/실패/미검증을 구분한다. 정상 경로와 오류, 경계값, 접근성 및 회귀를 검증한다. 재현 단계, 기대 결과, 실제 결과와 근거를 보고한다. 개발자의 주장만으로 테스트 통과를 인정하지 않는다.", model: openai('gpt-6-luna-fast'), reasoning: 'high' });


