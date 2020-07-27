import { BaseApi, BaseApiOptions } from './BaseApi'

interface PushpayJwtOptions extends BaseApiOptions {
  getJwtAuthContext: () => {
    authToken: string
    organizationKey: string
  }
}

export class PushpayJwtApi extends BaseApi<PushpayJwtOptions> {
  protected getAuthUrl() {
    return 'internal/identity'
  }

  async authenticate() {
    const context = await this.options.getJwtAuthContext()

    return this.executeTokenRequest(
      { organizationKey: context.organizationKey },
      context.authToken,
    )
  }

  protected async refreshTokens() {
    /**
     * for refreshes using pushpay jwt, we just reauthenticate to the same endpoint
     * and assume that the client will provide us updated auth context
     */
    return this.authenticate()
  }
}
