var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as R from 'ramda';
export const createOAuthHandler = (clientId, clientSecret, getTokens, setTokens) => {
    return {
        onAuthFailure: () => setTokens({}),
        onHandleRefresh: (api) => __awaiter(this, void 0, void 0, function* () {
            const { refreshToken } = yield getTokens();
            if (!refreshToken) {
                return false;
            }
            const { data } = yield api.request({
                method: 'post',
                url: 'oauth/token',
                data: {
                    refreshToken,
                    grantType: 'refresh_token',
                    clientId,
                    clientSecret,
                },
            });
            yield setTokens(data);
            return true;
        }),
        apiInterceptor: (config) => __awaiter(this, void 0, void 0, function* () {
            const { accessToken } = yield getTokens();
            return accessToken
                ? R.assocPath(['headers', 'Authorization'], `Bearer ${accessToken}`, config)
                : config;
        }),
    };
};
//# sourceMappingURL=createOAuthHandler.js.map