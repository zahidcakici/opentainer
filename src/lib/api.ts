import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Define the interface for the API
export interface DockerStatusResponse {
    running: boolean;
    colima_installed: boolean;
    we_started: boolean;
    error?: string;
}

export interface AppApi {
    listContainers: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
    containerAction: (id: string, action: string) => Promise<{ success: boolean; error?: string }>;
    startLogs: (id: string, onData: (data: string) => void, options?: { timestamps?: boolean }) => () => void;
    startExec: (sessionId: string, cols: number, rows: number, onData: (data: string) => void, containerId: string) => {
        write: (data: string) => void;
        resize: (w: number, h: number) => void;
        dispose: () => void;
    };
    listImages: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
    removeImage: (id: string) => Promise<{ success: boolean; error?: string }>;
    pullImage: (
        imageName: string,
        onProgress: (p: any) => void,
        onEnd: (res: any) => void,
        onError: (err: string) => void
    ) => () => void;
    listVolumes: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
    removeVolume: (name: string) => Promise<{ success: boolean; error?: string }>;
    listNetworks: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
    getContainerStats: (id: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    getBatchStats: (ids: string[]) => Promise<{ success: boolean; data?: { id: string; success: boolean; data?: any; error?: string }[]; error?: string }>;
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
    getAppVersion: () => Promise<string>;
    // Docker lifecycle methods
    checkColimaInstalled: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
    checkDockerRunning: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
    getDockerStatus: () => Promise<{ success: boolean; data?: DockerStatusResponse; error?: string }>;
    startDocker: () => Promise<{ success: boolean; error?: string }>;
    waitForDocker: (timeoutSecs: number) => Promise<{ success: boolean; error?: string }>;
    getInstallInstructions: () => Promise<{ success: boolean; data?: string; error?: string }>;
}

export const api: AppApi = {
    getAppVersion: async () => invoke("get_app_version"),
    openExternal: async (url: string) => {
        try {
            await (window as any).__TAURI_PLUGIN_OPENER__.open(url);
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.toString() };
        }
    },
    listContainers: async () => invoke("list_containers"),
    containerAction: async (id: string, action: string) => invoke("container_action", { id, action }),
    getBatchStats: async (ids: string[]) => invoke("get_batch_stats", { ids }),
    listImages: async () => invoke("list_images"),
    listVolumes: async () => invoke("list_volumes"),
    listNetworks: async () => invoke("list_networks"),
    startLogs: (id: string, onData: (data: string) => void, options?: { timestamps?: boolean }) => {
        const sessionId = Math.random().toString(36).substring(7);
        const eventName = `logs-${sessionId}`;

        let unlisten: (() => void) | undefined;
        let active = true;

        const setup = async () => {
            const cleanup = await listen<string>(eventName, (event) => {
                if (active) onData(event.payload);
            });
            unlisten = cleanup;
            if (active) {
                await invoke("start_logs", { id, sessionId, options: options || {} });
            } else {
                cleanup();
            }
        };

        setup();

        return () => {
            active = false;
            if (unlisten) unlisten();
            invoke("stop_logs", { sessionId });
        };
    },
    startExec: (sessionId: string, _cols: number, _rows: number, onData: (data: string) => void, containerId: string) => {
        const eventName = `exec-${sessionId}`;
        let unlisten: (() => void) | undefined;
        let active = true;

        const setup = async () => {
            const cleanup = await listen<string>(eventName, (event) => {
                if (active) onData(event.payload);
            });
            unlisten = cleanup;
            if (active) {
                await invoke("start_exec", { sessionId, containerId });
            } else {
                cleanup();
            }
        };

        setup();

        return {
            write: (data: string) => {
                if (active) {
                    invoke("exec_input", { sessionId, data });
                }
            },
            resize: (_w: number, _h: number) => {
                // Resize not implemented yet - would require exec resize in Docker
            },
            dispose: () => {
                active = false;
                if (unlisten) unlisten();
                invoke("stop_exec", { sessionId });
            }
        };
    },
    removeImage: async (id: string) => invoke("remove_image", { id }),
    pullImage: (
        imageName: string,
        onProgress: (p: any) => void,
        onEnd: (res: any) => void,
        onError: (err: string) => void
    ) => {
        const sessionId = Math.random().toString(36).substring(7);
        const eventName = `pull-${sessionId}`;
        let unlisten: (() => void) | undefined;
        let active = true;

        const setup = async () => {
            const cleanup = await listen<any>(eventName, (event) => {
                if (active) onProgress(event.payload);
            });
            unlisten = cleanup;

            if (active) {
                try {
                    const res = await invoke<{ success: boolean; error?: string }>("pull_image", {
                        image: imageName,
                        sessionId
                    });

                    if (res.success) {
                        onEnd(res);
                    } else {
                        onError(res.error || "Unknown error");
                    }
                } catch (e: any) {
                    onError(e.toString());
                } finally {
                    cleanup();
                }
            } else {
                cleanup();
            }
        };

        setup();

        return () => {
            active = false;
            if (unlisten) unlisten();
            invoke("stop_pull", { sessionId });
        };
    },
    removeVolume: async (name: string) => invoke("remove_volume", { name }),
    getContainerStats: async () => ({ success: false, error: "Use getBatchStats instead" }),
    // Docker lifecycle methods
    checkColimaInstalled: async () => invoke("check_colima_installed"),
    checkDockerRunning: async () => invoke("check_docker_running"),
    getDockerStatus: async () => invoke("get_docker_status"),
    startDocker: async () => invoke("start_docker"),
    waitForDocker: async (timeoutSecs: number) => invoke("wait_for_docker", { timeoutSecs }),
    getInstallInstructions: async () => invoke("get_install_instructions"),
};
