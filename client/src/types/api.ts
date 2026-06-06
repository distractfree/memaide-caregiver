export interface ApiSuccess<T> {
  success: true
  data: T
  pagination?: Pagination
}

export interface ApiErrorBody {
  status: 'error'
  message: string
  code?: string
  details?: Record<string, unknown>
}

export interface Pagination {
  total: number
  page: number
  limit: number
  totalPages: number
}
