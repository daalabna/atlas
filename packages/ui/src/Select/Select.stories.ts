import type { Meta, StoryObj } from '@storybook/vue3'
import Select from './Select.vue'

const meta: Meta<typeof Select> = { title: 'UI/Select', component: Select }
export default meta

export const Default: StoryObj<typeof Select> = {
  render: () => ({
    components: { Select },
    data: () => ({
      value: 'active',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'pending', label: 'Pending' },
      ],
    }),
    template: '<Select v-model="value" :options="options" />',
  }),
}
