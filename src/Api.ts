import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import R from 'ramda';
import { AnyFunc } from '@churchcommunitybuilder/js-utils/types';

export type RefreshFunc = (api: AxiosInstance) => boolean;
export type ApiResponse<R> = AxiosResponse<R> & { error: boolean };

type QueuedRequest = {
  config: AxiosRequestConfig;
  resolve: AnyFunc;
};

export default class Api {
  private api: AxiosInstance;
  private isRefreshing = false;
  private queuedRequests: QueuedRequest[] = [];
  private onAuthFailure: AnyFunc;
  private onHandleRefresh: RefreshFunc;

  constructor(
    api: AxiosInstance,
    onAuthFailure: AnyFunc,
    onHandleRefresh: RefreshFunc,
  ) {
    this.api = api;
    this.onAuthFailure = onAuthFailure;
    this.onHandleRefresh = onHandleRefresh;
  }

  private formatResponse<R>(
    response: AxiosResponse<R>,
    error: boolean,
  ): ApiResponse<R> {
    return {
      ...response,
      error,
    };
  }

  private async queueRequest<R>(
    config: AxiosRequestConfig,
  ): Promise<ApiResponse<R>> {
    return new Promise(resolve => {
      this.queuedRequests = R.append({ config, resolve }, this.queuedRequests);
    });
  }

  private performQueuedRequests() {
    const requests = this.queuedRequests.map(async request => {
      try {
        const response = await this.api.request(request.config);
        request.resolve(this.formatResponse(response, false));
      } catch (e) {
        request.resolve(this.formatResponse(e, true));
      }
    });

    Promise.all(requests);
  }

  private cancelQueuedRequests() {
    this.queuedRequests.forEach(request => request.resolve({ error: true }));

    this.queuedRequests = [];
  }

  private async refreshTokens() {
    this.isRefreshing = true;

    try {
      if (await this.onHandleRefresh(this.api)) {
        this.performQueuedRequests();
      } else {
        this.cancelQueuedRequests();
      }
    } catch (e) {
      this.onAuthFailure();
      this.cancelQueuedRequests();
    }

    this.isRefreshing = false;
  }

  async request<R = any>(config: AxiosRequestConfig): Promise<ApiResponse<R>> {
    if (this.isRefreshing) {
      return this.queueRequest<R>(config);
    }

    try {
      const response = await this.api.request<R>(config);
      return this.formatResponse<R>(response, false);
    } catch (e) {
      if (
        R.pathEq(['response', 'status'], 401, e) &&
        !config.url!.includes('oauth/token')
      ) {
        const queuedRequest = this.queueRequest<R>(config);

        if (!this.isRefreshing) {
          await this.refreshTokens();
        }

        return queuedRequest;
      }

      return this.formatResponse(e, true);
    }
  }
}
