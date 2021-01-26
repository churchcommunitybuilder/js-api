import { delay } from '../delay'

import { PushpayJwtApi } from '../PushpayJwtApi'
import { BasicOAuthApi } from '../BasicOAuthApi'

const url = 'testUrl'

const originalTokens = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
}

const newTokens = {
  accessToken: 'newAccessToken',
  refreshToken: 'newRefreshToken',
}

const defaultHeaders = {
  headers: {
    Authorization: 'Bearer accessToken',
  },
}

const defaultData = { data: 'data' }
const clientCredentials = { clientId: 'clientId', clientSecret: 'clientSecret' }
const jwtAuthContext = {
  authToken: 'authToken',
  orgKey: 'orgKey',
}

const getSharedMocks = (tokens = originalTokens) => {
  const performRequest = jest.fn()

  let mutableTokens = tokens
  const getTokens = jest.fn(() => mutableTokens)
  const setTokens = jest.fn(tokens => {
    mutableTokens = tokens
  })
  const onAuthFailure = jest.fn()

  return {
    performRequest,
    onAuthFailure,
    getTokens,
    setTokens,
  }
}

const instantiateBasicOauth = (
  tokens = originalTokens,
  getDefaultConfig?: any,
) => {
  const mocks = getSharedMocks(tokens)

  const api = new BasicOAuthApi({
    clientCredentials,
    getDefaultConfig,
    ...mocks,
  })

  return {
    api,
    ...mocks,
  }
}

const instantiatePushpayJwt = () => {
  const mocks = getSharedMocks()

  const api = new PushpayJwtApi({
    getJwtAuthContext: () => jwtAuthContext,
    ...mocks,
  })

  return {
    api,
    ...mocks,
  }
}

