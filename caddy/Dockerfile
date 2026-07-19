# Caddy with the Cloudflare DNS plugin — needed for the DNS-01 ACME challenge
# so Let's Encrypt can issue a wildcard cert for a LAN-only deployment
# (nothing inbound is ever exposed; the challenge is outbound-only).
# NOTE: build with the classic builder on the LXC (DOCKER_BUILDKIT=0), same
# rule as the app image.
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
