var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import R from 'ramda';
export default class Api {
    constructor(api, onAuthFailure, onHandleRefresh) {
        this.isRefreshing = false;
        this.queuedRequests = [];
        this.api = api;
        this.onAuthFailure = onAuthFailure;
        this.onHandleRefresh = onHandleRefresh;
    }
    formatResponse(response, error) {
        return Object.assign({}, response, { error });
    }
    queueRequest(config) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise(resolve => {
                this.queuedRequests = R.append({ config, resolve }, this.queuedRequests);
            });
        });
    }
    performQueuedRequests() {
        const requests = this.queuedRequests.map((request) => __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield this.api.request(request.config);
                request.resolve(this.formatResponse(response, false));
            }
            catch (e) {
                request.resolve(this.formatResponse(e, true));
            }
        }));
        Promise.all(requests);
    }
    cancelQueuedRequests() {
        this.queuedRequests.forEach(request => request.resolve({ error: true }));
        this.queuedRequests = [];
    }
    refreshTokens() {
        return __awaiter(this, void 0, void 0, function* () {
            this.isRefreshing = true;
            try {
                if (yield this.onHandleRefresh(this.api)) {
                    this.performQueuedRequests();
                }
                else {
                    this.cancelQueuedRequests();
                }
            }
            catch (e) {
                this.onAuthFailure();
                this.cancelQueuedRequests();
            }
            this.isRefreshing = false;
        });
    }
    request(config) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isRefreshing) {
                return this.queueRequest(config);
            }
            try {
                const response = yield this.api.request(config);
                return this.formatResponse(response, false);
            }
            catch (e) {
                if (R.pathEq(['response', 'status'], 401, e) &&
                    !config.url.includes('oauth/token')) {
                    const queuedRequest = this.queueRequest(config);
                    if (!this.isRefreshing) {
                        yield this.refreshTokens();
                    }
                    return queuedRequest;
                }
                return this.formatResponse(e, true);
            }
        });
    }
}
//# sourceMappingURL=Api.js.map