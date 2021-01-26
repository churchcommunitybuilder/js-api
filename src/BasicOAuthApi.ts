import { BaseApi, BaseApiOptions } from './BaseApi'

interface BasicOAuthOptions extends BaseApiOptions {
  authStrategy?: 'basicOAuth'
  clientCredentials: {
    clientId: string
    clientSecret: string
  }
}

type GrantType = 'password' | 'client_credentials'
type AuthParams<G extends GrantType> = {
  subdomain: string
} & ('password' extends G ? { username: string; password: string } : {})

export class BasicOAuthApi extends BaseApi<BasicOAuthOptions> {
  protected getAuthUrl() {
    return 'oauth/token'
  }

  async authenticate<G extends GrantType>(grantType: G, params: AuthParams<G>) {
    return this.executeTokenRequest({
      grantType,
      ...params,
      ...this.options.clientCredentials,
    })
  }

  protected async refreshTokens() {
    const tokens = await this.options.getTokens({ url: this.getAuthUrl() })

    return this.executeTokenRequest({
      refreshToken: tokens?.refreshToken,
      grantType: 'refresh_token',
      ...this.options.clientCredentials,
    })
  }
}
