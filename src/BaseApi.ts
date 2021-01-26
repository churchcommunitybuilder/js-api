import { AxiosInstance, AxiosResponse } from 'axios'
import R from 'ramda'
import logLevel from 'loglevel'

import {
  AuthorizationTokens,
  RequestConfig,
  ApiMethod,
  ApiResponse,
  AuthTokenResponse,
} from './types'

const delay = (duration: number) => new Promise(r => setTimeout(r, duration))

type QueuedRequest = {
  config: RequestConfig
  resolve: (response: any) => void
}

interface WrappedRequest {
  <R = any, E = unknown>(config: RequestConfig): Promise<ApiResponse<R, E>>
  <R = any, E = unknown>(
    url: string,
    config?: Omit<RequestConfig, 'url'>,
  ): Promise<ApiResponse<R, E>>
}

type DefaultRequestConfig = Partial<RequestConfig>

export interface BaseApiOptions {
  debugCookie?: string
  performRequest: AxiosInstance['request']
  propagateErrors?: boolean
  getTokens: (
    config: RequestConfig,
  ) =>
    | Promise<AuthorizationTokens | null | undefined>
    | (AuthorizationTokens | null | undefined)
  logLevel?: 'debug' | 'error' | 'silent'
  setTokens: (tokens: AuthorizationTokens) => Promise<void> | void
  onAuthFailure: (e: Error) => void
  hasNetworkConnection?: () => Promise<boolean> | boolean
  getDefaultConfig?: (
    config: RequestConfig,
  ) => DefaultRequestConfig | Promise<DefaultRequestConfig>
}

export abstract class BaseApi<Options extends BaseApiOptions> {
  protected options: Options
  private isAuthenticating = false
  private queuedRequests: QueuedRequest[] = []
  private networkPollingInterval = 2000

  constructor(options: Options) {
    this.options = options

    switch (options.logLevel) {
      case 'debug':
        logLevel.setLevel(logLevel.levels.DEBUG, true)
        break
      case 'error':
        logLevel.setLevel(logLevel.levels.ERROR, true)
        break
      case 'silent':
      default:
        logLevel.setLevel(logLevel.levels.SILENT, true)
        break
    }
  }

  public abstract authenticate(...args: any[]): Promise<AuthTokenResponse>
  protected abstract refreshTokens(): Promise<AuthTokenResponse>
  protected abstract getAuthUrl(): string

  private handleError(e: Error) {
    if (this.options.propagateErrors) {
      throw e
    }
  }

  protected formatResponse<R, E extends boolean>(
    response: AxiosResponse<R>,
    error: E,
  ): ApiResponse<E extends true ? never : R, E extends true ? R : never> {
    return {
      ...response,
      error,
    } as any
  }

  private async queueRequest<R>(
    config: RequestConfig,
  ): Promise<ApiResponse<R>> {
    logLevel.debug('Request Queued:', config)
    return new Promise(resolve => {
      this.queuedRequests = R.append({ config, resolve }, this.queuedRequests)
    })
  }

  protected async executeRequest<R>(config: RequestConfig) {
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

    const mergedConfig = {
      ...defaultConfig,
      ...config,
    }

    try {
      const response = await this.options.performRequest<R>(mergedConfig)
      logLevel.debug('Request Finished:', {
        request: mergedConfig,
        response: {
          status: response.status,
          data: response.data,
          headers: response.headers,
        },
      })

      return response
    } catch (e) {
      logLevel.error('Request Failed:', {
        request: mergedConfig,
        response: {
          status: e.status,
          data: e.data,
          headers: e.headers,
        },
      })
      throw e
    }
  }

  protected async executeTokenRequest<E>(
    data: any,
    bearerToken?: string,
  ): Promise<AuthTokenResponse<E>> {
    this.isAuthenticating = true

    try {
      const config: RequestConfig = {
        method: 'post',
        url: this.getAuthUrl(),
        data,
      }

      if (bearerToken) {
        config.headers = {
          Authorization: `Bearer ${bearerToken}`,
        }
      }

      const response = await this.executeRequest<AuthorizationTokens>(config)

      await this.options.setTokens(response.data)
      this.performQueuedRequests()

      return this.formatResponse(response, false)
    } catch (e) {
      this.handleError(e)
      this.cancelQueuedRequests()
      this.options.onAuthFailure(e)

      return this.formatResponse<E, true>(e, true)
    } finally {
      this.isAuthenticating = false
    }
  }

  private async performRefresh() {
    if (!this.isAuthenticating) {
      this.isAuthenticating = true
      const didRefresh = await this.refreshTokens()
      this.isAuthenticating = false

      if (didRefresh) {
        this.performQueuedRequests()
      } else {
        this.cancelQueuedRequests()
      }
    }
  }

  private performQueuedRequests() {
    const requests = this.queuedRequests.map(async request => {
      try {
        const response = await this.executeRequest(request.config)
        request.resolve(this.formatResponse(response, false))
      } catch (e) {
        this.handleError(e)
        request.resolve(this.formatResponse(e, true))
      }
    })

    Promise.all(requests)
  }

  private cancelQueuedRequests() {
    this.queuedRequests.forEach(request => request.resolve({ error: true }))

    this.queuedRequests = []
  }

  private async waitForNetworkConnection() {
    if (this.options.hasNetworkConnection) {
      let hasNetworkConnection = await this.options.hasNetworkConnection()

      while (!hasNetworkConnection) {
        await delay(this.networkPollingInterval)
        hasNetworkConnection = await this.options.hasNetworkConnection()
      }
    }
  }

  async request<R = any, E = unknown>(
    config: RequestConfig,
  ): Promise<ApiResponse<R>> {
    await this.waitForNetworkConnection()

    if (this.isAuthenticating) {
      return this.queueRequest<R>(config)
    }

    try {
      const response = await this.executeRequest<R>(config)
      return this.formatResponse(response, false)
    } catch (e) {
      this.handleError(e)

      if (
        e?.response?.status === 401 &&
        !config.url?.includes(this.getAuthUrl())
      ) {
        const queuedRequest = this.queueRequest<R>(config)
        await this.performRefresh()

        return queuedRequest
      }

      return this.formatResponse<E, true>(e, true)
    }
  }

  private applyDefaultMethod(method: ApiMethod) {
    const wrappedRequest: WrappedRequest = <R = any, E = unknown>(
      urlOrConfig: string | RequestConfig,
      config: Omit<RequestConfig, 'url'> = {},
    ) => {
      const mergedConfig =
        typeof urlOrConfig === 'string'
          ? { url: urlOrConfig, ...config }
          : urlOrConfig

      return this.request<R, E>({
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
