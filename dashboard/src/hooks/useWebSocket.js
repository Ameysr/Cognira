/**
 * hooks/useWebSocket.js -- WebSocket Connection Hook
 */

import { useEffect, useRef, useCallback } from "react";
import useProjectStore from "../store/projectStore";

const WS_BASE_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3000";
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export default function useWebSocket(projectId) {
    const wsRef = useRef(null);
    const reconnectCountRef = useRef(0);
    const reconnectTimerRef = useRef(null);

    const setWsConnected = useProjectStore((s) => s.setWsConnected);
    const processEvent = useProjectStore((s) => s.processEvent);

    const connect = useCallback(() => {
        if (!projectId) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const url = `${WS_BASE_URL}/ws?projectId=${projectId}`;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => { setWsConnected(true); reconnectCountRef.current = 0; };
        ws.onmessage = (event) => { try { processEvent(JSON.parse(event.data)); } catch (e) { console.error("[WS] Parse error:", e); } };
        ws.onclose = (event) => {
            setWsConnected(false);
            wsRef.current = null;
            if (event.code !== 1000 && reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
                reconnectCountRef.current++;
                reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
            }
        };
        ws.onerror = (error) => { console.error("[WS] Error:", error); };
    }, [projectId, setWsConnected, processEvent]);

    const sendMessage = useCallback((msg) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
    }, []);

    const disconnect = useCallback(() => {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectCountRef.current = MAX_RECONNECT_ATTEMPTS;
        if (wsRef.current) { wsRef.current.close(1000, "User disconnect"); wsRef.current = null; }
        setWsConnected(false);
    }, [setWsConnected]);

    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (wsRef.current) wsRef.current.close(1000, "Component unmount");
        };
    }, [connect]);

    return { sendMessage, disconnect, connect };
}
