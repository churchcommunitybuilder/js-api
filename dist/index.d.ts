import { AxiosRequestConfig } from 'axios';
import { AnyFunc } from '@churchcommunitybuilder/js-utils/types';
import { ApiResponse, RefreshFunc } from './Api';
export declare enum ApiMethod {
    GET = "get",
    POST = "post",
    PUT = "put",
    DELETE = "delete"
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
declare let api: ApiType | undefined;
export declare const createApi: (baseURL: string, onAuthFailure: AnyFunc<any>, onHandleRefresh: RefreshFunc, apiInterceptor?: (value: AxiosRequestConfig) => AxiosRequestConfig | Promise<AxiosRequestConfig>, timeout?: number, headers?: {}) => void;
export declare const createOAuthHandler: (clientId: string, clientSecret: string, getTokens: AnyFunc<any>, setTokens: AnyFunc<any>) => {
    onAuthFailure: () => any;
    onHandleRefresh: (api: import("axios").AxiosInstance) => Promise<void>;
    apiInterceptor: (config: AxiosRequestConfig) => Promise<any>;
};
export declare type Api = typeof api;
export default api;
