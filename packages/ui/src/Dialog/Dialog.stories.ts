import type { Meta, StoryObj } from '@storybook/vue3'
import Dialog from './Dialog.vue'

const meta: Meta<typeof Dialog> = { title: 'UI/Dialog', component: Dialog }
export default meta

export const Open: StoryObj<typeof Dialog> = {
  render: () => ({
    components: { Dialog },
    template: '<Dialog :open="true" title="Version conflict">Server has a newer value.</Dialog>',
  }),
}