describe('Api', () => {
  test('should narrow the types for success/error', async () => {
    const { api, performRequest } = instantiateBasicOauth()

    const successData = { x: 1 }
    const errorData = { y: 2 }
    performRequest.mockResolvedValueOnce({ data: successData })
    const successResponse = await api.get<typeof successData, typeof errorData>(
      {
        url: '',
      },
    )

    const successExpecation = successResponse.error
      ? successResponse.data.y
      : successResponse.data.x

    expect(successExpecation).toBe(successData.x)

    performRequest.mockRejectedValueOnce({ data: { y: 2 } })
    const errorResponse = await api.get<typeof successData, typeof errorData>({
      url: '',
    })

    const errorExpectation = errorResponse.error
      ? errorResponse.data.y
      : errorResponse.data.x

    expect(errorExpectation).toBe(errorData.y)
  })

  describe('when there are no pending refresh requests', () => {
    describe('when the request is successful', () => {
      test('should return the formatted response', async () => {
        const { api, performRequest } = instantiateBasicOauth()

        performRequest.mockResolvedValueOnce(defaultData)

        const response = await api.get(url)

        expect(performRequest).toHaveBeenCalledTimes(1)
        expect(response).toEqual({
          ...defaultData,
          error: false,
        })
      })
    })

    describe('when the request is unsuccessful', () => {
      describe('when the response is authenticated or we are requesting a token', () => {
        test('should return the formatted error', async () => {
          const { api, performRequest } = instantiateBasicOauth()

          const data = {
            message: 'error',
            response: {
              status: 403,
            },
          }

          performRequest.mockRejectedValue(data)

          const response = await api.get(url)

          expect(performRequest).toHaveBeenCalledTimes(1)
          expect(response).toEqual({
            ...data,
            error: true,
          })
        })
      })

      describe('when the response is not authenticated and we are not requesting a token', () => {
        test('should execute the request after refreshing the token', async () => {
          const { api, performRequest, getTokens } = instantiateBasicOauth()

          performRequest
            .mockRejectedValueOnce({
              response: {
                status: 401,
              },
            })
            .mockResolvedValueOnce({ data: newTokens })
            .mockResolvedValueOnce(defaultData)

          const response = await api.get(url)

          expect(performRequest).toHaveBeenCalledTimes(4)

          expect(getTokens()).toEqual(newTokens)
          expect(performRequest).toHaveBeenNthCalledWith(2, {
            method: 'post',
            url: 'oauth/token',
            data: {
              refreshToken: originalTokens.refreshToken,
              grantType: 'refresh_token',
              ...clientCredentials,
            },
            headers: { Authorization: `Bearer ${originalTokens.accessToken}` },
          })

          expect(response).toEqual({
            ...defaultData,
            error: false,
          })
        })
      })
    })
  })

  describe('when there is a pending refresh request', () => {
    const testQueuedRequest = async (shouldHaveError: boolean) => {
      const { api, performRequest } = instantiateBasicOauth()

      // set up mock to force a refresh
      performRequest
        /* initial request fails */
        .mockRejectedValueOnce({
          response: {
            status: 401,
          },
        })
        /* refresh request takes two ms */
        .mockImplementationOnce(async () => {
          await delay(2)
          return { data: newTokens }
        })
        /* initial request retries successfully */
        .mockResolvedValueOnce({})

      // Send a request while refreshing
      if (shouldHaveError) {
        performRequest.mockRejectedValueOnce(defaultData)
      } else {
        performRequest.mockResolvedValueOnce(defaultData)
      }

      // execute request to force a refresh (without awaiting it)
      api.get(url)

      await delay(1)

      // execute request that should be queued until done refreshing
      const response = await api.get(url)

      expect(response).toEqual({
        ...defaultData,
        error: shouldHaveError,
      })
    }

    test('should queue the request', async () => {
      await testQueuedRequest(false)
    })

    test('should return with error when the queued request rejects', async () => {
      await testQueuedRequest(true)
    })

    test('should only send one refresh request when multiple fail at the same time', async () => {
      const { api, performRequest } = instantiateBasicOauth()

      performRequest
        /* initial request fails */
        .mockRejectedValue({
          response: {
            status: 401,
          },
        })

      await Promise.all([api.get(url), api.get(url)])

      const refreshes = performRequest.mock.calls.filter(
        ([{ url }]) => url === 'oauth/token',
      )

      expect(refreshes).toHaveLength(1)
    })
  })

  describe('when the refresh request fails', () => {
    test('should call the onAuthFailure handler', async () => {
      const { api, performRequest, onAuthFailure } = instantiateBasicOauth()
      performRequest
        /* initial request fails */
        .mockRejectedValueOnce({
          response: {
            status: 401,
          },
        })
        /* refresh request fails */
        .mockRejectedValueOnce({})

      await api.get(url)

      expect(onAuthFailure).toHaveBeenCalledTimes(1)
    })
  })

  describe('when a refresh is attempted without a refresh token', () => {
    test('should cancel pending requests', async () => {
      const { api, performRequest } = instantiateBasicOauth()

      performRequest
        /* initial request fails */
        .mockRejectedValueOnce({
          response: {
            status: 401,
          },
        })

      const response = await api.get(url)

      expect(response.error).toBe(true)
    })
  })

  test('should apply the default config to each request', async () => {
    const { api, performRequest } = instantiateBasicOauth(undefined, () => ({
      baseURL: 'http://new-default.com',
    }))

    await api.post('test')

    expect(performRequest).toHaveBeenCalledWith({
      baseURL: 'http://new-default.com',
      ...defaultHeaders,
      method: 'post',
      url: 'test',
    })
  })

  test('should be able to use both overloads of wrapped request methods', async () => {
    const { api, performRequest } = instantiateBasicOauth()

    await api.get({ url: 'get-url' })
    await api.post({ url: 'post-url' })
    await api.put({ url: 'put-url' })
    await api.delete({ url: 'delete-url' })

    expect(performRequest).toHaveBeenCalledWith({
      ...defaultHeaders,
      method: 'get',
      url: 'get-url',
    })

    expect(performRequest).toHaveBeenCalledWith({
      ...defaultHeaders,
      method: 'post',
      url: 'post-url',
    })

    expect(performRequest).toHaveBeenCalledWith({
      ...defaultHeaders,
      method: 'put',
      url: 'put-url',
    })

    expect(performRequest).toHaveBeenCalledWith({
      ...defaultHeaders,
      method: 'delete',
      url: 'delete-url',
    })
  })

  describe('#authenticate', () => {
    describe('when the authStrategy is basicOAuth', () => {
      const params = {
        password: 'password',
        username: 'username',
        subdomain: 'subdomain',
      }

      test('should be able to authenticate', async () => {
        const { api, performRequest, getTokens } = instantiateBasicOauth()
        performRequest.mockResolvedValueOnce({ data: newTokens })

        const { error, data } = await api.authenticate('password', params)

        expect(error).toBe(false)
        expect(data).toBe(newTokens)
        expect(getTokens()).toBe(newTokens)
        expect(performRequest).toHaveBeenCalledWith({
          ...defaultHeaders,
          method: 'post',
          url: 'oauth/token',
          data: {
            ...clientCredentials,
            ...params,
            grantType: 'password',
          },
        })
      })

      test('should call onAuthFailure when the request fails', async () => {
        const { api, performRequest, onAuthFailure } = instantiateBasicOauth()
        const errorResponse = { data: { message: 'failure' } }

        performRequest.mockRejectedValueOnce(errorResponse)

        const { error, data } = await api.authenticate('password', params)

        expect(error).toBe(true)
        expect(data).toBe(errorResponse.data)
        expect(onAuthFailure).toHaveBeenCalledWith(errorResponse)
      })
    })

    describe('when the authStrategy is pushpayJwt', () => {
      test('should be able to authenticate', async () => {
        const { api, performRequest, getTokens } = instantiatePushpayJwt()
        performRequest.mockResolvedValueOnce({ data: newTokens })

        const response = await api.authenticate()

        // ensure that types are correct for error statuses
        if (response.error) {
          response.data.errors[0]
        } else {
          response.data.accessToken
        }

        expect(response.error).toBe(false)
        expect(response.data).toBe(newTokens)
        expect(getTokens()).toBe(newTokens)
        expect(performRequest).toHaveBeenCalledWith({
          method: 'post',
          url: 'internal/identity',
          data: {
            organizationKey: jwtAuthContext.orgKey,
          },
          headers: {
            Authorization: `Bearer ${jwtAuthContext.authToken}`,
          },
        })
      })

      test('should be return errors', async () => {
        const { api, performRequest } = instantiatePushpayJwt()
        const errors = {
          errors: [{ type: 'ERROR', message: 'message ' }],
        }
        performRequest.mockRejectedValueOnce({
          data: errors,
        })

        const response = await api.authenticate()

        expect(response.error).toBe(true)
        expect(response.data).toBe(errors)
      })
    })
  })
})
