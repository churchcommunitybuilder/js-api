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
  params?: Record<string, any>
  data?: Record<string, any>
  headers?: Record<string, any>
}
type QueuedRequest = {
  config: RequestConfig
  resolve: AnyFunc
}

interface WrappedRequest {
  <R = any>(config: RequestConfig): Promise<ApiResponse<R>>
  <R = any>(url: string, config?: Omit<RequestConfig, 'url'>): Promise<
    ApiResponse<R>
  >
}

type DefaultRequestConfig = Partial<RequestConfig>

type BaseApiOptions = {
  debugCookie?: string
  performRequest: AxiosInstance['request']
  getTokens: (
    config: RequestConfig,
  ) =>
    | Promise<AuthorizationTokens | null | undefined>
    | (AuthorizationTokens | null | undefined)
  setTokens: (tokens: AuthorizationTokens) => Promise<void> | void
  onAuthFailure: (e: Error) => void
  getDefaultConfig?: (
    config: RequestConfig,
  ) => DefaultRequestConfig | Promise<DefaultRequestConfig>
}

interface BasicOAuthOptions extends BaseApiOptions {
  authStrategy?: 'basicOAuth'
  clientCredentials: {
    clientId: string
    clientSecret: string
  }
}

interface PushpayJwtOptions extends BaseApiOptions {
  authStrategy: 'pushpayJwt'
  getJwtAuthContext: () => {
    authToken: string
    organizationKey: string
  }
}

export type ApiOptions = BasicOAuthOptions | PushpayJwtOptions

const isBasicOAuth = (options: ApiOptions): options is BasicOAuthOptions =>
  !options.authStrategy || options.authStrategy === 'basicOAuth'

const isPushpayJwt = (options: ApiOptions): options is PushpayJwtOptions =>
  options.authStrategy === 'pushpayJwt'

export class Api<Options extends ApiOptions> {
  private options: Options
  private isRefreshing = false
  private queuedRequests: QueuedRequest[] = []

  constructor(options: Options) {
    this.options = options
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
    config: RequestConfig,
  ): Promise<ApiResponse<R>> {
    return new Promise(resolve => {
      this.queuedRequests = R.append({ config, resolve }, this.queuedRequests)
    })
  }

  private async executeRequest<R>(config: RequestConfig) {
    const tokens = await this.options.getTokens(config)

    if (tokens?.accessToken && !config?.headers?.Authorization) {
      config = R.assocPath(
        ['headers', 'Authorization'],
        `Bearer ${tokens.accessToken}`,
        config,
      )
    }

    if (this.options.debugCookie && !config?.headers?.Cookie) {
      config = R.assocPath(
        ['headers', 'Cookie'],
        this.options.debugCookie,
        config,
      )
      config.withCredentials = true
    }

    const defaultConfig = (await this.options.getDefaultConfig?.(config)) ?? {}

    return this.options.performRequest<R>({
      ...defaultConfig,
      ...config,
    })
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

    if (isBasicOAuth(this.options)) {
      const baseConfig = { method: 'post' as const, url: 'oauth/token' }
      const tokens = await this.options.getTokens(baseConfig)

      if (tokens?.refreshToken) {
        try {
          const { data } = await this.executeRequest<any>({
            ...baseConfig,
            data: {
              refreshToken: tokens?.refreshToken,
              grantType: 'refresh_token',
              ...this.options.clientCredentials,
            },
          })

          await this.options.setTokens(data)
          this.performQueuedRequests()
        } catch (e) {
          this.options.onAuthFailure(e)
          this.cancelQueuedRequests()
        }
      } else {
        this.cancelQueuedRequests()
      }
    } else if (isPushpayJwt(this.options)) {
      /**
       * for refreshes using pushpay jwt, we just reauthenticate to the same endpoint
       * and assume that the client will provide us updated auth context
       */
      if (await this.authenticate<any>()) {
        this.performQueuedRequests()
      } else {
        this.cancelQueuedRequests()
      }
    }

    this.isRefreshing = false
  }

  async authenticate<O extends Options>(
    ...args: O extends BasicOAuthOptions
      ? [{ username: string; password: string; subdomain: string }]
      : []
  ) {
    let config: RequestConfig

    if (isBasicOAuth(this.options)) {
      config = {
        method: 'post',
        url: 'oauth/token',
        data: {
          grantType: 'password',
          ...args[0],
          ...this.options.clientCredentials,
        },
      }
    } else if (isPushpayJwt(this.options)) {
      const context = await this.options.getJwtAuthContext()

      config = {
        method: 'post',
        url: 'internal/identity',
        headers: {
          Authorization: `Bearer ${context.authToken}`,
        },
        data: {
          organizationKey: context.organizationKey,
        },
      }
    } else {
      throw Error('invalid authentication strategy')
    }

    try {
      const { data } = await this.executeRequest<AuthorizationTokens>(config)
      this.options.setTokens(data)

      return true
    } catch (e) {
      this.options.onAuthFailure(e)

      return false
    }
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
