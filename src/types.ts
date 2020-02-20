export type AnyFunc<R = any> = (...args: any[]) => R
export interface AuthorizationTokens {
  accessToken: string
  refreshToken: string
}
