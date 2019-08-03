import axios from 'axios';
import buildURL from 'axios/lib/helpers/buildURL';
import { camelizeKeys, decamelizeKeys } from 'humps';
const paramsSerializer = (obj) => buildURL('', decamelizeKeys(obj), null).slice(1);
export const createApiInstance = (baseURL, timeout, apiInterceptor, headers = {}) => {
    const apiInstance = axios.create({
        baseURL,
        timeout,
        transformRequest: [
            request => request instanceof FormData ? request : decamelizeKeys(request),
            ...axios.defaults.transformRequest,
        ],
        transformResponse: [
            ...axios.defaults.transformResponse,
            camelizeKeys,
        ],
        paramsSerializer,
        headers: Object.assign({}, headers, { Accept: 'application/vnd.ccbchurch.v2+json' }),
    });
    if (apiInterceptor !== undefined) {
        apiInstance.interceptors.request.use(apiInterceptor);
    }
    return apiInstance;
};
//# sourceMappingURL=apiInstance.js.map