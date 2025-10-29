import type {
  ITriggerFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { shouldEmit } from '../lib/diff';

/**
 * GlobalWorkflowUpdatedTrigger
 *
 * A polling trigger that checks the n8n internal REST API (/api/v1/workflows)
 * and emits an item when any workflow in the instance is updated.
 *
 * It supports authentication via the built-in n8nApi credentials.
 */
export class GlobalWorkflowUpdatedTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Global Workflow Updated Trigger',
    name: 'globalWorkflowUpdatedTrigger',
    group: ['trigger'],
    version: 1,
    description:
      'Emits an item whenever any workflow in the n8n instance has been updated.',
    defaults: {
      name: 'Global Workflow Updated Trigger',
      color: '#ff6d5a',
    },
    icon: 'fa:globe',
    inputs: [],
    outputs: ['main'],
    credentials: [
      { name: 'n8nApi', required: false },
    ],
    properties: [
      {
        displayName: 'n8n Base URL',
        name: 'baseUrl',
        type: 'string',
        default: 'http://localhost:5678',
        description:
          'Internal base URL for the n8n REST API (for example, http://localhost:5678 inside Docker).',
      },
      {
        displayName: 'Interval (seconds)',
        name: 'intervalSeconds',
        type: 'number',
        typeOptions: { minValue: 2, maxValue: 3600 },
        default: 10,
        description: 'How often to check for workflow updates.',
      },
      {
        displayName: 'Exclude by Name (Regex)',
        name: 'excludeRegex',
        type: 'string',
        default: '^(_|Backup|Global Workflow Updated Trigger)',
        description: 'Workflows whose names match this regular expression are ignored.',
      },
      {
        displayName: 'Emit Full Workflow JSON',
        name: 'emitFullWorkflow',
        type: 'boolean',
        default: true,
        description: 'If enabled, includes the full workflow object in the output.',
      },
      {
        displayName: 'Request Timeout (ms)',
        name: 'requestTimeoutMs',
        type: 'number',
        typeOptions: { minValue: 1000, maxValue: 60000 },
        default: 10000,
        description: 'Maximum wait time for each REST call.',
      },
      {
        displayName: 'Max Workflows per Cycle',
        name: 'maxPerCycle',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 10000 },
        default: 1000,
        description:
          'Limits how many items are emitted per polling cycle (0 = unlimited).',
      },
    ],
  };

  async trigger(this: ITriggerFunctions) {
    const baseUrl = (this.getNodeParameter('baseUrl', 0) as string).replace(/\/+$/, '');
    const intervalSeconds = this.getNodeParameter('intervalSeconds', 0) as number;
    const excludeRegexStr = (this.getNodeParameter('excludeRegex', 0) as string) || '';
    const emitFullWorkflow = this.getNodeParameter('emitFullWorkflow', 0) as boolean;
    const requestTimeoutMs = this.getNodeParameter('requestTimeoutMs', 0) as number;
    const maxPerCycle = this.getNodeParameter('maxPerCycle', 0) as number;

    const excludeRegex = excludeRegexStr ? new RegExp(excludeRegexStr, 'i') : null;

    const staticData = this.getWorkflowStaticData('global') as {
      lastSync?: string;
      seenMap?: Record<string, string>;
    };
    if (!staticData.lastSync) staticData.lastSync = '1970-01-01T00:00:00.000Z';
    if (!staticData.seenMap) staticData.seenMap = {};

    let n8nApiCreds: ICredentialDataDecryptedObject | null = null;
    try {
      n8nApiCreds = (await this.getCredentials('n8nApi')) as unknown as ICredentialDataDecryptedObject;
    } catch {
      n8nApiCreds = null;
    }

    const requestJson = async (path: string) => {
      const options = {
        method: 'GET',
        uri: `${baseUrl}${path}`,
        json: true,
        timeout: requestTimeoutMs,
        headers: { Accept: 'application/json' },
      } as any;

      if (n8nApiCreds && (this.helpers as any).requestWithAuthentication) {
        return (this.helpers as any).requestWithAuthentication.call(this, 'n8nApi', options);
      }

      return this.helpers.request!(options);
    };

    const getAllWorkflows = async () => {
      const res = await requestJson('/api/v1/workflows');
      return Array.isArray(res) ? res : res?.data ?? [];
    };

    const getWorkflow = async (id: string | number) => {
      const res = await requestJson(`/api/v1/workflows/${encodeURIComponent(String(id))}`);
      return res?.data ?? res;
    };

    let active = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const loop = async () => {
      while (active) {
        try {
          const list = await getAllWorkflows();
          const lastSyncDateIso = staticData.lastSync!;
          const toEmit: INodeExecutionData[] = [];

          for (const wf of list) {
            if (!wf || wf.id == null) continue;
            const id = String(wf.id);
            const name: string = wf.name ?? `workflow-${id}`;
            if (excludeRegex && excludeRegex.test(name)) continue;

            const updatedAtIso: string | undefined =
              wf.updatedAt ?? (wf as any).updated_at ?? undefined;

            const seenAtIso = staticData.seenMap![id];

            if (
              shouldEmit({
                updatedAtIso,
                lastSyncIso: lastSyncDateIso,
                seenAtIso,
              })
            ) {
              const payload: any = { id, name, updatedAt: updatedAtIso! };

              if (emitFullWorkflow) {
                try {
                  const full = await getWorkflow(id);
                  const fullData = (full as any)?.data ?? full;
                  if (fullData) payload.workflow = fullData;
                } catch {
                  // Ignore fetch errors for individual workflows
                }
              }

              toEmit.push({ json: payload });
              if (maxPerCycle > 0 && toEmit.length >= maxPerCycle) break;
            }
          }

          if (toEmit.length) {
            this.emit([toEmit]);
            const nowIso = new Date().toISOString();
            staticData.lastSync = nowIso;
            for (const item of toEmit) {
              staticData.seenMap![String(item.json.id)] = item.json.updatedAt as string;
            }
          }
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.error('[GlobalWorkflowUpdatedTrigger] error:', err?.message || err);
        }
        await sleep(intervalSeconds * 1000);
      }
    };

    void loop();
    const closeFunction = async () => {
      active = false;
    };
    return { closeFunction };
  }
}