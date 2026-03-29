export {
  platformLogin,
  platformRegister,
  platformRefreshToken,
  platformGetMe,
  platformGetMeFromOAuth,
  exchangePlatformTokenForChatToken,
  getOAuthURL,
  parseOAuthCallbackURL,
  OAUTH_CALLBACK_SCHEME,
  PlatformAuthError,
} from './platformAuthService';

export type {
  PlatformUser,
  AuthTokens,
  PlatformSession,
} from './platformAuthService';
