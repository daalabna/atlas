export default defineNuxtPlugin((nuxtApp) => {
  const metrics = usePerformance()
  const onPageHide = () => metrics.pause()
  const onPageShow = () => metrics.resume()
  const removeListeners = () => {
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
  }

  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
  nuxtApp.vueApp.onUnmount(removeListeners)
  import.meta.hot?.dispose(removeListeners)
})
