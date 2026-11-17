import { eveChannel } from "eve/channels/eve";
import { localDev } from "eve/channels/auth";

// PC에서 사용하는 개발 채널. 외부 공개 시 별도 인증이 필요합니다.
export default eveChannel({ auth: [localDev()] });
