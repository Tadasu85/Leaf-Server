import { Socket } from 'socket.io';
export interface HiveConfig {
    nodes: string[];
}
export interface GameConfig {
    idName: string;
    account: string;
}
export interface ServerConfig {
    hive: HiveConfig;
    game: GameConfig;
    signalingServer: string;
    admins: string[];
    builders: string[];
}
export interface ChatChannel {
    players: string[];
    lastUpdated: number;
}
export interface ChatMessage {
    username: string;
    message: string;
    timestamp: number;
    channelId: string;
}
export interface EmoteMessage {
    username: string;
    emote: string;
    timestamp: number;
    channelId: string;
}
export interface PlayerJoinedEvent {
    username: string;
    players: string[];
    channelId: string;
}
export interface PlayerLeftEvent {
    username: string;
    players: string[];
    channelId: string;
}
export interface ChatChannelState {
    channelId: string;
    players: string[];
    lastUpdated: number;
}
export interface UserSession {
    username: string;
    connectedAt: number;
    lastSeen: number;
    isOnline: boolean;
    socketId: string;
}
export interface UserStatusEvent {
    username: string;
    isOnline: boolean;
    timestamp: number;
}
export interface ChatServiceStatus {
    activeChannels: number;
    connectedUsers: number;
    channels: string[];
}
export interface UserServiceStatus {
    connectedUsers: number;
    totalSessions: number;
    onlineUsers: string[];
    adminAccounts: string[];
}
export interface HealthCheckResponse {
    status: 'ok';
    timestamp: string;
    services: {
        chat: ChatServiceStatus;
        users: UserServiceStatus;
    };
}
export interface JoinChatChannelData {
    channelId: string;
}
export interface LeaveChatChannelData {
    channelId: string;
    username: string;
}
export interface ChatMessageData {
    channelId: string;
    message: string;
}
export interface EmoteData {
    channelId: string;
    emote: string;
}
export interface KeepaliveData {
    timestamp: number;
}
export interface RegisterData {
    username: string;
}
export interface RegisterResponse {
    success: boolean;
    message?: string;
}
export interface Logger {
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
}
export interface ChatServiceInterface {
    handleConnection(socket: Socket): void;
    handleDisconnection(socket: Socket): void;
    joinChannel(socket: Socket, data: JoinChatChannelData & {
        username: string;
    }): void;
    leaveChannel(socket: Socket, data: LeaveChatChannelData): void;
    handleMessage(socket: Socket, data: ChatMessageData & {
        username: string;
    }): void;
    handleEmote(socket: Socket, data: EmoteData & {
        username: string;
    }): void;
    handleKeepaliveResponse(socket: Socket): void;
    getChannelInfo(channelId: string): ChatChannel | null;
    getAllChannels(): [string, ChatChannel][];
    getStatus(): ChatServiceStatus;
}
export interface UserServiceInterface {
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
export declare function validateHiveConfig(config: HiveConfig): boolean;
export declare function validateGameConfig(config: GameConfig): boolean;
export declare function validateServerConfig(config: ServerConfig): boolean;
export declare function createDefaultChatChannel(channelId: string): ChatChannel;
export declare function createDefaultUserSession(username: string, socketId: string): UserSession;
//# sourceMappingURL=index.d.ts.map