import { AxiosRequestConfig } from 'axios';
import { AnyFunc } from '@churchcommunitybuilder/js-utils/types';

import Api, { ApiResponse, RefreshFunc } from './Api';
import { createApiInstance } from './apiInstance';
import { createOAuthHandler as _createOAuthHandler } from './createOAuthHandler';

const defaultTimeout = 20000;

export enum ApiMethod {
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  DELETE = 'delete',
}

interface ApiType {
  get: <R>(config: RequestConfig) => Promise<ApiResponse<R>>;
  post: <R>(config: RequestConfig) => Promise<ApiResponse<R>>;
  put: <R>(config: RequestConfig) => Promise<ApiResponse<R>>;
  delete: <R>(config: RequestConfig) => Promise<ApiResponse<R>>;
  request: <R>(config: RequestConfig) => Promise<ApiResponse<R>>;
}

export interface RequestConfig extends AxiosRequestConfig {
  url: string;
  method?: ApiMethod;
  params?: {};
  data?: {};
  headers?: {};
}

let apiWrapper: Api;
let api: ApiType | undefined;
let applyDefaultMethod;

export const createApi = (
  baseURL: string,
  onAuthFailure: AnyFunc,
  onHandleRefresh: RefreshFunc,
  apiInterceptor?: (
    value: AxiosRequestConfig,
  ) => AxiosRequestConfig | Promise<AxiosRequestConfig>,
  timeout = defaultTimeout,
  headers = {},
) => {
  const apiInstance = createApiInstance(
    baseURL,
    timeout,
    apiInterceptor,
    headers,
  );

  apiWrapper = new Api(apiInstance, onAuthFailure, onHandleRefresh);

  applyDefaultMethod = (method: ApiMethod) => <R>(config: RequestConfig) =>
    apiWrapper.request<R>({
      method,
      ...config,
    });

  api = {
    get: applyDefaultMethod(ApiMethod.GET),
    post: applyDefaultMethod(ApiMethod.POST),
    put: applyDefaultMethod(ApiMethod.PUT),
    delete: applyDefaultMethod(ApiMethod.DELETE),
    request: apiWrapper.request,
  };
};

export const createOAuthHandler = _createOAuthHandler;

export type Api = typeof api;

export default api;
