import Api from './Api';
import { createApiInstance } from './apiInstance';
import { createOAuthHandler as _createOAuthHandler } from './createOAuthHandler';
const defaultTimeout = 20000;
export var ApiMethod;
(function (ApiMethod) {
    ApiMethod["GET"] = "get";
    ApiMethod["POST"] = "post";
    ApiMethod["PUT"] = "put";
    ApiMethod["DELETE"] = "delete";
})(ApiMethod || (ApiMethod = {}));
let apiWrapper;
let api;
let applyDefaultMethod;
export const createApi = (baseURL, onAuthFailure, onHandleRefresh, apiInterceptor, timeout = defaultTimeout, headers = {}) => {
    const apiInstance = createApiInstance(baseURL, timeout, apiInterceptor, headers);
    apiWrapper = new Api(apiInstance, onAuthFailure, onHandleRefresh);
    applyDefaultMethod = (method) => (config) => apiWrapper.request(Object.assign({ method }, config));
    return {
        get: applyDefaultMethod(ApiMethod.GET),
        post: applyDefaultMethod(ApiMethod.POST),
        put: applyDefaultMethod(ApiMethod.PUT),
        delete: applyDefaultMethod(ApiMethod.DELETE),
        request: apiWrapper.request,
    };
};
export const createOAuthHandler = _createOAuthHandler;
//# sourceMappingURL=index.js.map