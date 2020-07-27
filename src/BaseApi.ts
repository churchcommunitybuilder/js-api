import { AxiosInstance, AxiosResponse } from 'axios'
import R from 'ramda'

import {
  AuthorizationTokens,
  RequestConfig,
  ApiMethod,
  ApiResponse,
} from './types'

type QueuedRequest = {
  config: RequestConfig
  resolve: (response: any) => void
}

interface WrappedRequest {
  <R = any>(config: RequestConfig): Promise<ApiResponse<R>>
  <R = any>(url: string, config?: Omit<RequestConfig, 'url'>): Promise<
    ApiResponse<R>
  >
}

type DefaultRequestConfig = Partial<RequestConfig>

export interface BaseApiOptions {
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

export abstract class BaseApi<Options extends BaseApiOptions> {
  protected options: Options
  private isRefreshing = false
  private queuedRequests: QueuedRequest[] = []

  constructor(options: Options) {
    this.options = options
  }

  public abstract authenticate(...args: any[]): Promise<boolean>
  protected abstract refreshTokens(): Promise<boolean>
  protected abstract getAuthUrl(): string

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

    return this.options.performRequest<R>({
      ...defaultConfig,
      ...config,
    })
  }

  protected async executeTokenRequest(data: any, bearerToken?: string) {
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

      const { data: tokens } = await this.executeRequest<AuthorizationTokens>(
        config,
      )

      await this.options.setTokens(tokens)
      return true
    } catch (e) {
      this.options.onAuthFailure(e)
      return false
    }
  }

  private async performRefresh() {
    if (!this.isRefreshing) {
      this.isRefreshing = true
      const didRefresh = await this.refreshTokens()

      if (didRefresh) {
        this.performQueuedRequests()
      } else {
        this.cancelQueuedRequests()
      }

      this.isRefreshing = false
    }
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

  async request<R = any>(config: RequestConfig): Promise<ApiResponse<R>> {
    if (this.isRefreshing) {
      return this.queueRequest<R>(config)
    }

    try {
      const response = await this.executeRequest<R>(config)
      return this.formatResponse<R>(response, false)
    } catch (e) {
      if (
        e?.response?.status === 401 &&
        !config.url?.includes(this.getAuthUrl())
      ) {
        const queuedRequest = this.queueRequest<R>(config)
        await this.performRefresh()

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
