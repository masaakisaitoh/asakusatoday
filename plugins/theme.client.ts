export default defineNuxtPlugin(async () => {
  const colorMode = useColorMode()
  const { data: user } = await useFetch('/api/user/me', { key: 'current-user' })
  if (user.value?.theme) {
    colorMode.preference = user.value.theme
  }
})
