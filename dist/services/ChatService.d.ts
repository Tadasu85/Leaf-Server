import { Server as SocketIOServer } from 'socket.io';
import { Socket } from 'socket.io';
import { ChatServiceInterface, ChatChannel, ChatServiceStatus, Logger, JoinChatChannelData, LeaveChatChannelData, ChatMessageData, EmoteData } from '../types';
declare class ChatService implements ChatServiceInterface {
    private io;
    private logger;
    private chatChannels;
    private socketToUser;
    private userToSocket;
    private cleanupInterval;
    private keepaliveRequests;
    private keepaliveTimeout;
    private keepaliveCheckInterval;
    constructor(io: SocketIOServer, logger: Logger);
    handleConnection(_socket: Socket): void;
    handleDisconnection(socket: Socket): void;
    private sendKeepaliveRequest;
    handleKeepaliveResponse(socket: Socket): void;
    private handleKeepaliveTimeout;
    private clearKeepaliveRequest;
    private getChannelsForUser;
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
    private removeUserFromChannel;
    private broadcastToChannel;
    getChannelInfo(channelId: string): ChatChannel | null;
    getAllChannels(): [string, ChatChannel][];
    private cleanupStalePlayers;
    getStatus(): ChatServiceStatus;
    cleanup(): void;
}
export default ChatService;
//# sourceMappingURL=ChatService.d.ts.map