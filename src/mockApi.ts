import { BasicOAuthApi } from './BasicOAuthApi'
import { RequestConfig } from './types'

const mockApiResponse = (data = {}, error = false) => ({
  data,
  error,
})

export interface MockRequest {
  data?: any
  error?: boolean
  url?: string | null
  method?: RequestConfig['method'] | null
  mapData?: (request: RequestConfig) => any
}

export const getMockApi = () => {
  let mockRequests: MockRequest[] = []
  const requestMock = jest.fn().mockImplementation((request: RequestConfig) => {
    const mockRequest = mockRequests.find(
      ({ url, method }) =>
        (!url || request.url === url) && (!method || request.method === method),
    )

    if (mockRequest) {
      if (mockRequest.error) {
        throw Error()
      }

      return mockApiResponse(mockRequest.mapData?.(request) ?? mockRequest.data)
    }

    return mockApiResponse()
  })

  const api = new BasicOAuthApi({
    clientCredentials: {
      clientId: 'clientId',
      clientSecret: 'clientSecret',
    },
    performRequest: requestMock,
    getTokens: () => ({
      accessToken: 'access',
      refreshToken: 'refresh',
    }),
    setTokens: () => {},
    onAuthFailure: () => {},
  })

  return Object.assign(api, {
    requestMock,
    mockResponse(mockRequest: MockRequest) {
      mockRequests = [mockRequest, ...mockRequests]

      return this
    },
    mockError(mockRequest?: MockRequest) {
      mockRequests = [{ ...(mockRequest ?? {}), error: true }, ...mockRequests]

      return this
    },
  })
}

export type MockApi = ReturnType<typeof getMockApi>
