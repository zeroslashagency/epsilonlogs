export type MachineType = 'VMC' | 'CNC';

export interface MachineInfo {
    type: MachineType;
    label: string;
    supportsM30Completion?: boolean;
}

export const MACHINE_CONFIG: Record<number, MachineInfo> = {
    11: { type: 'VMC', label: 'VMC 1' },
    12: { type: 'VMC', label: 'VMC 2' },
    13: { type: 'VMC', label: 'VMC 3' },
    14: { type: 'VMC', label: 'VMC 4' },
    15: { type: 'VMC', label: 'VMC 5', supportsM30Completion: true },
    16: { type: 'VMC', label: 'VMC 6' },
    19: { type: 'VMC', label: 'VMC 7' },
    18: { type: 'CNC', label: 'CNC 1' },
};

export const VMC_MACHINES = Object.entries(MACHINE_CONFIG)
    .filter(([, info]) => info.type === 'VMC')
    .map(([id, info]) => ({ id: Number(id), ...info }))
    .sort((a, b) => a.id - b.id);

export const CNC_MACHINES = Object.entries(MACHINE_CONFIG)
    .filter(([, info]) => info.type === 'CNC')
    .map(([id, info]) => ({ id: Number(id), ...info }))
    .sort((a, b) => a.id - b.id);

export const ALL_MACHINES = [
    ...VMC_MACHINES,
    ...CNC_MACHINES,
];

export function getMachineInfo(deviceId: number): MachineInfo | null {
    return MACHINE_CONFIG[deviceId] ?? null;
}

export function getMachineLabel(deviceId: number): string {
    return MACHINE_CONFIG[deviceId]?.label ?? `Device ${deviceId}`;
}

export function getMachineType(deviceId: number): MachineType | null {
    return MACHINE_CONFIG[deviceId]?.type ?? null;
}

export function supportsM30Completion(deviceId: number): boolean {
    return MACHINE_CONFIG[deviceId]?.supportsM30Completion === true;
}
