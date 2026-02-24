import { OfficeState } from './engine/officeState'

export interface SubagentInfo {
  toolId: string
  label: string
}

export interface AgentActivity {
  agentId: string
  name: string
  emoji: string
  state: 'idle' | 'working' | 'waiting' | 'offline'
  currentTool?: string
  toolStatus?: string
  lastActive: number
  subagents?: SubagentInfo[]
}

/** Track which subagent toolIds were active last sync, per parent agent */
const prevSubagentKeys = new Map<string, Set<string>>()

export function syncAgentsToOffice(
  activities: AgentActivity[],
  office: OfficeState,
  agentIdMap: Map<string, number>,
  nextIdRef: { current: number },
): void {
  const currentAgentIds = new Set(activities.map(a => a.agentId))

  // Remove agents that are no longer present
  for (const [agentId, charId] of agentIdMap) {
    if (!currentAgentIds.has(agentId)) {
      office.removeAllSubagents(charId)
      office.removeAgent(charId)
      agentIdMap.delete(agentId)
      prevSubagentKeys.delete(agentId)
    }
  }

  for (const activity of activities) {
    if (activity.state === 'offline') {
      if (agentIdMap.has(activity.agentId)) {
        const charId = agentIdMap.get(activity.agentId)!
        office.removeAllSubagents(charId)
        office.removeAgent(charId)
        agentIdMap.delete(activity.agentId)
        prevSubagentKeys.delete(activity.agentId)
      }
      continue
    }

    let charId = agentIdMap.get(activity.agentId)
    if (charId === undefined) {
      charId = nextIdRef.current++
      agentIdMap.set(activity.agentId, charId)
      office.addAgent(charId)
    }

    // Set label (agent name or id)
    const ch = office.characters.get(charId)
    if (ch) {
      ch.label = activity.name || activity.agentId
    }

    switch (activity.state) {
      case 'working':
        office.setAgentActive(charId, true)
        office.setAgentTool(charId, activity.currentTool || null)
        break
      case 'idle':
        office.setAgentActive(charId, false)
        office.setAgentTool(charId, null)
        break
      case 'waiting':
        office.setAgentActive(charId, true)
        office.showWaitingBubble(charId)
        break
    }

    // Sync subagents
    const currentSubKeys = new Set<string>()
    if (activity.subagents) {
      for (const sub of activity.subagents) {
        currentSubKeys.add(sub.toolId)
        const existingSubId = office.getSubagentId(charId, sub.toolId)
        if (existingSubId === null) {
          const subId = office.addSubagent(charId, sub.toolId)
          office.setAgentActive(subId, true)
        }
      }
    }

    // Remove subagents that are no longer active
    const prevKeys = prevSubagentKeys.get(activity.agentId)
    if (prevKeys) {
      for (const toolId of prevKeys) {
        if (!currentSubKeys.has(toolId)) {
          office.removeSubagent(charId, toolId)
        }
      }
    }
    prevSubagentKeys.set(activity.agentId, currentSubKeys)
  }
}
