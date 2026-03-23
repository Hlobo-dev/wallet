export {
  platformLogin,
  platformRegister,
  platformRefreshToken,
  platformGetMe,
  exchangePlatformTokenForChatToken,
  PlatformAuthError,
} from './platformAuthService';

export type {
  PlatformUser,
  AuthTokens,
  PlatformSession,
} from './platformAuthService';
