/* istanbul ignore file */

import axios from 'axios'
import buildURL from 'axios/lib/helpers/buildURL'
import { camelizeKeys, decamelizeKeys } from 'humps'

const defaultTimeout = 20000
const paramsSerializer = (obj: {}) =>
  buildURL('', decamelizeKeys(obj), null).slice(1)

type Options = {
  baseURL: string
  timeout?: number
}

export const getAxiosInstance = ({
  baseURL,
  timeout = defaultTimeout,
}: Options) =>
  axios.create({
    baseURL,
    timeout,
    transformRequest: [
      request =>
        request instanceof FormData ? request : decamelizeKeys(request),
      ...(axios.defaults.transformRequest as any),
    ],
    transformResponse: [
      ...(axios.defaults.transformResponse as any),
      camelizeKeys,
    ],
    paramsSerializer,
    headers: {
      Accept: 'application/vnd.ccbchurch.v2+json',
    },
  })
