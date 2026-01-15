declare module 'byte-size' {
    interface ByteSizeResult {
        value: string;
        unit: string;
        long: string;
        toString: () => string;
    }
    function byteSize(bytes: number, options?: any): ByteSizeResult;
    export = byteSize;
}
