export interface Container {
    Id: string;
    Names: string[];
    Image: string;
    ImageID: string;
    Command: string;
    Created: number;
    Ports: Array<{
        IP?: string;
        PrivatePort: number;
        PublicPort?: number;
        Type: string;
    }>;
    Labels: Record<string, string>;
    State: string;
    Status: string;
    HostConfig: {
        NetworkMode: string;
    };
    NetworkSettings: {
        Networks: Record<string, any>;
    };
    Mounts: any[];
}

export interface Image {
    Id: string;
    ParentId: string;
    RepoTags: string[];
    RepoDigests: string[];
    Created: number;
    Size: number;
    VirtualSize: number;
    SharedSize: number;
    Labels: Record<string, string>;
    Containers: number;
}

export interface Volume {
    Name: string;
    Driver: string;
    Mountpoint: string;
    CreatedAt?: string;
    Status?: Record<string, any>;
    Labels: Record<string, string>;
    Scope: string;
    UsageData?: {
        Size: number;
        RefCount: number;
    };
}

export interface Network {
    Name: string;
    Id: string;
    Created: string;
    Scope: string;
    Driver: string;
    EnableIPv6: boolean;
    IPAM: {
        Driver: string;
        Options: any;
        Config: any[];
    };
    Internal: boolean;
    Attachable: boolean;
    Ingress: boolean;
    ConfigFrom: {
        Network: string;
    };
    ConfigOnly: boolean;
    Containers: Record<string, any>;
    Options: Record<string, string>;
    Labels: Record<string, string>;
}
