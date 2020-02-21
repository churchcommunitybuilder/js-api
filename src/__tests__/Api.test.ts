import { delay } from '../delay'

import { Api } from '../Api'

const url = 'testUrl'

const originalTokens = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
}

const newTokens = {
  accessToken: 'newAccessToken',
  refreshToken: 'newRefreshToken',
}

const defaultData = { data: 'data' }
const clientCredentials = { clientId: 'clientId', clientSecret: 'clientSecret' }

const instantiate = (tokens = originalTokens) => {
  const performRequest = jest.fn()

  let mutableTokens = tokens
  const getTokens = jest.fn(() => mutableTokens)
  const setTokens = jest.fn(tokens => {
    mutableTokens = tokens
  })
  const onAuthFailureMock = jest.fn()

  const api = new Api({
    clientCredentials,
    performRequest,
    getTokens,
    setTokens,
    onAuthFailure: onAuthFailureMock,
  })

  return {
    api,
    requestMock: performRequest,
    onAuthFailureMock,
    getTokens,
    setTokens,
  }
}

describe(Api.name, () => {
  describe('when there are no pending refresh requests', () => {
    describe('when the request is successful', () => {
      test('should return the formatted response', async () => {
        const { api, requestMock } = instantiate()

        requestMock.mockResolvedValueOnce(defaultData)

        const response = await api.get(url)

        expect(requestMock).toHaveBeenCalledTimes(1)
        expect(response).toEqual({
          ...defaultData,
          error: false,
        })
      })
    })

    describe('when the request is unsuccessful', () => {
      describe('when the response is authenticated or we are requesting a token', () => {
        test('should return the formatted error', async () => {
          const { api, requestMock } = instantiate()

          const data = {
            message: 'error',
            response: {
              status: 403,
            },
          }

          requestMock.mockRejectedValue(data)

          const response = await api.get(url)

          expect(requestMock).toHaveBeenCalledTimes(1)
          expect(response).toEqual({
            ...data,
            error: true,
          })
        })
      })

      describe('when the response is not authenticated and we are not requesting a token', () => {
        test('should execute the request after refreshing the token', async () => {
          const { api, requestMock, getTokens } = instantiate()

          requestMock
            .mockRejectedValueOnce({
              response: {
                status: 401,
              },
            })
            .mockResolvedValueOnce({ data: newTokens })
            .mockResolvedValueOnce(defaultData)

          const response = await api.get(url)

          expect(requestMock).toHaveBeenCalledTimes(3)

          expect(getTokens()).toEqual(newTokens)
          expect(requestMock).toHaveBeenNthCalledWith(2, {
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
      const { api, requestMock } = instantiate()

      // set up mock to force a refresh
      requestMock
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
        requestMock.mockRejectedValueOnce(defaultData)
      } else {
        requestMock.mockResolvedValueOnce(defaultData)
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
      const { api, requestMock } = instantiate()

      requestMock
        /* initial request fails */
        .mockRejectedValue({
          response: {
            status: 401,
          },
        })

      await Promise.all([api.get(url), api.get(url)])

      const refreshes = requestMock.mock.calls.filter(
        ([{ url }]) => url === 'oauth/token',
      )

      expect(refreshes).toHaveLength(1)
    })
  })

  describe('when the refresh request fails', () => {
    test('should call the onAuthFailure handler', async () => {
      const { api, requestMock, onAuthFailureMock } = instantiate()
      requestMock
        /* initial request fails */
        .mockRejectedValueOnce({
          response: {
            status: 401,
          },
        })
        /* refresh request fails */
        .mockRejectedValueOnce({})

      await api.get(url)

      expect(onAuthFailureMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('when a refresh is attempted without a refresh token', () => {
    test('should cancel pending requests', async () => {
      const { api, requestMock } = instantiate()

      requestMock
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
})
