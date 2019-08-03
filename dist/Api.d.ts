import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { AnyFunc } from '@churchcommunitybuilder/js-utils/types';
export declare type RefreshFunc = (api: AxiosInstance) => boolean;
export declare type ApiResponse<R> = AxiosResponse<R> & {
    error: boolean;
};
export default class Api {
    private api;
    private isRefreshing;
    private queuedRequests;
    private onAuthFailure;
    private onHandleRefresh;
    constructor(api: AxiosInstance, onAuthFailure: AnyFunc, onHandleRefresh: RefreshFunc);
    private formatResponse;
    private queueRequest;
    private performQueuedRequests;
    private cancelQueuedRequests;
    private refreshTokens;
    request<R = any>(config: AxiosRequestConfig): Promise<ApiResponse<R>>;
}
