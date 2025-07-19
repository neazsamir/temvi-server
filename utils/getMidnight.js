const getMidnight = (timezone = 'UTC') => {
  const now = new Date()
  const current = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const endOfDay = new Date(current)
  endOfDay.setHours(23, 59, 59, 999)

  const diff = Math.ceil((endOfDay - current) / 1000) // in seconds
  return diff > 0 ? diff : 1 // avoid zero or negative TTL
}

export default getMidnight;