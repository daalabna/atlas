import type { Preview } from '@storybook/vue3'
import '../src/styles/tokens.css'

const preview: Preview = {
  parameters: {
    backgrounds: { default: 'atlas', values: [{ name: 'atlas', value: '#0b0d12' }] },
  },
}

export default preview
