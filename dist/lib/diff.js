"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldEmit = shouldEmit;
/**
 * Returns true if a workflow updatedAt should be emitted,
 * comparing against lastSync and a per-ID seenAt map.
 */
function shouldEmit(params) {
    if (!params.updatedAtIso)
        return false;
    const updatedAt = new Date(params.updatedAtIso);
    if (Number.isNaN(updatedAt.getTime()))
        return false;
    const lastSync = new Date(params.lastSyncIso || '1970-01-01T00:00:00.000Z');
    const seenAt = new Date(params.seenAtIso || '1970-01-01T00:00:00.000Z');
    return updatedAt > lastSync && updatedAt > seenAt;
}
