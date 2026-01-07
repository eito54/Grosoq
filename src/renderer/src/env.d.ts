/// <reference types="vite/client" />

interface Window {
    electron: {
        ipcRenderer: {
            on: (channel: string, func: (...args: any[]) => void) => () => void;
            once: (channel: string, func: (...args: any[]) => void) => void;
            send: (channel: string, ...args: any[]) => void;
            invoke: (channel: string, ...args: any[]) => Promise<any>;
        };
    };
    api: any;
}

declare module '*.png' {
    const value: string;
    export default value;
}

declare module '*.jpg' {
    const value: string;
    export default value;
}

declare module '*.svg' {
    const value: string;
    export default value;
}
