import { getWeatherForecast } from '../../utils/weather'

export default defineEventHandler(() => {
  return getWeatherForecast()
})
