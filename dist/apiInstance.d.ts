import { AxiosRequestConfig } from 'axios';
export declare const createApiInstance: (baseURL: string, timeout: number, apiInterceptor?: (value: AxiosRequestConfig) => AxiosRequestConfig | Promise<AxiosRequestConfig>, headers?: {}) => import("axios").AxiosInstance;
