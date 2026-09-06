<script setup lang="ts">
import type { Column } from '@atlas/domain'
import { AtlasSelect, booleanSelectOptions, selectOptions } from '@atlas/ui'
import { useCellEditor } from '~/composables/useCellEditor'
import TextEditor from './TextEditor.vue'
import NumberEditor from './NumberEditor.vue'
import DateEditor from './DateEditor.vue'

const props = defineProps<{ column: Column }>()
const editor = useCellEditor()

const selectValue = computed(() => String(editor.editing.value?.value ?? ''))
const booleanOptions = [
  { value: '', label: '—' },
  ...booleanSelectOptions(),
]
const booleanValue = computed(() => {
  const value = editor.editing.value?.value
  if (value === null || value === undefined) return ''
  return value ? 'true' : 'false'
})
const columnSelectOptions = computed(() => selectOptions(props.column.options ?? []))
const fieldLabel = computed(() => props.column.name)
const invalid = computed(() => Boolean(editor.error.value))

const commitSelect = (value: string) => {
  editor.setValue(value)
  editor.commitEditing()
}

const commitBoolean = (value: string) => {
  if (value === '') editor.setValue(null)
  else editor.setValue(value === 'true')
  editor.commitEditing()
}
</script>

<template>
  <NumberEditor
    v-if="column.type === 'number'"
    :model-value="editor.editing.value?.value ?? null"
    :aria-label="fieldLabel"
    :invalid="invalid"
    @commit="editor.commitEditing()"
    @cancel="editor.cancelEditing()"
    @update="editor.setValue($event)"
  />
  <AtlasSelect
    v-else-if="column.type === 'boolean'"
    data-testid="cell-editor"
    size="sm"
    :model-value="booleanValue"
    :options="booleanOptions"
    :aria-label="fieldLabel"
    :aria-invalid="invalid || undefined"
    @update:model-value="commitBoolean"
    @keydown.esc.prevent="editor.cancelEditing()"
  />
  <DateEditor
    v-else-if="column.type === 'date'"
    :model-value="editor.editing.value?.value ?? null"
    :aria-label="fieldLabel"
    :invalid="invalid"
    @commit="editor.commitEditing()"
    @cancel="editor.cancelEditing()"
    @update="editor.setValue($event)"
  />
  <AtlasSelect
    v-else-if="column.type === 'select'"
    data-testid="cell-editor"
    size="sm"
    :model-value="selectValue"
    :options="columnSelectOptions"
    :aria-label="fieldLabel"
    :aria-invalid="invalid || undefined"
    @update:model-value="commitSelect"
    @keydown.esc.prevent="editor.cancelEditing()"
  />
  <TextEditor
    v-else
    :model-value="editor.editing.value?.value ?? null"
    :aria-label="fieldLabel"
    :invalid="invalid"
    @commit="editor.commitEditing()"
    @cancel="editor.cancelEditing()"
    @update="editor.setValue($event)"
  />
</template>
