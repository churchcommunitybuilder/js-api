import axios, { AxiosRequestConfig } from 'axios';
import buildURL from 'axios/lib/helpers/buildURL';
import { camelizeKeys, decamelizeKeys } from 'humps';

const paramsSerializer = (obj: {}) =>
  buildURL('', decamelizeKeys(obj), null).slice(1);

export const createApiInstance = (
  baseURL: string,
  timeout: number,
  apiInterceptor?: (
    value: AxiosRequestConfig,
  ) => AxiosRequestConfig | Promise<AxiosRequestConfig>,
  headers = {},
) => {
  const apiInstance = axios.create({
    baseURL,
    timeout,
    transformRequest: [
      request =>
        request instanceof FormData ? request : decamelizeKeys(request),
      ...(axios.defaults.transformRequest as any),
    ],
    transformResponse: [
      ...(axios.defaults.transformResponse as any),
      camelizeKeys,
    ],
    paramsSerializer,
    headers: {
      ...headers,
      Accept: 'application/vnd.ccbchurch.v2+json',
    },
  });

  if (apiInterceptor !== undefined) {
    apiInstance.interceptors.request.use(apiInterceptor);
  }

  return apiInstance;
};
