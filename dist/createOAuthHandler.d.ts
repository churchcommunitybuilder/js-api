import { AxiosRequestConfig, AxiosInstance } from 'axios';
import { AnyFunc } from '@churchcommunitybuilder/js-utils/types';
export declare const createOAuthHandler: (clientId: string, clientSecret: string, getTokens: AnyFunc<any>, setTokens: AnyFunc<any>) => {
    onAuthFailure: () => any;
    onHandleRefresh: (api: AxiosInstance) => Promise<void>;
    apiInterceptor: (config: AxiosRequestConfig) => Promise<any>;
};
