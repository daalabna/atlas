export const isTransportBusy = (input: {
  writesBlocked: boolean
  workspaceLoading: boolean
  pendingCount: number
}) => input.writesBlocked || input.workspaceLoading || input.pendingCount > 0
