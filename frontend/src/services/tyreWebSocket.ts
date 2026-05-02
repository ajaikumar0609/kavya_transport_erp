/**
 * Tyre WebSocket Service — Singleton for real-time TPMS data
 * Connects to the backend WebSocket server at /ws using dynamic host resolution
 * (respects VITE_API_URL in production, falls back to window.location.host)
 */

type Callback = (data: any) => void;

class TyreWebSocketService {
  private ws: WebSocket | null = null;
  private subscribers: Map<string, Set<Callback>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSubscriptions: Array<{ type: string; vehicle_id?: number }> = [];
  private _connected = false;

  get connected() {
    return this._connected;
  }

  connect(token: string) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const apiUrl = import.meta.env.VITE_API_URL || '';
    const host = apiUrl ? apiUrl.replace(/^https?:\/\//, '').replace(/\/api\/v1$/, '') : window.location.host;
    const wsUrl = `${protocol}://${host}/ws?token=${encodeURIComponent(token)}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this._connected = true;
      this.dispatch('connection', { status: 'connected' });
      // Re-subscribe all pending
      for (const sub of this.pendingSubscriptions) {
        this.ws?.send(JSON.stringify(sub));
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventType = data.type || 'unknown';
        this.dispatch(eventType, data);
        this.dispatch('*', data);
      } catch {
        // ignore non-JSON messages
      }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.dispatch('connection', { status: 'disconnected' });
      this.reconnectTimer = setTimeout(() => this.connect(token), 5000);
    };

    this.ws.onerror = () => {
      this._connected = false;
      this.dispatch('connection', { status: 'error' });
    };
  }

  subscribeVehicleTyres(vehicleId: number) {
    const msg = { type: 'subscribe_tyre_vehicle', vehicle_id: vehicleId };
    this.pendingSubscriptions = this.pendingSubscriptions.filter(
      s => !(s.type === 'subscribe_tyre_vehicle' && s.vehicle_id === vehicleId)
    );
    this.pendingSubscriptions.push(msg);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  unsubscribeVehicleTyres(vehicleId: number) {
    const msg = { type: 'unsubscribe_tyre_vehicle', vehicle_id: vehicleId };
    this.pendingSubscriptions = this.pendingSubscriptions.filter(
      s => !(s.type === 'subscribe_tyre_vehicle' && s.vehicle_id === vehicleId)
    );
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribeAlerts() {
    const msg = { type: 'subscribe_tyre_alerts' };
    if (!this.pendingSubscriptions.some(s => s.type === 'subscribe_tyre_alerts')) {
      this.pendingSubscriptions.push(msg);
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(eventType: string, callback: Callback): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(callback);
    return () => {
      this.subscribers.get(eventType)?.delete(callback);
    };
  }

  private dispatch(eventType: string, data: any) {
    this.subscribers.get(eventType)?.forEach(cb => {
      try { cb(data); } catch { /* ignore callback errors */ }
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.pendingSubscriptions = [];
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }
}

export const tyreWS = new TyreWebSocketService();
