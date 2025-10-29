/**
 * Returns true if a workflow updatedAt should be emitted,
 * comparing against lastSync and a per-ID seenAt map.
 */
export declare function shouldEmit(params: {
    updatedAtIso: string | undefined;
    lastSyncIso: string;
    seenAtIso?: string;
}): boolean;
