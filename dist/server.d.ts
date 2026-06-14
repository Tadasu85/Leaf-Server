import { Server as SocketIOServer } from 'socket.io';
declare const app: import("express-serve-static-core").Express;
declare const server: import("node:http").Server<typeof import("node:http").IncomingMessage, typeof import("node:http").ServerResponse>;
declare const io: SocketIOServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
declare const cleanup: () => void;
export { cleanup };
export { app, server, io };
//# sourceMappingURL=server.d.ts.map