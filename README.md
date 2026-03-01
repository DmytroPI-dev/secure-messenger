# Messenger Deployment Notes

This project is wired for the following production topology:

- Frontend: `https://weather.black-sea.org`
- WebSocket signaling: `wss://weather.black-sea.org/ws`
- Backend: `http://127.0.0.1:8080`
- TURN over TLS: `turns:turn.black-sea.org:443?transport=tcp`

## App status

The frontend and backend build successfully in the current repository.

Production assumptions in code:

- The frontend connects to `/ws` on the same origin.
- The backend accepts WebSocket origins from `http://localhost:5173` and `https://weather.black-sea.org`.
- WebRTC is configured for TURN relay only and expects TURN TLS to be reachable on `turn.black-sea.org`.

## Required VPS layout

1. Nginx HTTP must serve the frontend on `127.0.0.1:8443` via the site config in [oracle-configs/weather](oracle-configs/weather).
2. Nginx stream routing must listen on public `443` and route by SNI using [oracle-configs/nginx.conf](oracle-configs/nginx.conf):
	`weather.black-sea.org -> 127.0.0.1:8443`
	`turn.black-sea.org -> 127.0.0.1:5349`
3. Coturn must use the config in [oracle-configs/turnserver.conf](oracle-configs/turnserver.conf).
4. The backend systemd unit should match [oracle-configs/messenger-backend.service](oracle-configs/messenger-backend.service).

## Local deploy script

[local-deploy.sh](local-deploy.sh) now:

- builds backend and frontend locally;
- uploads artifacts to the AlexHost VM;
- installs the backend to `/usr/local/bin/messenger-backend`;
- deploys the frontend to `/var/www/weather`;
- restarts `messenger-backend` and reloads nginx;
- verifies `http://127.0.0.1:8080/health` after restart.

Override defaults with environment variables when needed:

```bash
REMOTE_HOST=176.123.3.245 \
REMOTE_USER=root \
SSH_KEY=$HOME/.ssh/black_sea_key \
VITE_TURN_SERVER=turn.black-sea.org \
VITE_TURN_USERNAME=messenger \
VITE_TURN_PASSWORD=your-password \
./local-deploy.sh
```

## Current live VM gap

The current VM is not yet exposing public `443` for either hostname. At the time of verification:

- nginx was serving the weather site on `8443` only;
- coturn was listening on `3478` only;
- the live `/etc/turnserver.conf` was still the stock config, so TLS TURN was not active.

Until the nginx stream router and coturn TLS config are applied on the VM, the frontend can deploy successfully but TURN calls will not work as intended.
