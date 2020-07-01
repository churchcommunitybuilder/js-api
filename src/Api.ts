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

interface WrappedRequest {
  <R = any>(config: RequestConfig): Promise<ApiResponse<R>>
  <R = any>(url: string, config?: Omit<RequestConfig, 'url'>): Promise<
    ApiResponse<R>
  >
}

type DefaultRequestConfig = Partial<AxiosRequestConfig>

export type ApiConstructorArgs = {
  clientCredentials: {
    clientId: string
    clientSecret: string
  }
  debugCookie?: string
  performRequest: AxiosInstance['request']
  getTokens: () => Promise<AuthorizationTokens> | AuthorizationTokens
  setTokens: (tokens: AuthorizationTokens) => Promise<void> | void
  onAuthFailure: AnyFunc
  defaultConfig?: DefaultRequestConfig
}

export class Api {
  private clientCredentials: ApiConstructorArgs['clientCredentials']
  private debugCookie: ApiConstructorArgs['debugCookie']
  private performRequest: ApiConstructorArgs['performRequest']
  private getTokens: ApiConstructorArgs['getTokens']
  private setTokens: ApiConstructorArgs['setTokens']
  private onAuthFailure: ApiConstructorArgs['onAuthFailure']
  private defaultConfig?: ApiConstructorArgs['defaultConfig']
  private isRefreshing = false
  private queuedRequests: QueuedRequest[] = []

  constructor({
    clientCredentials,
    debugCookie,
    performRequest,
    getTokens,
    setTokens,
    onAuthFailure,
    defaultConfig = {},
  }: ApiConstructorArgs) {
    this.clientCredentials = clientCredentials
    this.debugCookie = debugCookie
    this.performRequest = performRequest
    this.getTokens = getTokens
    this.setTokens = setTokens
    this.onAuthFailure = onAuthFailure
    this.defaultConfig = defaultConfig
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

  private async executeRequest<R>(config: AxiosRequestConfig) {
    const tokens = await this.getTokens()

    if (tokens?.accessToken && !config?.headers?.Authorization) {
      config = R.assocPath(
        ['headers', 'Authorization'],
        `Bearer ${tokens.accessToken}`,
        config,
      )
    }

    if (this.debugCookie && !config?.headers?.Cookie) {
      config = R.assocPath(['headers', 'Cookie'], this.debugCookie, config)
      config.withCredentials = true
    }

    return this.performRequest<R>({ ...(this.defaultConfig ?? {}), ...config })
  }

  private performQueuedRequests() {
    const requests = this.queuedRequests.map(async request => {
      try {
        const response = await this.executeRequest(request.config)
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
    const { refreshToken } = await this.getTokens()

    if (refreshToken) {
      try {
        const { data } = await this.executeRequest<any>({
          method: 'post',
          url: 'oauth/token',
          data: {
            refreshToken,
            grantType: 'refresh_token',
            ...this.clientCredentials,
          },
        })

        await this.setTokens(data)
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

  setDefaultConfig(config: DefaultRequestConfig) {
    this.defaultConfig = config
  }

  mergeDefaultConfig(config: DefaultRequestConfig) {
    this.defaultConfig = R.mergeDeepRight(
      this.defaultConfig ?? {},
      config,
    ) as DefaultRequestConfig
  }

  setDefaultConfigValue<K extends keyof DefaultRequestConfig>(
    key: K,
    value: DefaultRequestConfig[K],
  ) {
    this.defaultConfig = R.assoc(key, value, this.defaultConfig)
  }

  async request<R = any>(config: RequestConfig): Promise<ApiResponse<R>> {
    if (this.isRefreshing) {
      return this.queueRequest<R>(config)
    }

    try {
      const response = await this.executeRequest<R>(config)
      return this.formatResponse<R>(response, false)
    } catch (e) {
      if (e?.response?.status === 401 && !config.url?.includes('oauth/token')) {
        const queuedRequest = this.queueRequest<R>(config)

        if (!this.isRefreshing) {
          await this.refreshTokens()
        }

        return queuedRequest
      }

      return this.formatResponse(e, true)
    }
  }

  private applyDefaultMethod(method: ApiMethod) {
    const wrappedRequest: WrappedRequest = <R = any>(
      urlOrConfig: string | RequestConfig,
      config: Omit<RequestConfig, 'url'> = {},
    ) => {
      const mergedConfig =
        typeof urlOrConfig === 'string'
          ? { url: urlOrConfig, ...config }
          : urlOrConfig

      return this.request<R>({
        method,
        ...mergedConfig,
      })
    }

    return wrappedRequest
  }

  get = this.applyDefaultMethod(ApiMethod.GET)
  post = this.applyDefaultMethod(ApiMethod.POST)
  put = this.applyDefaultMethod(ApiMethod.PUT)
  delete = this.applyDefaultMethod(ApiMethod.DELETE)
}
