"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalWorkflowUpdatedTrigger = void 0;
const diff_1 = require("../lib/diff");
/**
 * A global trigger node that polls the internal n8n REST API
 * and emits an item when any workflow in the instance has been updated.
 *
 * Uses /api/v1/workflows endpoints.
 * Supports optional httpBasicAuth and httpHeaderAuth credentials.
 */
class GlobalWorkflowUpdatedTrigger {
    constructor() {
        this.description = {
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
                    description: 'Internal base URL for the n8n REST API (usually http://localhost:5678 inside Docker).',
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
    }
    async trigger() {
        const baseUrl = this.getNodeParameter('baseUrl', 0).replace(/\/+$/, '');
        const intervalSeconds = this.getNodeParameter('intervalSeconds', 0);
        const excludeRegexStr = this.getNodeParameter('excludeRegex', 0) || '';
        const emitFullWorkflow = this.getNodeParameter('emitFullWorkflow', 0);
        const requestTimeoutMs = this.getNodeParameter('requestTimeoutMs', 0);
        const maxPerCycle = this.getNodeParameter('maxPerCycle', 0);
        const excludeRegex = excludeRegexStr ? new RegExp(excludeRegexStr, 'i') : null;
        // Persistent global state
        const staticData = this.getWorkflowStaticData('global');
        if (!staticData.lastSync)
            staticData.lastSync = '1970-01-01T00:00:00.000Z';
        if (!staticData.seenMap)
            staticData.seenMap = {};
        // Helper to safely fetch credentials as the right type
        const tryGetCreds = async (name) => {
            try {
                const c = (await this.getCredentials(name));
                return (c ?? null);
            }
            catch {
                return null;
            }
        };
        const basic = await tryGetCreds('httpBasicAuth');
        const headerAuth = await tryGetCreds('httpHeaderAuth');
        const buildAuthHeaders = () => {
            const headers = { Accept: 'application/json' };
            if (basic) {
                const user = basic.user ?? '';
                const password = basic.password ?? '';
                const token = Buffer.from(`${user}:${password}`).toString('base64');
                headers.Authorization = `Basic ${token}`;
            }
            if (headerAuth) {
                // Built-in httpHeaderAuth typically exposes "name" and "value"
                const name = headerAuth.name || 'X-N8N-API-KEY';
                const value = headerAuth.value || '';
                if (value)
                    headers[name] = value;
            }
            return headers;
        };
        const requestJson = async (path) => {
            const options = {
                method: 'GET',
                uri: `${baseUrl}${path}`,
                json: true,
                timeout: requestTimeoutMs,
                headers: buildAuthHeaders(),
            };
            return this.helpers.request(options);
        };
        const getAllWorkflows = async () => {
            // /api/v1/workflows may return an array or { data: [...] } depending on version/build
            const res = await requestJson('/api/v1/workflows');
            return Array.isArray(res) ? res : res?.data ?? [];
        };
        const getWorkflow = async (id) => {
            const res = await requestJson(`/api/v1/workflows/${encodeURIComponent(String(id))}`);
            return res?.data ?? res;
        };
        let active = true;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const loop = async () => {
            while (active) {
                try {
                    const list = await getAllWorkflows();
                    const lastSyncDateIso = staticData.lastSync;
                    const toEmit = [];
                    for (const wf of list) {
                        if (!wf || wf.id == null)
                            continue;
                        const id = String(wf.id);
                        const name = wf.name ?? `workflow-${id}`;
                        if (excludeRegex && excludeRegex.test(name))
                            continue;
                        // Support possible keys for updated time
                        const updatedAtIso = wf.updatedAt ?? wf.updated_at ?? undefined;
                        const seenAtIso = staticData.seenMap[id];
                        if ((0, diff_1.shouldEmit)({
                            updatedAtIso,
                            lastSyncIso: lastSyncDateIso,
                            seenAtIso,
                        })) {
                            const payload = { id, name, updatedAt: updatedAtIso };
                            if (emitFullWorkflow) {
                                try {
                                    const full = await getWorkflow(id);
                                    const fullData = full?.data ?? full;
                                    if (fullData)
                                        payload.workflow = fullData;
                                }
                                catch {
                                    // ignore detailed fetch errors
                                }
                            }
                            toEmit.push({ json: payload });
                            if (maxPerCycle > 0 && toEmit.length >= maxPerCycle)
                                break;
                        }
                    }
                    if (toEmit.length) {
                        this.emit([toEmit]);
                        const nowIso = new Date().toISOString();
                        staticData.lastSync = nowIso;
                        for (const item of toEmit) {
                            staticData.seenMap[String(item.json.id)] = item.json.updatedAt;
                        }
                    }
                }
                catch (err) {
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
exports.GlobalWorkflowUpdatedTrigger = GlobalWorkflowUpdatedTrigger;
