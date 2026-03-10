export const INVALID_AUTH_TOKEN_MESSAGE = '授權 Token 格式錯誤：請輸入 raw token 或 Bearer <token>。';

const BEARER_ONLY_PATTERN = /^Bearer\s*$/i;
const BEARER_WITH_TOKEN_PATTERN = /^Bearer\s+(.+)$/i;

export const normalizeAuthToken = (authToken: string): string => {
  const trimmedToken = authToken.trim();
  if (!trimmedToken || BEARER_ONLY_PATTERN.test(trimmedToken)) {
    return '';
  }

  const bearerMatch = trimmedToken.match(BEARER_WITH_TOKEN_PATTERN);
  return bearerMatch ? bearerMatch[1].trim() : trimmedToken;
};

export const buildAuthorizationHeader = (authToken: string): string => {
  const normalizedToken = normalizeAuthToken(authToken);
  if (!normalizedToken) {
    throw new Error(INVALID_AUTH_TOKEN_MESSAGE);
  }

  return `Bearer ${normalizedToken}`;
};
