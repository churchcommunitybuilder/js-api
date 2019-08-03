import { AxiosRequestConfig, AxiosInstance } from 'axios';
import * as R from 'ramda';
import { AnyFunc } from '@churchcommunitybuilder/js-utils/types';

export const createOAuthHandler = (
  clientId: string,
  clientSecret: string,
  getTokens: AnyFunc,
  setTokens: AnyFunc,
) => {
  return {
    onAuthFailure: () => setTokens({} as any),
    onHandleRefresh: async (api: AxiosInstance) => {
      const { refreshToken } = await getTokens();

      if (!refreshToken) {
      }
      const { data } = await api.request({
        method: 'post',
        url: 'oauth/token',
        data: {
          refreshToken,
          grantType: 'refresh_token',
          clientId,
          clientSecret,
        },
      });

      await setTokens(data);
    },
    apiInterceptor: async (config: AxiosRequestConfig) => {
      const { accessToken } = await getTokens();

      return accessToken
        ? R.assocPath(
            ['headers', 'Authorization'],
            `Bearer ${accessToken}`,
            config,
          )
        : config;
    },
  };
};
