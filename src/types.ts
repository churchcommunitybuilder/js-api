import { AxiosRequestConfig, AxiosResponse } from 'axios'

export interface AuthorizationTokens {
  accessToken: string
  refreshToken?: string
  tokenType?: string
  expiresIn?: number
  scope?: string
}

export type ApiResponse<WhenSuccess, WhenError = unknown> =
  | ({ error: false } & AxiosResponse<WhenSuccess>)
  | ({ error: true } & AxiosResponse<WhenError>)

export interface AuthErrorResponse {
  errors: {
    type: string
    message: string
  }[]
}

export type AuthTokenResponse<E = unknown> = ApiResponse<AuthorizationTokens, E>

export interface RequestConfig extends AxiosRequestConfig {
  url: string
  method?: 'get' | 'post' | 'put' | 'delete'
  params?: Record<string, any>
  data?: Record<string, any>
  headers?: Record<string, any>
}

export enum ApiMethod {
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  DELETE = 'delete',
}

export interface JwtAuthContext {
  authToken: string
  orgKey: string
}
