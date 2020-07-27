import { BaseApi, BaseApiOptions } from './BaseApi'

interface BasicOAuthOptions extends BaseApiOptions {
  authStrategy?: 'basicOAuth'
  clientCredentials: {
    clientId: string
    clientSecret: string
  }
}

export class BasicOAuthApi extends BaseApi<BasicOAuthOptions> {
  protected getAuthUrl() {
    return 'oauth/token'
  }

  async authenticate(params: {
    username: string
    password: string
    subdomain: string
  }) {
    return this.executeTokenRequest({
      grantType: 'password',
      ...params,
      ...this.options.clientCredentials,
    })
  }

  protected async refreshTokens() {
    const tokens = await this.options.getTokens({ url: this.getAuthUrl() })

    if (tokens?.refreshToken) {
      return this.executeTokenRequest({
        refreshToken: tokens?.refreshToken,
        grantType: 'refresh_token',
        ...this.options.clientCredentials,
      })
    }

    return false
  }
}
