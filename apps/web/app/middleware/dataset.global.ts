export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/datasets') return navigateTo('/datasets/customers')
})
