import { Server as SocketIOServer } from 'socket.io';
import { Socket } from 'socket.io';
import { UserServiceInterface, UserSession, UserServiceStatus, Logger } from '../types';
declare class UserService implements UserServiceInterface {
    private io;
    private logger;
    private connectedUsers;
    private socketToUser;
    private userSessions;
    constructor(io: SocketIOServer, logger: Logger);
    handleConnection(socket: Socket): void;
    handleDisconnection(socket: Socket): void;
    registerUser(socket: Socket, username: string): boolean;
    unregisterUser(username: string): boolean;
    getUserBySocket(socketId: string): string | undefined;
    getSocketByUser(username: string): Socket | null;
    isUserOnline(username: string): boolean;
    getOnlineUsers(): string[];
    getUserSession(username: string): UserSession | undefined;
    getAllSessions(): UserSession[];
    filterAdminAccounts(users: string[]): string[];
    broadcastUserStatus(username: string, isOnline: boolean): void;
    getConnectedUsersCount(): number;
    getStatus(): UserServiceStatus;
    cleanupOldSessions(maxAge?: number): void;
}
export default UserService;
//# sourceMappingURL=UserService.d.ts.map