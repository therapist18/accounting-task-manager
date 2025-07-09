export const CATEGORY_MAPPING = {
  company: "company-docs",
  individual: "directors-docs"
} as const

// Class D ID for understudy column
export const CLASS_D_ID = 1750687058159
export const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes cache
export const DEBOUNCE_DELAY = 300

export const cache = new Map()
export const getCachedData = (key: string) => {
  const item = cache.get(key)
  if (item && Date.now() - item.timestamp < CACHE_DURATION) {
    return item.data
  }
  cache.delete(key)
  return null
}

export const setCachedData = (key: string, data: any) => {
  cache.set(key, { data, timestamp: Date.now() })
}

export const debounce = (func: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout
  return (...args: any[]) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func.apply(null, args), delay)
  }
}

// Export configuration
export default {
  CATEGORY_MAPPING,
  CLASS_D_ID,
  CACHE_DURATION,
  DEBOUNCE_DELAY,
  cache,
  getCachedData,
  setCachedData,
  debounce
}
