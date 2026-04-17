import type { Server } from "socket.io";

let _io: Server | null = null;

export const initSocket = (io: Server): void => {
	_io = io;
};

export const getSocket = (): Server => {
	if (!_io) throw new Error("Socket.io not initialized");
	return _io;
};
