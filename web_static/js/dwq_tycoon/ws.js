/**
 * 大灣區大亨 — WebSocket 客戶端
 *
 * 對外介面: window.DwqApp.DwqSocket
 *
 * 使用:
 *   const ws = new DwqApp.DwqSocket('GBA7K2', token, onMessage, onStatusChange);
 *   ws.sendAction('move', {to: '深圳'});
 *   ws.close();
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};

    class DwqSocket {
        constructor(roomCode, token, onMessage, onStatusChange) {
            this.roomCode = roomCode;
            this.token = token;
            this.onMessage = onMessage || function () {};
            this.onStatusChange = onStatusChange || function () {};
            this.ws = null;
            this.backoffMs = 500;
            this.heartbeatTimer = null;
            this.closed = false;
            this.connectionState = 'connecting';
            this._connect();
        }

        _connect() {
            if (this.closed) return;
            this._setStatus(this.ws ? 'reconnecting' : 'connecting');

            const proto = location.protocol === 'https:' ? 'wss' : 'ws';
            const url = proto + '://' + location.host + '/api/dwq_game/ws/'
                + encodeURIComponent(this.roomCode)
                + '?token=' + encodeURIComponent(this.token);

            try {
                this.ws = new WebSocket(url);
            } catch (e) {
                console.error('[DwqSocket] failed to construct WS:', e);
                this._scheduleReconnect();
                return;
            }

            this.ws.onopen = () => {
                this.backoffMs = 500;
                this._setStatus('open');
                this._startHeartbeat();
                console.log('[DwqSocket] connected to', this.roomCode);
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.onMessage(msg);
                } catch (e) {
                    console.warn('[DwqSocket] parse error:', e);
                }
            };

            this.ws.onclose = (event) => {
                this._stopHeartbeat();
                console.log('[DwqSocket] closed code=' + event.code + ' reason=' + event.reason);
                if (this.closed) {
                    this._setStatus('closed');
                    return;
                }
                if (event.code >= 4000 && event.code < 5000) {
                    this._setStatus('closed');
                    this.closed = true;
                    return;
                }
                this._scheduleReconnect();
            };

            this.ws.onerror = () => {
                // 由 onclose 處理重連
            };
        }

        _scheduleReconnect() {
            if (this.closed) return;
            this._setStatus('reconnecting');
            setTimeout(() => this._connect(), this.backoffMs);
            this.backoffMs = Math.min(this.backoffMs * 2, 10000);
        }

        _startHeartbeat() {
            this._stopHeartbeat();
            this.heartbeatTimer = setInterval(() => {
                this.send({ type: 'ping' });
            }, 20000);
        }

        _stopHeartbeat() {
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }
        }

        _setStatus(status) {
            if (this.connectionState !== status) {
                this.connectionState = status;
                this.onStatusChange(status);
            }
        }

        send(msg) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify(msg));
                    return true;
                } catch (e) {
                    console.warn('[DwqSocket] send error:', e);
                }
            }
            return false;
        }

        sendAction(action, payload) {
            const reqId = (window.crypto && crypto.randomUUID && crypto.randomUUID())
                || (Date.now() + '-' + Math.random().toString(36).slice(2));
            this.send({ type: 'action', action: action, payload: payload || {}, req_id: reqId });
            return reqId;
        }

        requestState() {
            this.send({ type: 'request_state' });
        }

        close() {
            this.closed = true;
            this._stopHeartbeat();
            if (this.ws) {
                try { this.ws.close(); } catch (e) {}
                this.ws = null;
            }
            this._setStatus('closed');
        }
    }

    window.DwqApp.DwqSocket = DwqSocket;
})();
