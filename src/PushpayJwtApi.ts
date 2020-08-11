import { BaseApi, BaseApiOptions } from './BaseApi'
import { JwtAuthContext } from './types'

interface PushpayJwtOptions extends BaseApiOptions {
  getJwtAuthContext: () => Promise<JwtAuthContext> | JwtAuthContext
}

export class PushpayJwtApi extends BaseApi<PushpayJwtOptions> {
  protected getAuthUrl() {
    return 'internal/identity'
  }

  async authenticate() {
    const context = await this.options.getJwtAuthContext()

    if (!context.authToken || !context.orgKey) {
      return false
    }

    return this.executeTokenRequest(
      { organizationKey: context.orgKey },
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
