import type {
  ITriggerFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { shouldEmit } from '../lib/diff';

/**
 * A global trigger node that polls the internal n8n REST API
 * and emits an item when any workflow in the instance has been updated.
 *
 * Uses /api/v1/workflows endpoints.
 * Supports optional httpBasicAuth and httpHeaderAuth credentials.
 */
export class GlobalWorkflowUpdatedTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Global Workflow Updated Trigger',
    name: 'globalWorkflowUpdatedTrigger',
    group: ['trigger'],
    version: 1,
    description: 'Emits an item whenever any workflow in the n8n instance has been updated.',
    defaults: {
      name: 'Global Workflow Updated Trigger',
      color: '#ff6d5a',
    },
    icon: 'fa:globe',
    inputs: [],
    outputs: ['main'],
    credentials: [
      { name: 'httpBasicAuth', required: false },
      { name: 'httpHeaderAuth', required: false },
    ],
    properties: [
      {
        displayName: 'n8n Base URL',
        name: 'baseUrl',
        type: 'string',
        default: 'http://localhost:5678',
        description:
          'Internal base URL for the n8n REST API (usually http://localhost:5678 inside Docker).',
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
        description: 'Workflows matching this regex will be ignored.',
      },
      {
        displayName: 'Emit Full Workflow JSON',
        name: 'emitFullWorkflow',
        type: 'boolean',
        default: true,
        description: 'If true, includes the full workflow object.',
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
        description: 'Limits how many items are emitted per cycle (0 = unlimited).',
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

    // Persistent global state
    const staticData = this.getWorkflowStaticData('global') as {
      lastSync?: string;
      seenMap?: Record<string, string>;
    };
    if (!staticData.lastSync) staticData.lastSync = '1970-01-01T00:00:00.000Z';
    if (!staticData.seenMap) staticData.seenMap = {};

    // Optional Basic and Header Auth credentials
    let basic: ICredentialDataDecryptedObject | null = null;
    let headerAuth: ICredentialDataDecryptedObject | null = null;
    try {
      basic = await this.getCredentials('httpBasicAuth');
    } catch {
      basic = null;
    }
    try {
      headerAuth = await this.getCredentials('httpHeaderAuth');
    } catch {
      headerAuth = null;
    }

    const buildAuthHeaders = (): Record<string, string> => {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (basic) {
        const user = (basic.user as string) ?? '';
        const password = (basic.password as string) ?? '';
        const token = Buffer.from(`${user}:${password}`).toString('base64');
        headers.Authorization = `Basic ${token}`;
      }
      if (headerAuth) {
        // Built-in httpHeaderAuth typically exposes "name" and "value"
        const name = (headerAuth.name as string) || 'X-N8N-API-KEY';
        const value = (headerAuth.value as string) || '';
        if (value) headers[name] = value;
      }
      return headers;
    };

    const requestJson = async (path: string) => {
      const options = {
        method: 'GET',
        uri: `${baseUrl}${path}`,
        json: true,
        timeout: requestTimeoutMs,
        headers: buildAuthHeaders(),
      } as any;
      return this.helpers.request!(options);
    };

    const getAllWorkflows = async () => {
      // /api/v1/workflows may return an array or { data: [...] } depending on version/build
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

            // Support possible keys for updated time
            const updatedAtIso: string | undefined =
              wf.updatedAt ?? wf.updated_at ?? undefined;

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
                  const fullData = full?.data ?? full;
                  if (fullData) payload.workflow = fullData;
                } catch {
                  // ignore detailed fetch errors
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