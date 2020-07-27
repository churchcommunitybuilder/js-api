import { AxiosRequestConfig, AxiosResponse } from 'axios'

export interface AuthorizationTokens {
  accessToken: string
  refreshToken: string
}

export type ApiResponse<R> = AxiosResponse<R> & { error: boolean }

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
