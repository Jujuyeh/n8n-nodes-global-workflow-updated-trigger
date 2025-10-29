import type { ITriggerFunctions, INodeType, INodeTypeDescription } from 'n8n-workflow';
/**
 * A global trigger node that polls the internal n8n REST API
 * and emits an item when any workflow in the instance has been updated.
 *
 * Uses /api/v1/workflows endpoints.
 * Supports optional httpBasicAuth and httpHeaderAuth credentials.
 */
export declare class GlobalWorkflowUpdatedTrigger implements INodeType {
    description: INodeTypeDescription;
    trigger(this: ITriggerFunctions): Promise<{
        closeFunction: () => Promise<void>;
    }>;
}
