import { useState, useEffect } from 'react';
import byteSize from 'byte-size';
import { api } from '../lib/api';

export interface ContainerStats {
    cpu: string;
    mem: string;
}

interface StatsResponse {
    cpu_stats: {
        cpu_usage: { total_usage: number };
        system_cpu_usage: number;
        online_cpus?: number;
    };
    precpu_stats: {
        cpu_usage: { total_usage: number; percpu_usage?: number[] };
        system_cpu_usage: number;
    };
    memory_stats: {
        usage: number;
        stats?: { cache?: number };
    };
}

export function useBatchContainerStats(containerIds: string[]): Record<string, ContainerStats> {
    const [allStats, setAllStats] = useState<Record<string, ContainerStats>>({});

    useEffect(() => {
        if (!containerIds.length) {
            setAllStats({});
            return;
        }

        const fetchAllStats = async () => {
            const result = await api.getBatchStats(containerIds);
            if (!result.success || !result.data) return;

            const statsMap: Record<string, ContainerStats> = {};
            result.data.forEach((res) => {
                if (res.success && res.data) {
                    const s: StatsResponse = res.data;
                    let cpuPercent = 0.0;
                    const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
                    const systemDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
                    const numberCpus = s.cpu_stats.online_cpus || s.precpu_stats.cpu_usage.percpu_usage?.length || 1;

                    if (systemDelta > 0.0 && cpuDelta > 0.0) {
                        cpuPercent = (cpuDelta / systemDelta) * numberCpus * 100.0;
                    }

                    const memUsage = s.memory_stats.usage - (s.memory_stats.stats?.cache || 0);
                    statsMap[res.id] = {
                        cpu: `${cpuPercent.toFixed(2)}%`,
                        mem: byteSize(memUsage).toString()
                    };
                } else {
                    statsMap[res.id] = { cpu: '0%', mem: '0 B' };
                }
            });
            setAllStats(statsMap);
        };

        fetchAllStats();
        const interval = setInterval(fetchAllStats, 2000);

        return () => clearInterval(interval);
    }, [containerIds.join(',')]); // Use stringified array as dependency

    return allStats;
}
