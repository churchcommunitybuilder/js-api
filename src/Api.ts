import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

import R from 'ramda'

import { AnyFunc, AuthorizationTokens } from './types'

export type ApiResponse<R> = AxiosResponse<R> & { error: boolean }

export enum ApiMethod {
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  DELETE = 'delete',
}

export interface RequestConfig extends AxiosRequestConfig {
  url: string
  method?: 'get' | 'post' | 'put' | 'delete'
  params?: {}
  data?: {}
  headers?: {}
}
type QueuedRequest = {
  config: AxiosRequestConfig
  resolve: AnyFunc
}

export type ApiConstructorArgs = {
  clientCredentials: {
    clientId: string
    clientSecret: string
  }
  performRequest: AxiosInstance['request']
  getTokens: () => AuthorizationTokens
  setTokens: (tokens: AuthorizationTokens) => void
  onAuthFailure: AnyFunc
}

export class Api {
  private clientCredentials: ApiConstructorArgs['clientCredentials']
  private performRequest: ApiConstructorArgs['performRequest']
  private getTokens: ApiConstructorArgs['getTokens']
  private setTokens: ApiConstructorArgs['setTokens']
  private onAuthFailure: ApiConstructorArgs['onAuthFailure']
  private isRefreshing = false
  private queuedRequests: QueuedRequest[] = []

  constructor({
    clientCredentials,
    performRequest,
    getTokens,
    setTokens,
    onAuthFailure,
  }: ApiConstructorArgs) {
    this.clientCredentials = clientCredentials
    this.performRequest = performRequest
    this.getTokens = getTokens
    this.setTokens = setTokens
    this.onAuthFailure = onAuthFailure
  }

  private formatResponse<R>(
    response: AxiosResponse<R>,
    error: boolean,
  ): ApiResponse<R> {
    return {
      ...response,
      error,
    }
  }

  private async queueRequest<R>(
    config: AxiosRequestConfig,
  ): Promise<ApiResponse<R>> {
    return new Promise(resolve => {
      this.queuedRequests = R.append({ config, resolve }, this.queuedRequests)
    })
  }

  private performQueuedRequests() {
    const requests = this.queuedRequests.map(async request => {
      try {
        const response = await this.performRequest(request.config)
        request.resolve(this.formatResponse(response, false))
      } catch (e) {
        request.resolve(this.formatResponse(e, true))
      }
    })

    Promise.all(requests)
  }

  private cancelQueuedRequests() {
    this.queuedRequests.forEach(request => request.resolve({ error: true }))

    this.queuedRequests = []
  }

  private async refreshTokens() {
    this.isRefreshing = true
    const { refreshToken } = this.getTokens()

    if (refreshToken) {
      try {
        const { data } = await this.performRequest({
          method: 'post',
          url: 'oauth/token',
          data: {
            refreshToken,
            grantType: 'refresh_token',
            ...this.clientCredentials,
          },
        })

        this.setTokens(data)
        this.performQueuedRequests()
      } catch (e) {
        this.onAuthFailure()
        this.cancelQueuedRequests()
      }
    } else {
      this.cancelQueuedRequests()
    }

    this.isRefreshing = false
  }

  async request<R = any>(config: RequestConfig): Promise<ApiResponse<R>> {
    if (this.isRefreshing) {
      return this.queueRequest<R>(config)
    }

    try {
      const response = await this.performRequest<R>(config)
      return this.formatResponse<R>(response, false)
    } catch (e) {
      if (e?.response?.status === 401 && !config.url!.includes('oauth/token')) {
        const queuedRequest = this.queueRequest<R>(config)

        if (!this.isRefreshing) {
          await this.refreshTokens()
        }

        return queuedRequest
      }

      return this.formatResponse(e, true)
    }
  }

  private applyDefaultMethod = (method: ApiMethod) => <R = any>(
    config: RequestConfig,
  ) =>
    this.request<R>({
      method,
      ...config,
    })

  get = this.applyDefaultMethod(ApiMethod.GET)
  post = this.applyDefaultMethod(ApiMethod.POST)
  put = this.applyDefaultMethod(ApiMethod.PUT)
  delete = this.applyDefaultMethod(ApiMethod.DELETE)
}
