import { openai } from 'eve/models/openai';
import { defineAgent } from 'eve';
export default defineAgent({ description: "개발 담당: 요구사항과 설계에 맞는 실행 가능한 앱·웹 코드를 제작한다. 파일 경로와 전체 코드 또는 적용 가능한 패치를 반환한다. 빌드 및 테스트 명령을 실행하고 실제 결과를 기록한다. 실행할 수 없으면 미실행으로 보고한다. 발견한 보안 문제를 수정하고 수정 근거를 제공한다.", model: openai('gpt-6-luna-fast'), reasoning: 'high' });


