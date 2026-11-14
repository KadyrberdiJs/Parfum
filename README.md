# Perfume API

NestJS + Prisma + PostgreSQL catalog with users, shops, categories, product variants and JWT sessions.

## Run locally

```sh
yarn install --frozen-lockfile
cp .env.example .env
# Edit DATABASE_URL and generate a random JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Set JWT_SECRET to the generated value.
yarn prisma:generate
yarn prisma migrate deploy
yarn start:dev
```

The API defaults to http://localhost:4001. Use a disposable database for testing. Existing migrations are unchanged; no database migration is required for these application fixes.

Generated Prisma code is ignored by Git, so run `yarn prisma:generate` after installing or changing the schema. Production: `yarn build` then `yarn start:prod`. Compiled entrypoint: `dist/src/main.js`.

## Permissions

Authentication is required by default. Only explicitly `@Public()` routes skip access-token authentication. Refresh/logout still enforce their separate refresh-token guard.

| Endpoint                                    | Access                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `POST /users`, `POST /auth/login`           | Public                                                                       |
| `GET /products`, `/products/:id`            | Public; active products in approved shops                                    |
| `GET /shops`, `/shops/:id`                  | Public; approved shops                                                       |
| `GET /categories`, `/categories/:id`        | Public                                                                       |
| `GET/PATCH /users/me`                       | Current authenticated user                                                   |
| `PATCH /users/me/password`                  | Current user, with current password                                          |
| `GET /users`, `GET/PATCH/DELETE /users/:id` | Super administrator                                                          |
| Shop/product creation, update and deletion  | `ADMIN` or `SUPER_ADMIN`; owner checks apply except for super administrators |
| `GET /shops/manage`, `GET /products/manage` | Own records including pending/drafts; super administrators see all           |
| `PATCH /shops/:id/status`                   | Super administrator; `PENDING`, `APPROVED`, or `SUSPENDED`                   |
| Category creation, update and deletion      | Super administrator                                                          |

New accounts default to `CUSTOMER`. For initial local setup, register your account, then use `yarn prisma studio` to assign its role to `SUPER_ADMIN`. An operator must provision seller roles (`ADMIN`) through trusted database tooling; public requests cannot set roles. Keep role provisioning out of public registration.

Shop creation derives `ownerId` from authentication: do not send it. A new shop is pending until approved. Ordinary product updates cannot change `shopId`.

## Tokens and passwords

Both token types use the same `JWT_SECRET`. Access tokens contain `type: "access"`; refresh tokens contain `type: "refresh"`. Each strategy rejects the wrong or missing type. Previously issued tokens without this claim are rejected: log in again after upgrading.

Send an access token in `Authorization: Bearer <accessToken>` for protected routes. Access tokens last 15 minutes; current account activity and role are read on each authenticated request.

For `POST /auth/refresh` and `POST /auth/logout`, send the **refresh token** in the same Bearer header. Refresh tokens last 30 days, are stored as SHA-256 hashes, and are consumed and replaced in one serializable transaction. Expired/used tokens return 401; simultaneous database conflicts return 409. Clients should serialize refresh calls instead of refreshing in parallel. A replay is rejected without revoking unrelated device sessions; token-family reuse detection is not implemented.

`POST /auth/logout-all` uses an access token and revokes all refresh sessions for that user.

Change a password using:

```http
PATCH /users/me/password
Authorization: Bearer <accessToken>
Content-Type: application/json

{"currentPassword":"old-password","newPassword":"new-password"}
```

The new hash and refresh-session revocation commit together. Existing access tokens may remain usable until their 15-minute expiry. Password updates are rejected on ordinary profile endpoints. New passwords require at least 8 characters and at most 72 UTF-8 bytes (bcrypt's input limit).

## Validation and business rules

- Unknown body/query properties return 400 instead of being silently ignored.
- Lists accept `?page=1&limit=20`; maximum page size is 100. The response remains an array. Category lists paginate roots and include their immediate children, not an entire recursive tree.
- Public product list/detail use the same visibility rules. Management lists include hidden records.
- Products must retain at least one variant. Removing the last variant rolls the update back.
- Category updates reject direct and indirect cycles. Category deletion still cascades through descendants; product references can prevent deletion.
- Shop deletion still cascades through products and variants; it is now owner/admin protected.
- Unique-value conflicts and related-record conflicts have controlled client responses. Transaction conflicts return 409 so clients can retry deliberately.
- Login is limited to 10 attempts per minute per IP in one application process. Multiple replicas need a shared/edge limiter. Configure trusted proxies explicitly before relying on forwarded client IPs.
- HTTP logging excludes request bodies, tokens and query strings.

## Checks

```sh
yarn typecheck
yarn lint
yarn test --runInBand
yarn test:e2e --runInBand
yarn build
```

Unit tests cover ownership, token rotation, password changes, category cycles, guards and DTO validation. HTTP tests boot the real app with real guards/strategies/pipes and a mocked database; they need permission to open a local port. Neither suite proves PostgreSQL transaction rollback or concurrency behavior: test those against a disposable PostgreSQL database before deployment.

No microservices needed: controller receives a request, guards check identity/role, DTOs validate input, services enforce ownership/business rules, Prisma stores the result.
