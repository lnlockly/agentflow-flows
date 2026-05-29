# AgentFlow Flows subdomain (SEAM 2)

Production overlay that serves the rebranded activepieces app at
`flows.agentflow.website` and lets a logged-in cabinet user land there
**already authenticated** via an SSO redirect (not an iframe).

## What this adds

| Resource | Role |
|---|---|
| `flows-sso-handoff` (ConfigMap + Deployment + Service) | A 2-replica nginx serving one static page (`/sso-handoff`). It reads a fresh activepieces USER token from the URL **fragment**, writes it to `localStorage` (`token` + `projectId`), and redirects into the SPA. |
| `flows-public` (Ingress) | `flows.agentflow.website`: `/sso-handoff` → handoff app, `/` → `activepieces` Service. Carries the rebrand `sub_filter` snippet. |

It does **not** touch the live `activepieces` Deployment/Service/ConfigMap — those keep running the upstream CE image (`ghcr.io/activepieces/activepieces:0.83.0`).

## The SSO redirect flow (no iframe)

```
Cabinet user clicks "Автоматизации (Flows)"
  → landing calls  POST /me/flows/sso   (agentflow-agents)
       provisions / re-signs-in an AP user, returns { jwt, apProjectId, publicUrl }
  → landing redirects the browser to
       https://flows.agentflow.website/sso-handoff#token=<jwt>&projectId=<apProjectId>
  → handoff page writes localStorage.token / localStorage.projectId, redirects to /
  → AP SPA's AllowOnlyLoggedInUserOnlyGuard sees a valid token → dashboard.
```

The token travels in the URL **fragment**, so it is never sent to the server or written to access logs.

## Deploy

1. **DNS** (Cloudflare, DNS-only / grey-cloud):
   `flows.agentflow.website  A  144.217.65.94`
2. **Apply:** `kubectl -n franchise-factory apply -f flows-subdomain.yaml`
   cert-manager issues `flows-agentflow-tls` via `letsencrypt-prod` (HTTP-01).
3. **AP config:** point AP at the public host so it emits correct absolute URLs:
   `kubectl -n franchise-factory set env configmap/activepieces-config AP_FRONTEND_URL=https://flows.agentflow.website`
   then `kubectl -n franchise-factory rollout restart deploy/activepieces`.
4. **agentflow-agents env** (see agentflow-agents PR): `FF_ACTIVEPIECES_ENABLED=1`,
   `AP_PUBLIC_URL=https://flows.agentflow.website`, `AP_PLATFORM_ID=KlKlwWZ3P35JbzAdzdwws`,
   `AP_ADMIN_JWT` (spike-bot USER JWT, via secret `activepieces-admin-jwt`).

## Rebrand

CE has no branding env (logo/name are EE-gated). The `flows-public` Ingress
carries a `sub_filter` snippet that rewrites the visible `Activepieces` string
→ `AgentFlow Flows` and the document title at the reverse proxy. Reversible
(drop the snippet) and upgrade-safe (string match, not a code patch). The
handoff page is fully AgentFlow-branded already.

## Rollback

`kubectl -n franchise-factory delete -f flows-subdomain.yaml` and re-point the
cabinet nav. The live `activepieces` workload is untouched.
